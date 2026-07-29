create schema if not exists private;

create table if not exists public.roe_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', student_number text unique,
  class_name text not null default '',
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.roe_sessions (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null check (case_id in ('A','B','C','D')),
  class_name text not null default '', team_name text not null default '',
  members jsonb not null default '[]'::jsonb check (jsonb_typeof(members) = 'array'),
  status text not null default 'exploring' check (status in ('exploring','reporting','scored')),
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  priorities jsonb not null default '[]'::jsonb check (jsonb_typeof(priorities) = 'array'),
  sbar jsonb not null default '{"s":"","b":"","a":"","r":""}'::jsonb check (jsonb_typeof(sbar) = 'object'),
  reflection jsonb not null default '{}'::jsonb check (jsonb_typeof(reflection) = 'object'),
  manual_scores jsonb not null default '{}'::jsonb check (jsonb_typeof(manual_scores) = 'object'),
  submitted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists roe_sessions_student_created_idx on public.roe_sessions (student_user_id, created_at desc);
create index if not exists roe_sessions_case_created_idx on public.roe_sessions (case_id, created_at desc);
create index if not exists roe_sessions_status_idx on public.roe_sessions (status);

alter table public.roe_profiles enable row level security;
alter table public.roe_sessions enable row level security;

drop policy if exists "roe_profiles_read_own" on public.roe_profiles;
create policy "roe_profiles_read_own" on public.roe_profiles for select to authenticated
using ((select auth.uid()) = user_id or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin');
drop policy if exists "roe_profiles_update_own" on public.roe_profiles;
create policy "roe_profiles_update_own" on public.roe_profiles for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and role = 'student');
drop policy if exists "roe_sessions_read_authorized" on public.roe_sessions;
create policy "roe_sessions_read_authorized" on public.roe_sessions for select to authenticated
using ((select auth.uid()) = student_user_id or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin');
drop policy if exists "roe_sessions_insert_own" on public.roe_sessions;
create policy "roe_sessions_insert_own" on public.roe_sessions for insert to authenticated
with check ((select auth.uid()) = student_user_id);
drop policy if exists "roe_sessions_update_authorized" on public.roe_sessions;
create policy "roe_sessions_update_authorized" on public.roe_sessions for update to authenticated
using ((select auth.uid()) = student_user_id or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin')
with check ((select auth.uid()) = student_user_id or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin');

grant select, insert, update on public.roe_profiles, public.roe_sessions to authenticated;
revoke all on public.roe_profiles, public.roe_sessions from anon;

create or replace function private.handle_roe_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roe_profiles (user_id, full_name, student_number, class_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), nullif(new.raw_user_meta_data->>'student_number',''), coalesce(new.raw_user_meta_data->>'class_name',''), 'student')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_roe_user_created() from public, anon, authenticated;
drop trigger if exists on_roe_auth_user_created on auth.users;
create trigger on_roe_auth_user_created after insert on auth.users for each row execute function private.handle_roe_user_created();
