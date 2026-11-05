begin;

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
commit;
notify pgrst, 'reload schema';
