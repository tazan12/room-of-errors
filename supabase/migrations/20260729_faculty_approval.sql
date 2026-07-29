create table if not exists public.roe_faculty_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

alter table public.roe_faculty_requests enable row level security;
grant select, insert, update on public.roe_faculty_requests to authenticated;
revoke all on public.roe_faculty_requests from anon;

create policy "faculty_request_read" on public.roe_faculty_requests for select to authenticated
using ((select auth.uid()) = user_id or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin');
create policy "faculty_request_insert" on public.roe_faculty_requests for insert to authenticated
with check ((select auth.uid()) = user_id and status = 'pending');
create policy "faculty_request_update_admin" on public.roe_faculty_requests for update to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin')
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') = 'admin');

create or replace function public.roe_review_faculty(target_user_id uuid, decision text)
returns public.roe_faculty_requests
language plpgsql security definer set search_path = '' as $$
declare result public.roe_faculty_requests;
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'),'') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if decision not in ('approved','rejected') then raise exception '잘못된 결정입니다.'; end if;
  update public.roe_faculty_requests set status=decision, reviewed_at=now(), reviewed_by=auth.uid()
  where user_id=target_user_id returning * into result;
  if result.user_id is null then raise exception '신청을 찾을 수 없습니다.'; end if;
  if decision='approved' then
    update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"role":"admin"}'::jsonb where id=target_user_id;
    update public.roe_profiles set role='admin', updated_at=now() where user_id=target_user_id;
  else
    update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)-'role' where id=target_user_id;
    update public.roe_profiles set role='student', updated_at=now() where user_id=target_user_id;
  end if;
  return result;
end;
$$;
revoke all on function public.roe_review_faculty(uuid,text) from public, anon;
grant execute on function public.roe_review_faculty(uuid,text) to authenticated;
