-- Diagnóstico seguro: não altera usuários ou leads.
notify pgrst, 'reload schema';
select
 to_regclass('public.profiles') as perfis,
 to_regclass('public.leads') as leads,
 to_regclass('public.lead_history') as historico;
select routine_name from information_schema.routines
where routine_schema='public'
and routine_name in ('import_leads','release_leads','save_lead','transfer_lead','dashboard','seller_batches','recall_batch')
order by routine_name;
