-- Execute no SQL Editor depois de criar os dois usuários em Authentication.
-- Substitua apenas os dois nomes de usuário abaixo. Não coloque senhas neste arquivo.
do $$
declare
 admin_username text := 'SUBSTITUA_USUARIO_ADMIN';
 attendant_username text := 'SUBSTITUA_USUARIO_ATENDENTE';
 admin_id uuid;
 attendant_id uuid;
begin
 admin_username=lower(trim(admin_username));
 attendant_username=lower(trim(attendant_username));
 if admin_username !~ '^[a-z][a-z0-9._-]{2,31}$' or attendant_username !~ '^[a-z][a-z0-9._-]{2,31}$' or admin_username=attendant_username then
  raise exception 'Informe dois usuários diferentes, de 3 a 32 caracteres, começando com uma letra.';
 end if;
 select id into admin_id from auth.users where lower(email)=admin_username||'@techvendas.invalid';
 select id into attendant_id from auth.users where lower(email)=attendant_username||'@techvendas.invalid';
 if admin_id is null or attendant_id is null then
  raise exception 'Crie os dois usuários em Authentication antes de provisionar os perfis.';
 end if;
 insert into public.profiles(id,full_name,role) values
 (admin_id,'Administrador','admin'),(attendant_id,'Atendente','attendant')
 on conflict(id) do update set role=excluded.role;
end;
$$;
