-- Após 007_support.sql. Ranking compartilha somente nome, foto e quantidade de vendas.
begin;
create or replace function public.seller_ranking(p_from timestamptz,p_until timestamptz,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_active_user() then raise exception 'Acesso indisponível.'; end if;
 if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until) or p_from>=p_until then raise exception 'Informe um período válido.'; end if;
 with scores as (
  select p.id,p.full_name,p.avatar_url,(not p.is_active or p.deleted_at is not null) archived,
   count(s.lead_id) total_sales,
   count(s.lead_id) filter(where s.sold_at>=p_from and s.sold_at<p_until) period_sales
  from public.profiles p left join public.sales s on s.seller_id=p.id and s.cancelled_at is null
  where p.role='attendant' or exists(select 1 from public.sales x where x.seller_id=p.id)
  group by p.id
 ), ranked as (
  select *,dense_rank() over(order by period_sales desc) position from scores
  where not archived or period_sales>0 or id=auth.uid()
 )
 select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(row_to_json(x)) from (select * from ranked order by period_sales desc,full_name,id limit 30 offset greatest(0,least(p_offset,1000000))) x),'[]'::jsonb),
  'total_sellers',(select count(*) from ranked),
  'period_sales',(select coalesce(sum(period_sales),0) from ranked),
  'self',(select row_to_json(x) from ranked x where id=auth.uid())
 ) into result;
 return result;
end; $$;
revoke all on function public.seller_ranking(timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.seller_ranking(timestamptz,timestamptz,integer) to authenticated;
commit;
notify pgrst,'reload schema';
