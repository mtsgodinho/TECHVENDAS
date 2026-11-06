-- Após 005_finance.sql. Edição do próprio perfil, sem alterar permissões.
begin;
alter table public.profiles add column if not exists avatar_url text;
create or replace function public.update_my_profile(p_full_name text,p_avatar_url text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_user() then raise exception 'Acesso indisponível.'; end if;
 if p_full_name is null or length(trim(p_full_name)) not between 1 and 100 then raise exception 'Informe um nome de até 100 caracteres.'; end if;
 if p_avatar_url is not null and (length(p_avatar_url)>65000 or p_avatar_url !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$') then raise exception 'Foto inválida. Selecione uma imagem menor.'; end if;
 update public.profiles set full_name=trim(p_full_name),avatar_url=p_avatar_url where id=auth.uid() and is_active and deleted_at is null;
end; $$;
revoke all on function public.update_my_profile(text,text) from public,anon;
grant execute on function public.update_my_profile(text,text) to authenticated;
commit;
notify pgrst,'reload schema';
