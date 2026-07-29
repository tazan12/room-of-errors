alter table public.roe_profiles
  add column if not exists grade smallint check (grade between 1 and 4);

create table if not exists private.roe_admin_emails (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);
revoke all on private.roe_admin_emails from public, anon, authenticated;

drop function if exists public.roe_is_admin();

create or replace function private.roe_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.roe_admin_emails a
    where a.email = lower(coalesce((select auth.jwt()->>'email'), ''))
  );
$$;
revoke all on function private.roe_is_admin() from public, anon;
grant execute on function private.roe_is_admin() to authenticated;

create or replace function private.handle_roe_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roe_profiles (user_id, full_name, student_number, class_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'student_number',''),
    coalesce(new.raw_user_meta_data->>'class_name',''),
    case when exists (select 1 from private.roe_admin_emails a where a.email = lower(new.email)) then 'admin' else 'student' end
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_roe_user_created() from public, anon, authenticated;

drop policy if exists "roe_profiles_read_own" on public.roe_profiles;
create policy "roe_profiles_read_own" on public.roe_profiles for select to authenticated
using ((select auth.uid()) = user_id or (select private.roe_is_admin()));

drop policy if exists "roe_profiles_update_own" on public.roe_profiles;
create policy "roe_profiles_update_own" on public.roe_profiles for update to authenticated
using ((select auth.uid()) = user_id and not (select private.roe_is_admin()))
with check ((select auth.uid()) = user_id and role = 'student');

drop policy if exists "roe_sessions_read_authorized" on public.roe_sessions;
create policy "roe_sessions_read_authorized" on public.roe_sessions for select to authenticated
using ((select auth.uid()) = student_user_id or (select private.roe_is_admin()));

drop policy if exists "roe_sessions_update_authorized" on public.roe_sessions;
create policy "roe_sessions_update_authorized" on public.roe_sessions for update to authenticated
using ((select auth.uid()) = student_user_id or (select private.roe_is_admin()))
with check ((select auth.uid()) = student_user_id or (select private.roe_is_admin()));
