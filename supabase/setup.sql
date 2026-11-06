-- TechVendas: instalação inicial em projeto vazio. Sem usuários ou leads fictícios.
-- Consolida migrações 001 a 004.
begin;

create type public.app_role as enum ('admin','attendant');
create type public.lead_status as enum ('pending','contacted','interested','follow_up','no_response','sold','lost');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 role public.app_role not null default 'attendant',
 created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create table public.batches (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references public.profiles(id),
 attendant_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.leads (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 phone text not null unique check (phone ~ '^55[0-9]{10,11}$'),
 source text not null default 'Outro / não informado',
 campaign text,
 source_date timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 status public.lead_status not null default 'pending',
 assigned_to uuid references public.profiles(id),
 batch_id uuid references public.batches(id),
 returned_at timestamptz,
 follow_up_at timestamptz,
 notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.assignments (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.leads(id),
 batch_id uuid not null references public.batches(id),
 attendant_id uuid not null references public.profiles(id),
 assigned_by uuid not null references public.profiles(id),
 assigned_at timestamptz not null default now(),
 ended_at timestamptz
);
create unique index one_active_assignment on public.assignments(lead_id) where ended_at is null;
create table public.lead_history (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.leads(id),
 actor_id uuid not null references public.profiles(id),
 old_status public.lead_status,
 new_status public.lead_status not null,
 notes text not null default '',
 created_at timestamptz not null default now()
);
create index leads_status on public.leads(status);
create index leads_attendant on public.leads(assigned_to);
create index leads_batch on public.leads(batch_id);
create index history_lead_time on public.lead_history(lead_id,created_at desc);
create index history_actor_time on public.lead_history(actor_id,created_at desc);
create index assignments_attendant on public.assignments(attendant_id);
create function public.audit_lead() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 new.updated_at=now();
 if new.status is distinct from old.status or new.notes is distinct from old.notes then
  insert into public.lead_history(lead_id,actor_id,old_status,new_status,notes)
  values(new.id,auth.uid(),old.status,new.status,new.notes);
 end if;
 return new;
end;
$$;
create trigger audit_lead before update on public.leads for each row execute function public.audit_lead();
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.batches enable row level security;
alter table public.assignments enable row level security;
alter table public.lead_history enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profiles_admin on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy leads_read on public.leads for select to authenticated using(public.is_admin() or assigned_to=auth.uid());
create policy leads_admin on public.leads for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy batches_read on public.batches for select to authenticated using(public.is_admin() or attendant_id=auth.uid());
create policy batches_admin on public.batches for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy assignments_read on public.assignments for select to authenticated using(public.is_admin() or attendant_id=auth.uid());
create policy assignments_admin on public.assignments for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy history_read on public.lead_history for select to authenticated using(public.is_admin() or exists(select 1 from public.leads where id=lead_id and assigned_to=auth.uid()));
-- Attendant mutations will use scoped RPCs in later stages; direct writes are denied.
revoke all on public.profiles,public.leads,public.batches,public.assignments,public.lead_history from anon;
grant select,insert,update,delete on public.profiles,public.leads,public.batches,public.assignments to authenticated;
grant select on public.lead_history to authenticated;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.audit_lead() from public;

alter table public.lead_history add column event_type text not null default 'update';
alter table public.lead_history add column batch_id uuid references public.batches(id);
alter table public.lead_history add column old_assigned_to uuid references public.profiles(id);
alter table public.lead_history add column new_assigned_to uuid references public.profiles(id);
-- All mutations go through narrow, authenticated functions. The UI is not a security boundary.
drop policy leads_admin on public.leads;
drop policy batches_admin on public.batches;
drop policy assignments_admin on public.assignments;
revoke insert,update,delete on public.leads,public.batches,public.assignments from authenticated;
create or replace function public.audit_lead() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 new.updated_at=now();
 if row(new.status,new.notes,new.assigned_to,new.follow_up_at,new.source) is distinct from row(old.status,old.notes,old.assigned_to,old.follow_up_at,old.source) then
  insert into public.lead_history(lead_id,actor_id,old_status,new_status,notes,event_type,batch_id,old_assigned_to,new_assigned_to)
  values(new.id,auth.uid(),old.status,new.status,new.notes,
    case when new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then 'assignment'
      when row(new.status,new.notes,new.follow_up_at) is distinct from row(old.status,old.notes,old.follow_up_at) then 'update' else 'metadata' end,
    new.batch_id,old.assigned_to,new.assigned_to);
 end if;
 return new;
end;
$$;
create function public.import_leads(p_rows jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int; imported int:=0; duplicates int:=0; invalid int:=0; v_phone text;
begin
 if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>5000 then raise exception 'Envie até 5000 registros por importação.'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  v_phone=regexp_replace(coalesce(r->>'phone',''),'[^0-9]','','g');
  if length(v_phone) in (10,11) then v_phone='55'||v_phone; end if;
  if v_phone !~ '^55[1-9][0-9][2-9][0-9]{7,8}$' or length(trim(coalesce(r->>'name','')))=0 then invalid=invalid+1; continue; end if;
  begin
   insert into public.leads(name,phone,source,campaign,source_date,metadata)
   values(left(trim(r->>'name'),200),v_phone,coalesce(nullif(trim(r->>'source'),''),'Outro / não informado'),nullif(r->>'campaign',''),nullif(r->>'source_date','')::timestamptz,coalesce(r->'metadata','{}'::jsonb))
   on conflict (phone) do nothing;
   get diagnostics n=row_count;
   if n=0 then duplicates=duplicates+1; else imported=imported+1; end if;
  exception when invalid_datetime_format or datetime_field_overflow then invalid=invalid+1;
  end;
 end loop;
 return jsonb_build_object('imported',imported,'duplicates',duplicates,'invalid',invalid);
end;
$$;
create function public.release_leads(p_attendant uuid,p_quantity int default 50,p_ids uuid[] default null,p_returned boolean default false) returns jsonb language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; batch uuid; n int;
begin
 if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>50 then raise exception 'Escolha uma quantidade entre 1 e 50.'; end if;
 if not exists(select 1 from public.profiles where id=p_attendant and role='attendant') then raise exception 'Selecione uma atendente válida.'; end if;
 if p_returned and p_ids is null then raise exception 'Selecione os leads devolvidos para autorizar uma nova liberação.'; end if;
 if p_ids is not null and (cardinality(p_ids)>50 or cardinality(p_ids)>p_quantity) then raise exception 'Selecione até a quantidade informada, no máximo 50 leads.'; end if;
 select array_agg(id) into ids from (
  select id from public.leads where assigned_to is null
   and ((not p_returned and returned_at is null and status='pending') or (p_returned and returned_at is not null and status='no_response'))
   and (p_ids is null or id=any(p_ids))
  order by created_at,id limit p_quantity for update skip locked
 ) available;
 n=coalesce(cardinality(ids),0);
 if n=0 then return jsonb_build_object('released',0,'batch_id',null); end if;
 insert into public.batches(created_by,attendant_id) values(auth.uid(),p_attendant) returning id into batch;
 update public.leads set assigned_to=p_attendant,batch_id=batch,status='pending',returned_at=null,follow_up_at=null where id=any(ids);
 insert into public.assignments(lead_id,batch_id,attendant_id,assigned_by) select unnest(ids),batch,p_attendant,auth.uid();
 return jsonb_build_object('released',n,'batch_id',batch);
end;
$$;
create function public.save_lead(p_id uuid,p_status public.lead_status,p_notes text,p_follow_up timestamptz default null,p_source text default null,p_expected_updated_at timestamptz default null) returns void language plpgsql security definer set search_path = '' as $$
declare item public.leads; admin boolean:=public.is_admin();
begin
 select * into item from public.leads where id=p_id for update;
 if not found or auth.uid() is null or (not admin and (item.assigned_to is distinct from auth.uid() or item.status in ('sold','lost'))) then raise exception 'Lead indisponível para edição.'; end if;
 if p_status is null then raise exception 'Informe o status.'; end if;
 if p_expected_updated_at is not null and item.updated_at<>p_expected_updated_at then raise exception 'Este lead foi alterado por outra pessoa. Atualize a lista e tente novamente.'; end if;
 if p_status='follow_up' and p_follow_up is null then raise exception 'Informe a data e o horário do retorno.'; end if;
 if length(coalesce(p_notes,''))>10000 then raise exception 'A observação pode ter até 10000 caracteres.'; end if;
 if not admin and p_source is not null and p_source<>item.source then raise exception 'Apenas o administrador altera a origem.'; end if;
 if item.assigned_to is null and p_status not in ('sold','lost') and not (item.status='no_response' and p_status='no_response') and p_status<>'pending' then raise exception 'Libere o lead para uma atendente antes de iniciar o atendimento.'; end if;
 if item.returned_at is not null and p_status not in ('no_response','sold','lost') then raise exception 'Use a nova liberação para trabalhar um lead devolvido.'; end if;
 update public.leads set status=p_status,notes=coalesce(p_notes,''),
  follow_up_at=case when p_status='follow_up' then p_follow_up else null end,
  source=case when admin then coalesce(nullif(p_source,''),source) else source end,
  assigned_to=case when p_status='no_response' then null else assigned_to end,
  returned_at=case when p_status='no_response' then coalesce(returned_at,now()) else returned_at end
 where id=p_id;
 if p_status in ('no_response','sold','lost') then update public.assignments set ended_at=now() where lead_id=p_id and ended_at is null; end if;
end;
$$;
create function public.transfer_lead(p_id uuid,p_attendant uuid,p_expected_updated_at timestamptz) returns void language plpgsql security definer set search_path = '' as $$
declare item public.leads; v_batch uuid;
begin
 if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
 if not exists(select 1 from public.profiles where id=p_attendant and role='attendant') then raise exception 'Selecione uma atendente válida.'; end if;
 select * into item from public.leads where id=p_id for update;
 if not found or item.assigned_to is null or item.status in ('no_response','sold','lost') then raise exception 'Somente leads ativos podem ser reatribuídos.'; end if;
 if item.updated_at is distinct from p_expected_updated_at then raise exception 'Este lead foi alterado. Atualize a lista.'; end if;
 if item.assigned_to=p_attendant then return; end if;
 insert into public.batches(created_by,attendant_id) values(auth.uid(),p_attendant) returning id into v_batch;
 update public.assignments set ended_at=now() where lead_id=p_id and ended_at is null;
 update public.leads set assigned_to=p_attendant,batch_id=v_batch where id=p_id;
 insert into public.assignments(lead_id,batch_id,attendant_id,assigned_by) values(p_id,v_batch,p_attendant,auth.uid());
end;
$$;
create index leads_available on public.leads(created_at,id) where assigned_to is null and returned_at is null and status='pending';
create index leads_updated on public.leads(updated_at);
revoke all on function public.transfer_lead(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.transfer_lead(uuid,uuid,timestamptz) to authenticated;
-- This function runs as the caller, so RLS applies to every aggregate.
create function public.dashboard(p_since timestamptz default null,p_until timestamptz default null,p_batch uuid default null,p_status public.lead_status default null) returns jsonb language sql stable security invoker set search_path = '' as $$
 with filtered as (
  select * from public.leads where (p_batch is null or batch_id=p_batch) and (p_status is null or status=p_status)
 ), activity as (
  select h.* from public.lead_history h join filtered l on l.id=h.lead_id
  where h.event_type='update' and (p_since is null or h.created_at>=p_since) and (p_until is null or h.created_at<p_until)
 ), totals as (
  select status,count(*) as total from filtered group by status
 )
 select jsonb_build_object(
  'total',(select count(*) from filtered),
  'stock',(select count(*) from filtered where assigned_to is null and returned_at is null and status='pending'),
  'assigned',(select count(*) from filtered where assigned_to is not null and status not in ('sold','lost')),
  'statuses',coalesce((select jsonb_object_agg(status,total) from totals),'{}'::jsonb),
  'worked',(select count(distinct lead_id) from activity),
  'worked_today',(select count(distinct h.lead_id) from public.lead_history h join filtered l on l.id=h.lead_id where h.event_type='update' and h.created_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
  'worked_week',(select count(distinct h.lead_id) from public.lead_history h join filtered l on l.id=h.lead_id where h.event_type='update' and h.created_at>=now()-interval '7 days'),
  'sales',(select count(distinct lead_id) from activity where new_status='sold' and old_status is distinct from new_status)
 );
$$;
revoke all on function public.import_leads(jsonb),public.release_leads(uuid,int,uuid[],boolean),public.save_lead(uuid,public.lead_status,text,timestamptz,text,timestamptz),public.dashboard(timestamptz,timestamptz,uuid,public.lead_status) from public,anon;
grant execute on function public.import_leads(jsonb),public.release_leads(uuid,int,uuid[],boolean),public.save_lead(uuid,public.lead_status,text,timestamptz,text,timestamptz),public.dashboard(timestamptz,timestamptz,uuid,public.lead_status) to authenticated;

alter table public.assignments add column if not exists end_reason text;

create or replace function public.audit_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 new.updated_at=now();
 if row(new.status,new.notes,new.assigned_to,new.follow_up_at,new.source) is distinct from row(old.status,old.notes,old.assigned_to,old.follow_up_at,old.source) then
  insert into public.lead_history(lead_id,actor_id,old_status,new_status,notes,event_type,batch_id,old_assigned_to,new_assigned_to)
  values(new.id,auth.uid(),old.status,new.status,new.notes,
   case
    when new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then 'assignment'
    when old.assigned_to is not null and new.assigned_to is null and new.status='pending' and new.batch_id is null then 'recall'
    when row(new.status,new.notes,new.follow_up_at) is distinct from row(old.status,old.notes,old.follow_up_at) then 'update'
    else 'metadata'
   end,
   coalesce(new.batch_id,old.batch_id),old.assigned_to,new.assigned_to);
 end if;
 return new;
end;
$$;

create or replace function public.seller_batches(p_seller uuid,p_offset int default 0,p_limit int default 20)
returns table(batch_id uuid,created_at timestamptz,total bigint,active bigint,recalled bigint,transferred bigint,statuses jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
 if not exists(select 1 from public.profiles where id=p_seller and role='attendant') then raise exception 'Selecione um vendedor válido.'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Paginação inválida.'; end if;
 return query
 select b.id,b.created_at,
  count(*) as total,
  count(*) filter(where a.ended_at is null and l.assigned_to=p_seller and l.batch_id=b.id and l.status not in ('sold','lost','no_response')) as active,
  count(*) filter(where a.end_reason='recalled') as recalled,
  count(*) filter(where a.end_reason is distinct from 'recalled' and (l.batch_id is distinct from b.id or (l.assigned_to is not null and l.assigned_to<>p_seller))) as transferred,
  coalesce((
   select jsonb_object_agg(s.status,s.amount) from (
    select current_lead.status,count(*) as amount
    from public.assignments original
    join public.leads current_lead on current_lead.id=original.lead_id
    where original.batch_id=b.id and original.attendant_id=p_seller
     and original.end_reason is distinct from 'recalled'
     and current_lead.batch_id=b.id
     and (current_lead.assigned_to=p_seller or (current_lead.assigned_to is null and current_lead.status='no_response'))
    group by current_lead.status
   ) s
  ),'{}'::jsonb) as statuses
 from public.batches b
 join public.assignments a on a.batch_id=b.id and a.attendant_id=p_seller
 join public.leads l on l.id=a.lead_id
 group by b.id,b.created_at
 order by b.created_at desc,b.id desc
 limit p_limit offset p_offset;
end;
$$;

create or replace function public.recall_batch(p_batch uuid,p_seller uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_count int;
begin
 if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
 if not exists(select 1 from public.profiles where id=p_seller and role='attendant') then raise exception 'Selecione um vendedor válido.'; end if;
 select array_agg(locked.id) into v_ids from (
  select l.id from public.leads l
  where l.batch_id=p_batch and l.assigned_to=p_seller and l.status not in ('sold','lost','no_response')
  order by l.id for update of l
 ) locked;
 v_count=coalesce(cardinality(v_ids),0);
 if v_count=0 then return jsonb_build_object('recalled',0); end if;
 update public.assignments set ended_at=now(),end_reason='recalled'
 where lead_id=any(v_ids) and batch_id=p_batch and attendant_id=p_seller and ended_at is null;
 update public.leads set assigned_to=null,batch_id=null,status='pending',returned_at=null where id=any(v_ids);
 return jsonb_build_object('recalled',v_count);
end;
$$;

revoke all on function public.seller_batches(uuid,int,int),public.recall_batch(uuid,uuid) from public,anon;
grant execute on function public.seller_batches(uuid,int,int),public.recall_batch(uuid,uuid) to authenticated;

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
update public.profiles p set auth_user_id=p.id where p.auth_user_id is null and p.deleted_at is null and exists(select 1 from auth.users u where u.id=p.id);
update public.profiles p set username=lower(split_part(u.email,'@',1)) from auth.users u where u.id=p.id and p.username is null and lower(u.email) like '%@techvendas.invalid';
drop index if exists public.profiles_username_unique;
create unique index profiles_username_unique on public.profiles(lower(username)) where username is not null and deleted_at is null;
alter table public.profiles drop constraint if exists profiles_id_fkey;
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and auth_user_id=auth.uid() and is_active and deleted_at is null);
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and auth_user_id=auth.uid() and role='admin' and is_active and deleted_at is null);
$$;
revoke all on function public.is_active_user() from public,anon;
grant execute on function public.is_active_user() to authenticated;
drop policy if exists profiles_admin on public.profiles;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(public.is_admin() or (id=auth.uid() and public.is_active_user()));
revoke insert,update,delete on public.profiles from authenticated;
drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select to authenticated using(public.is_admin() or (assigned_to=auth.uid() and public.is_active_user()));
drop policy if exists batches_read on public.batches;
create policy batches_read on public.batches for select to authenticated using(public.is_admin() or (attendant_id=auth.uid() and public.is_active_user()));
drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated using(public.is_admin() or (attendant_id=auth.uid() and public.is_active_user()));
drop policy if exists history_read on public.lead_history;
create policy history_read on public.lead_history for select to authenticated using(public.is_admin() or (public.is_active_user() and exists(select 1 from public.leads where id=lead_id and assigned_to=auth.uid())));
create or replace function public.check_active_lead_access() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient public.profiles;
begin
 if auth.uid() is not null and not public.is_active_user() then raise exception 'Acesso desativado.'; end if;
 if new.assigned_to is not null and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then
  select * into recipient from public.profiles where id=new.assigned_to for share;
  if not found or not recipient.is_active or recipient.deleted_at is not null or recipient.role<>'attendant' or recipient.auth_user_id is null then raise exception 'Vendedor indisponível para receber contatos.'; end if;
 end if;
 return new;
end;
$$;
drop trigger if exists check_active_lead_access on public.leads;
create trigger check_active_lead_access before insert or update on public.leads for each row execute function public.check_active_lead_access();
revoke all on function public.check_active_lead_access() from public,anon,authenticated;
create or replace function public.admin_save_user(p_id uuid,p_username text,p_name text,p_role public.app_role,p_active boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.profiles; v_username text:=lower(trim(p_username));
begin
 if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
 perform pg_advisory_xact_lock(73190426);
 if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
 if v_username is null or v_username !~ '^[a-z][a-z0-9._-]{2,31}$' then raise exception 'Nome de usuário inválido.'; end if;
 if p_name is null or length(trim(p_name))<1 or length(trim(p_name))>100 or p_role is null or p_active is null then raise exception 'Dados do usuário inválidos.'; end if;
 select * into existing from public.profiles where id=p_id for update;
 if found and existing.deleted_at is not null then raise exception 'Este usuário já foi excluído.'; end if;
 if p_id=auth.uid() and (p_role<>'admin' or not p_active) then raise exception 'Você não pode remover seu próprio acesso administrativo.'; end if;
 if existing.role='admin' and existing.is_active and (p_role<>'admin' or not p_active) and (select count(*) from public.profiles where role='admin' and is_active and deleted_at is null)<=1 then raise exception 'Mantenha pelo menos um administrador ativo.'; end if;
 if existing.role='attendant' and p_role<>'attendant' and exists(select 1 from public.leads where assigned_to=p_id and status not in ('sold','lost','no_response')) then raise exception 'Retire os lotes ativos antes de alterar o perfil do vendedor.'; end if;
 if not p_active and exists(select 1 from public.leads where assigned_to=p_id and status not in ('sold','lost','no_response')) then raise exception 'Retire os lotes ativos antes de desativar o vendedor.'; end if;
 if not exists(select 1 from auth.users where id=p_id and lower(email)=v_username||'@techvendas.invalid') then raise exception 'O cadastro de autenticação não corresponde ao usuário.'; end if;
 insert into public.profiles(id,auth_user_id,username,full_name,role,is_active) values(p_id,p_id,v_username,trim(p_name),p_role,p_active)
 on conflict(id) do update set username=excluded.username,full_name=excluded.full_name,role=excluded.role,is_active=excluded.is_active;
 return jsonb_build_object('id',p_id,'username',v_username,'full_name',trim(p_name),'role',p_role,'is_active',p_active);
end;
$$;
create or replace function public.admin_archive_user(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.profiles; ids uuid[]; n int;
begin
 if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
 perform pg_advisory_xact_lock(73190426);
 if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
 if p_id=auth.uid() then raise exception 'Você não pode excluir seu próprio acesso.'; end if;
 select * into target from public.profiles where id=p_id for update;
 if not found then raise exception 'Usuário não encontrado.'; end if;
 if target.deleted_at is not null then return jsonb_build_object('auth_user_id',target.auth_user_id,'returned',0); end if;
 if target.role='admin' and target.is_active and (select count(*) from public.profiles where role='admin' and is_active and deleted_at is null)<=1 then raise exception 'Mantenha pelo menos um administrador ativo.'; end if;
 select array_agg(l.id) into ids from (select id from public.leads where assigned_to=p_id and status not in ('sold','lost','no_response') order by id for update) l;
 n=coalesce(cardinality(ids),0);
 update public.assignments set ended_at=now(),end_reason='deleted_user' where lead_id=any(ids) and ended_at is null;
 update public.leads set assigned_to=null,batch_id=null,status='pending',returned_at=null where id=any(ids);
 update public.profiles set is_active=false,deleted_at=now() where id=p_id;
 return jsonb_build_object('auth_user_id',target.auth_user_id,'returned',n);
end;
$$;
revoke all on function public.admin_save_user(uuid,text,text,public.app_role,boolean),public.admin_archive_user(uuid) from public,anon;
grant execute on function public.admin_save_user(uuid,text,text,public.app_role,boolean),public.admin_archive_user(uuid) to authenticated;
commit;
notify pgrst,'reload schema';
