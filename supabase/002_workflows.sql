begin;
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
commit;
