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
commit;
