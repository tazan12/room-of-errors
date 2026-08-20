-- Allow the superadmin to revoke faculty access safely.
create or replace function public.roe_review_faculty(target_user_id uuid, decision text)
returns public.roe_faculty_requests
language plpgsql security definer set search_path = '' as $$
declare
  result public.roe_faculty_requests;
  target_role text;
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'),'') <> 'admin' then
    raise exception '총괄관리자 권한이 필요합니다.';
  end if;
  if decision not in ('approved','rejected') then
    raise exception '올바르지 않은 결정입니다.';
  end if;

  select raw_app_meta_data->>'role' into target_role
  from auth.users where id = target_user_id;
  if target_role = 'admin' then
    raise exception '총괄관리자 권한은 회수할 수 없습니다.';
  end if;

  update public.roe_faculty_requests
  set status=decision, reviewed_at=now(), reviewed_by=auth.uid()
  where user_id=target_user_id returning * into result;
  if result.user_id is null then
    raise exception '교수자 신청을 찾을 수 없습니다.';
  end if;

  if decision='approved' then
    update auth.users
    set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"role":"faculty"}'::jsonb
    where id=target_user_id;
    update public.roe_profiles
    set role='faculty', approval_status='approved', approved_at=now(),
        approved_by=auth.uid(), updated_at=now()
    where user_id=target_user_id;
  else
    -- Students keep their historical sessions, but must select a new routed
    -- class and be approved again before creating another session.
    update public.roe_profiles
    set faculty_user_id=null, approval_status='pending', approved_at=null,
        approved_by=null, updated_at=now()
    where role='student' and faculty_user_id=target_user_id;
    delete from public.roe_faculty_classes where faculty_user_id=target_user_id;
    update auth.users
    set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)-'role'
    where id=target_user_id;
    update public.roe_profiles
    set role='student', approval_status='rejected', approved_at=null,
        approved_by=null, updated_at=now()
    where user_id=target_user_id;
  end if;
  return result;
end;
$$;

revoke all on function public.roe_review_faculty(uuid,text) from public, anon;
grant execute on function public.roe_review_faculty(uuid,text) to authenticated;
