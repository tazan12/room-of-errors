-- 총괄관리자: 학생 명단 정리
-- 1) 재등록 요청: 계정·실습 기록은 두고 학생 정보(학번·학년·분반·지도교수)만 비운다.
--    학생은 다음 접속 때 학생 정보 입력 화면으로 돌아가 다시 등록하고, 승인을 다시 받는다.
-- 2) 완전 삭제: 로그인 계정(auth.users)과 프로필·실습 기록·학번 충돌 기록을 모두 지운다(되돌릴 수 없음).
--    같은 Google 계정으로 다시 로그인하면 새 학생으로 처음부터 등록된다.
-- 두 기능 모두 학생 계정에만 동작하며, 교수자·총괄관리자 계정과 본인 계정은 건드리지 않는다.

create or replace function public.roe_admin_reset_students(target_user_ids uuid[])
returns table (user_id uuid, full_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'), '') <> 'admin' then
    raise exception '총괄관리자 권한이 필요합니다.';
  end if;
  return query
  update public.roe_profiles p
  set student_number = null, grade = null, class_name = '', faculty_user_id = null,
      approval_status = 'pending', approved_at = null, approved_by = null, updated_at = now()
  where p.user_id = any(target_user_ids) and p.role = 'student' and p.user_id <> auth.uid()
  returning p.user_id, p.full_name;
end;
$$;
revoke all on function public.roe_admin_reset_students(uuid[]) from public, anon;
grant execute on function public.roe_admin_reset_students(uuid[]) to authenticated;

create or replace function public.roe_admin_delete_students(target_user_ids uuid[])
returns table (user_id uuid, full_name text, sessions_deleted integer)
language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[];
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'), '') <> 'admin' then
    raise exception '총괄관리자 권한이 필요합니다.';
  end if;
  -- 학생 계정만 대상으로 한다(교수자·관리자 권한이 있는 계정, 본인 계정 제외).
  select array_agg(p.user_id) into ids
  from public.roe_profiles p
  join auth.users u on u.id = p.user_id
  where p.user_id = any(target_user_ids)
    and p.role = 'student'
    and p.user_id <> auth.uid()
    and coalesce(u.raw_app_meta_data->>'role', '') not in ('admin', 'faculty');
  if ids is null then return; end if;

  return query
  select p.user_id, p.full_name,
         (select count(*)::integer from public.roe_sessions s where s.student_user_id = p.user_id)
  from public.roe_profiles p where p.user_id = any(ids);

  delete from public.roe_sessions s where s.student_user_id = any(ids);
  delete from public.roe_student_number_conflicts c where c.user_id = any(ids);
  delete from public.roe_profiles p where p.user_id = any(ids);
  delete from auth.users u where u.id = any(ids);
end;
$$;
revoke all on function public.roe_admin_delete_students(uuid[]) from public, anon;
grant execute on function public.roe_admin_delete_students(uuid[]) to authenticated;
