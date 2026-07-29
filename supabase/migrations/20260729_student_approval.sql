alter table public.roe_profiles
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id);

update public.roe_profiles
set approval_status = case when role = 'admin' then 'approved' else 'pending' end
where approval_status is distinct from case when role = 'admin' then 'approved' else 'pending' end;

create or replace function private.roe_protect_student_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'), '') <> 'admin' then
    new.approval_status := old.approval_status;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;
  return new;
end;
$$;
revoke all on function private.roe_protect_student_approval() from public, anon, authenticated;

drop trigger if exists roe_protect_student_approval on public.roe_profiles;
create trigger roe_protect_student_approval
before update on public.roe_profiles
for each row execute function private.roe_protect_student_approval();

drop policy if exists "roe_profiles_update_admin" on public.roe_profiles;
create policy "roe_profiles_update_admin" on public.roe_profiles for update to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin')
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin');

drop policy if exists "roe_sessions_require_student_approval" on public.roe_sessions;
create policy "roe_sessions_require_student_approval"
on public.roe_sessions as restrictive for all to authenticated
using (
  coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin'
  or exists (
    select 1 from public.roe_profiles p
    where p.user_id = (select auth.uid()) and p.approval_status = 'approved'
  )
)
with check (
  coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin'
  or exists (
    select 1 from public.roe_profiles p
    where p.user_id = (select auth.uid()) and p.approval_status = 'approved'
  )
);
