begin;
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
