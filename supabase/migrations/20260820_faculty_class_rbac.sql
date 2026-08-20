-- Three-level RBAC: admin (총괄), faculty (담당 분반), student (본인 기록)
alter table public.roe_profiles drop constraint if exists roe_profiles_role_check;
alter table public.roe_profiles add constraint roe_profiles_role_check
  check (role in ('student', 'faculty', 'admin'));

create table if not exists public.roe_faculty_classes (
  faculty_user_id uuid not null references auth.users(id) on delete cascade,
  class_name text not null check (class_name in ('A1','B1','C1','D1','A2','B2','C2','D2')),
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (faculty_user_id, class_name),
  unique (class_name)
);

alter table public.roe_profiles add column if not exists faculty_user_id uuid references auth.users(id);
alter table public.roe_profiles drop constraint if exists roe_profiles_faculty_class_fkey;
alter table public.roe_profiles add constraint roe_profiles_faculty_class_fkey
  foreign key (faculty_user_id, class_name)
  references public.roe_faculty_classes(faculty_user_id, class_name);
create index if not exists roe_profiles_faculty_class_idx on public.roe_profiles (faculty_user_id, class_name);
create index if not exists roe_sessions_student_idx on public.roe_sessions (student_user_id);

alter table public.roe_faculty_classes enable row level security;
grant select on public.roe_faculty_classes to authenticated;
revoke insert, update, delete on public.roe_faculty_classes from anon, authenticated;

drop policy if exists "faculty_classes_read" on public.roe_faculty_classes;
create policy "faculty_classes_read" on public.roe_faculty_classes for select to authenticated using (true);

-- Approved faculty are visible to students so they can select their route.
drop policy if exists "faculty_request_read" on public.roe_faculty_requests;
create policy "faculty_request_read" on public.roe_faculty_requests for select to authenticated
using (
  (select auth.uid()) = user_id
  or status = 'approved'
  or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
);

-- Profiles: admin sees all; faculty sees self and students assigned to them.
drop policy if exists "roe_profiles_read_own" on public.roe_profiles;
create policy "roe_profiles_read_authorized" on public.roe_profiles for select to authenticated
using (
  (select auth.uid()) = user_id
  or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
  or (
    coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'faculty'
    and faculty_user_id = (select auth.uid())
  )
);

drop policy if exists "roe_profiles_update_admin" on public.roe_profiles;
create policy "roe_profiles_update_instructor" on public.roe_profiles for update to authenticated
using (
  coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
  or (
    coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'faculty'
    and faculty_user_id = (select auth.uid())
  )
)
with check (
  coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
  or (
    coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'faculty'
    and faculty_user_id = (select auth.uid())
  )
);

-- Protect student approval fields from students while allowing the assigned faculty.
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
  if new.faculty_user_id is distinct from old.faculty_user_id or new.class_name is distinct from old.class_name then
    new.approval_status := 'pending';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

-- Sessions: faculty can only read/update sessions owned by their assigned students.
drop policy if exists "roe_sessions_read_authorized" on public.roe_sessions;
create policy "roe_sessions_read_authorized" on public.roe_sessions for select to authenticated
using (
  (select auth.uid()) = student_user_id
  or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
  or (
    coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'faculty'
    and exists (
      select 1 from public.roe_profiles p
      where p.user_id = roe_sessions.student_user_id and p.faculty_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "roe_sessions_update_authorized" on public.roe_sessions;
create policy "roe_sessions_update_authorized" on public.roe_sessions for update to authenticated
using (
  (select auth.uid()) = student_user_id
  or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
  or (
    coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'faculty'
    and exists (
      select 1 from public.roe_profiles p
      where p.user_id = roe_sessions.student_user_id and p.faculty_user_id = (select auth.uid())
    )
  )
)
with check (
  (select auth.uid()) = student_user_id
  or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin'
  or (
    coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'faculty'
    and exists (
      select 1 from public.roe_profiles p
      where p.user_id = roe_sessions.student_user_id and p.faculty_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "roe_sessions_require_student_approval" on public.roe_sessions;
create policy "roe_sessions_require_student_approval"
on public.roe_sessions as restrictive for all to authenticated
using (
  coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('admin','faculty')
  or exists (select 1 from public.roe_profiles p where p.user_id = (select auth.uid()) and p.approval_status = 'approved')
)
with check (
  coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('admin','faculty')
  or exists (select 1 from public.roe_profiles p where p.user_id = (select auth.uid()) and p.approval_status = 'approved')
);

drop policy if exists "roe_sessions_insert_class_route" on public.roe_sessions;
create policy "roe_sessions_insert_class_route"
on public.roe_sessions as restrictive for insert to authenticated
with check (
  coalesce((select auth.jwt()->'app_metadata'->>'role'), '') in ('admin','faculty')
  or exists (
    select 1 from public.roe_profiles p
    where p.user_id=(select auth.uid()) and p.class_name=roe_sessions.class_name
  )
);

create or replace function public.roe_review_faculty(target_user_id uuid, decision text)
returns public.roe_faculty_requests
language plpgsql security definer set search_path = '' as $$
declare result public.roe_faculty_requests;
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'),'') <> 'admin' then
    raise exception '총괄관리자 권한이 필요합니다.';
  end if;
  if decision not in ('approved','rejected') then raise exception '올바르지 않은 결정입니다.'; end if;
  update public.roe_faculty_requests set status=decision, reviewed_at=now(), reviewed_by=auth.uid()
  where user_id=target_user_id returning * into result;
  if result.user_id is null then raise exception '교수자 신청을 찾을 수 없습니다.'; end if;
  if decision='approved' then
    update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"role":"faculty"}'::jsonb where id=target_user_id;
    update public.roe_profiles set role='faculty', approval_status='approved', approved_at=now(), approved_by=auth.uid(), updated_at=now() where user_id=target_user_id;
  else
    delete from public.roe_faculty_classes where faculty_user_id=target_user_id;
    update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)-'role' where id=target_user_id;
    update public.roe_profiles set role='student', approval_status='rejected', updated_at=now() where user_id=target_user_id;
  end if;
  return result;
end;
$$;

create or replace function public.roe_assign_faculty_classes(target_user_id uuid, class_names text[])
returns setof public.roe_faculty_classes
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'),'') <> 'admin' then
    raise exception '총괄관리자 권한이 필요합니다.';
  end if;
  if coalesce(array_length(class_names,1),0) > 2 then raise exception '교수자당 최대 2개 분반만 배정할 수 있습니다.'; end if;
  if exists (select 1 from unnest(class_names) c where c not in ('A1','B1','C1','D1','A2','B2','C2','D2')) then
    raise exception '올바르지 않은 분반입니다.';
  end if;
  if not exists (select 1 from public.roe_profiles where user_id=target_user_id and role in ('faculty','admin')) then
    raise exception '승인된 교수자가 아닙니다.';
  end if;
  delete from public.roe_faculty_classes where faculty_user_id=target_user_id;
  insert into public.roe_faculty_classes(faculty_user_id,class_name,assigned_by)
    select target_user_id,c,auth.uid() from unnest(class_names) c;
  return query select * from public.roe_faculty_classes where faculty_user_id=target_user_id order by class_name;
end;
$$;
revoke all on function public.roe_assign_faculty_classes(uuid,text[]) from public, anon;
grant execute on function public.roe_assign_faculty_classes(uuid,text[]) to authenticated;

-- Existing faculty account recovery: create its missing request so the superadmin can approve it.
insert into public.roe_faculty_requests(user_id,email,full_name,status,requested_at)
select id,email,coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',''),'pending',now()
from auth.users where lower(email)='booyoung@kyungmin.ac.kr'
on conflict (user_id) do update set status='pending', requested_at=now(), reviewed_at=null, reviewed_by=null;

-- The superadmin can also be assigned two teaching classes.
insert into public.roe_faculty_requests(user_id,email,full_name,status,requested_at,reviewed_at,reviewed_by)
select id,email,coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',''),'approved',now(),now(),id
from auth.users where lower(email)='jhk1223@kyungmin.ac.kr'
on conflict (user_id) do update set status='approved', reviewed_at=now(), reviewed_by=excluded.reviewed_by;
