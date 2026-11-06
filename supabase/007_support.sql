-- Execute após 006_self_profile.sql.
begin;
create table if not exists public.support_threads (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.profiles(id),
 status text not null default 'open' check(status in ('open','closed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 closed_at timestamptz,closed_by uuid references public.profiles(id),admin_seen bigint not null default 0,seller_seen bigint not null default 0
);
create unique index if not exists support_one_open on public.support_threads(seller_id) where status='open';
create table if not exists public.support_messages (
 id bigint generated always as identity primary key,thread_id uuid not null references public.support_threads(id),
 sender_id uuid not null references public.profiles(id),body text not null check(length(trim(body)) between 1 and 2000),created_at timestamptz not null default now()
);
create index if not exists support_messages_thread on public.support_messages(thread_id,id);
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_threads,public.support_messages from anon,authenticated;
grant select on public.support_threads,public.support_messages to authenticated;
drop policy if exists support_threads_read on public.support_threads;
create policy support_threads_read on public.support_threads for select to authenticated using(public.is_active_user() and (public.is_admin() or seller_id=auth.uid()));
drop policy if exists support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages for select to authenticated using(exists(select 1 from public.support_threads t where t.id=thread_id));
create or replace function public.support_send(p_body text,p_thread uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.support_threads; actor uuid:=auth.uid();
begin
 if not public.is_active_user() then raise exception 'Acesso indisponível.'; end if;
 if p_body is null or length(trim(p_body)) not between 1 and 2000 then raise exception 'Escreva uma mensagem de até 2000 caracteres.'; end if;
 if p_thread is null then
  if public.is_admin() then raise exception 'Selecione uma conversa.'; end if;
  perform 1 from public.profiles where id=actor for update;
  select * into t from public.support_threads where seller_id=actor and status='open' for update;
  if not found then insert into public.support_threads(seller_id) values(actor) returning * into t; end if;
 else
  select * into t from public.support_threads where id=p_thread for update;
 end if;
 if t.id is null or (not public.is_admin() and t.seller_id<>actor) then raise exception 'Conversa indisponível.'; end if;
 if t.status='closed' then raise exception 'Este suporte foi finalizado. Inicie um novo atendimento.'; end if;
 insert into public.support_messages(thread_id,sender_id,body) values(t.id,actor,trim(p_body));
 update public.support_threads set updated_at=clock_timestamp() where id=t.id;
 return t.id;
end; $$;
create or replace function public.support_close(p_thread uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Apenas o administrador finaliza suportes.'; end if;
 update public.support_threads set status='closed',closed_at=now(),closed_by=auth.uid(),updated_at=clock_timestamp() where id=p_thread and status='open';
 if not found then raise exception 'Suporte já finalizado ou indisponível.'; end if;
end; $$;
create or replace function public.support_read(p_thread uuid,p_through bigint) returns void language plpgsql security definer set search_path='' as $$
declare t public.support_threads; last_id bigint;
begin
 if not public.is_active_user() then raise exception 'Acesso indisponível.'; end if;
 select * into t from public.support_threads where id=p_thread for update;
 if not found or (not public.is_admin() and t.seller_id<>auth.uid()) then raise exception 'Conversa indisponível.'; end if;
 select coalesce(max(id),0) into last_id from public.support_messages where thread_id=p_thread and id<=p_through;
 update public.support_threads set admin_seen=case when public.is_admin() then greatest(admin_seen,last_id) else admin_seen end,
 seller_seen=case when not public.is_admin() then greatest(seller_seen,last_id) else seller_seen end where id=p_thread;
end; $$;
create or replace function public.support_list(p_closed boolean default false,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_user() then raise exception 'Acesso indisponível.'; end if;
 return coalesce((select jsonb_agg(row_to_json(x)) from (
 select t.id,t.seller_id,t.status,t.updated_at,p.full_name,
 (select count(*) from public.support_messages m where m.thread_id=t.id and (case when public.is_admin() then m.sender_id=t.seller_id else m.sender_id<>t.seller_id end) and m.id>case when public.is_admin() then t.admin_seen else t.seller_seen end) unread
 from public.support_threads t join public.profiles p on p.id=t.seller_id
 where (public.is_admin() or t.seller_id=auth.uid()) and (t.status='closed')=p_closed
 order by t.updated_at desc,t.id limit 30 offset greatest(0,least(p_offset,1000000))
 )x),'[]'::jsonb);
end; $$;
create or replace function public.support_unread() returns bigint language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_user() then raise exception 'Acesso indisponível.'; end if;
 return (select count(*) from public.support_messages m join public.support_threads t on t.id=m.thread_id
 where (public.is_admin() or t.seller_id=auth.uid()) and (case when public.is_admin() then m.sender_id=t.seller_id else m.sender_id<>t.seller_id end) and m.id>case when public.is_admin() then t.admin_seen else t.seller_seen end);
end; $$;
revoke all on function public.support_send(text,uuid),public.support_close(uuid),public.support_read(uuid,bigint),public.support_list(boolean,integer),public.support_unread() from public,anon;
grant execute on function public.support_send(text,uuid),public.support_close(uuid),public.support_read(uuid,bigint),public.support_list(boolean,integer),public.support_unread() to authenticated;
commit;
notify pgrst,'reload schema';
