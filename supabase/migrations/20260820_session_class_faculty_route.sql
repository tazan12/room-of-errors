alter table public.roe_sessions
  add column if not exists faculty_user_id uuid references auth.users(id);

update public.roe_sessions s
set faculty_user_id = p.faculty_user_id
from public.roe_profiles p
where p.user_id = s.student_user_id and s.faculty_user_id is null;

create index if not exists roe_sessions_faculty_class_idx
  on public.roe_sessions (faculty_user_id, class_name, created_at desc);

-- A student's use approval remains valid when choosing another configured class.
-- The selected class determines the faculty route; authorization is stored per session.
create or replace function private.roe_protect_student_approval()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin' then
    return new;
  end if;
  if coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'faculty'
     and old.faculty_user_id = auth.uid() and new.faculty_user_id = old.faculty_user_id then
    return new;
  end if;
  new.approval_status := old.approval_status;
  new.approved_at := old.approved_at;
  new.approved_by := old.approved_by;
  new.role := old.role;
  return new;
end;
$$;

drop policy if exists "roe_sessions_read_authorized" on public.roe_sessions;
create policy "roe_sessions_read_authorized" on public.roe_sessions for select to authenticated
using (
  (select auth.uid()) = student_user_id
  or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
  or (
    coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'faculty'
    and faculty_user_id = (select auth.uid())
  )
);

drop policy if exists "roe_sessions_update_authorized" on public.roe_sessions;
create policy "roe_sessions_update_authorized" on public.roe_sessions for update to authenticated
using (
  (select auth.uid()) = student_user_id
  or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
  or (
    coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'faculty'
    and faculty_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = student_user_id
  or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
  or (
    coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'faculty'
    and faculty_user_id = (select auth.uid())
  )
);

drop policy if exists "roe_sessions_insert_class_route" on public.roe_sessions;
create policy "roe_sessions_insert_class_route"
on public.roe_sessions as restrictive for insert to authenticated
with check (
  coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('admin','faculty')
  or (
    (select auth.uid()) = student_user_id
    and exists (
      select 1 from public.roe_faculty_classes fc
      where fc.faculty_user_id = roe_sessions.faculty_user_id
        and fc.class_name = roe_sessions.class_name
    )
  )
);
