-- Execute após 004_user_management.sql. Valores em reais; comissão fixa por venda.
begin;
alter table public.leads add column if not exists sale_amount numeric(11,2);
create table if not exists public.sales (
 lead_id uuid primary key references public.leads(id),
 seller_id uuid not null references public.profiles(id),
 amount numeric(11,2) not null check(amount>0),
 commission numeric(11,2) not null default 20 check(commission=20),
 sold_at timestamptz not null default now(),
 cancelled_at timestamptz
);
alter table public.sales enable row level security;
revoke all on public.sales from anon,authenticated;
grant select on public.sales to authenticated;
drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select to authenticated using(public.is_active_user() and (public.is_admin() or seller_id=auth.uid()));
drop function if exists public.save_lead(uuid,public.lead_status,text,timestamptz,text,timestamptz);
create or replace function public.save_lead(p_id uuid,p_status public.lead_status,p_notes text,p_follow_up timestamptz default null,p_source text default null,p_expected_updated_at timestamptz default null,p_sale_amount numeric default null) returns void language plpgsql security definer set search_path = '' as $$
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
 if not public.is_active_user() then raise exception 'Acesso indisponível.'; end if;
 if p_status='sold' and (p_sale_amount is null or p_sale_amount<=0 or p_sale_amount>999999999.99 or p_sale_amount::text in ('NaN','Infinity','-Infinity') or p_sale_amount<>round(p_sale_amount,2)) then raise exception 'Informe o valor da venda, maior que zero, com até duas casas decimais.'; end if;
 if p_status='sold' and item.assigned_to is null then raise exception 'Atribua o lead a um vendedor antes de registrar a venda.'; end if;
 update public.leads set sale_amount=case when p_status='sold' then p_sale_amount else null end,status=p_status,notes=coalesce(p_notes,''),
  follow_up_at=case when p_status='follow_up' then p_follow_up else null end,
  source=case when admin then coalesce(nullif(p_source,''),source) else source end,
  assigned_to=case when p_status='no_response' then null else assigned_to end,
  returned_at=case when p_status='no_response' then coalesce(returned_at,now()) else returned_at end
 where id=p_id;
 if p_status='sold' then
  insert into public.sales(lead_id,seller_id,amount,commission,sold_at,cancelled_at)
  values(p_id,item.assigned_to,p_sale_amount,20,now(),null)
  on conflict(lead_id) do update set amount=excluded.amount,seller_id=excluded.seller_id,
   sold_at=case when sales.cancelled_at is not null then now() else sales.sold_at end,cancelled_at=null;
 else
  update public.sales set cancelled_at=coalesce(cancelled_at,now()) where lead_id=p_id;
 end if;
 if p_status in ('no_response','sold','lost') then update public.assignments set ended_at=now() where lead_id=p_id and ended_at is null; end if;
end;
$$;
revoke all on function public.save_lead(uuid,public.lead_status,text,timestamptz,text,timestamptz,numeric) from public,anon;
grant execute on function public.save_lead(uuid,public.lead_status,text,timestamptz,text,timestamptz,numeric) to authenticated;
create or replace function public.finance_summary() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_active_user() then raise exception 'Acesso indisponível.'; end if;
 select jsonb_build_object(
  'revenue',coalesce(sum(amount),0),'commission',coalesce(sum(commission),0),'sales',count(*),
  'sellers',coalesce((select jsonb_agg(row_to_json(t)) from (
   select s.seller_id,p.full_name,count(*) sales,sum(s.amount) revenue,sum(s.commission) commission
   from public.sales s join public.profiles p on p.id=s.seller_id
   where s.cancelled_at is null and (public.is_admin() or s.seller_id=auth.uid())
   group by s.seller_id,p.full_name order by p.full_name,s.seller_id
  )t),'[]'::jsonb),
  'legacy_sales',(select count(*) from public.leads l where l.status='sold' and l.sale_amount is null and (public.is_admin() or l.assigned_to=auth.uid()))
 ) into result from public.sales where cancelled_at is null and (public.is_admin() or seller_id=auth.uid());
 return result;
end; $$;
revoke all on function public.finance_summary() from public,anon;
grant execute on function public.finance_summary() to authenticated;
commit;
notify pgrst,'reload schema';
