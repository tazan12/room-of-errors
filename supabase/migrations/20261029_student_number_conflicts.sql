-- 학번 중복 충돌 기록·해결
-- 학생이 이미 다른 계정에 등록된 학번을 입력하면 저장이 409로 막히는데,
-- 학생은 RLS 때문에 누가 그 학번을 쓰는지 볼 수 없고 교수자 화면에도 아무 흔적이 남지 않았다.
-- (예: 2026-10-29 김세진 학생 — 학번 저장 9회 이상 실패 → 프로필이 빈 채로 남아 '거절' 처리됨)
-- 충돌 시도를 기록해 교수자·총괄관리자가 기존 등록자와 함께 확인하고 정리할 수 있게 한다.

create table if not exists public.roe_student_number_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_number text not null,
  attempted_at timestamptz not null default now(),
  attempts integer not null default 1,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);
create unique index if not exists roe_student_number_conflicts_open_idx
  on public.roe_student_number_conflicts (user_id, student_number) where resolved_at is null;

alter table public.roe_student_number_conflicts enable row level security;
revoke all on public.roe_student_number_conflicts from anon, authenticated;

-- 학생: 본인이 입력한 학번이 다른 계정과 겹칠 때 충돌을 기록한다(기존 등록자 정보는 학생에게 돌려주지 않는다).
create or replace function public.roe_report_student_number_conflict(p_student_number text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  num text := btrim(coalesce(p_student_number, ''));
begin
  if auth.uid() is null or num = '' then return; end if;
  if not exists (
    select 1 from public.roe_profiles p
    where p.student_number = num and p.user_id <> auth.uid()
  ) then return; end if;
  insert into public.roe_student_number_conflicts (user_id, student_number)
  values (auth.uid(), num)
  on conflict (user_id, student_number) where resolved_at is null
  do update set attempted_at = now(),
                attempts = public.roe_student_number_conflicts.attempts + 1;
end;
$$;
revoke all on function public.roe_report_student_number_conflict(text) from public, anon;
grant execute on function public.roe_report_student_number_conflict(text) to authenticated;

-- 교수자·총괄관리자: 미해결 충돌과 기존 등록자 정보를 함께 조회한다.
create or replace function public.roe_list_student_number_conflicts()
returns table (
  id uuid, student_number text, attempted_at timestamptz, attempts integer,
  requester_user_id uuid, requester_name text, requester_email text,
  owner_user_id uuid, owner_name text, owner_email text,
  owner_class_name text, owner_approval_status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'), '') not in ('admin', 'faculty') then
    raise exception '교수자 권한이 필요합니다.';
  end if;
  return query
  select c.id, c.student_number, c.attempted_at, c.attempts,
         c.user_id, coalesce(rp.full_name, ''), coalesce(ru.email, '')::text,
         op.user_id, coalesce(op.full_name, ''), coalesce(ou.email, '')::text,
         coalesce(op.class_name, ''), coalesce(op.approval_status, '')
  from public.roe_student_number_conflicts c
  left join public.roe_profiles rp on rp.user_id = c.user_id
  left join auth.users ru on ru.id = c.user_id
  left join public.roe_profiles op on op.student_number = c.student_number and op.user_id <> c.user_id
  left join auth.users ou on ou.id = op.user_id
  where c.resolved_at is null
  order by c.attempted_at desc;
end;
$$;
revoke all on function public.roe_list_student_number_conflicts() from public, anon;
grant execute on function public.roe_list_student_number_conflicts() to authenticated;

-- 총괄관리자: 잘못 선점된 학번을 기존 계정에서 비운다.
-- 기존 계정은 다음 로그인 때 학생 정보 입력 화면으로 돌아가 올바른 학번을 다시 입력한다.
create or replace function public.roe_release_student_number(target_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  num text;
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'), '') <> 'admin' then
    raise exception '총괄관리자 권한이 필요합니다.';
  end if;
  select student_number into num from public.roe_profiles where user_id = target_user_id and role = 'student';
  if num is null then raise exception '해제할 학번을 찾지 못했습니다.'; end if;
  update public.roe_profiles set student_number = null, updated_at = now() where user_id = target_user_id;
  update public.roe_student_number_conflicts
  set resolved_at = now(), resolved_by = auth.uid()
  where student_number = num and resolved_at is null;
end;
$$;
revoke all on function public.roe_release_student_number(uuid) from public, anon;
grant execute on function public.roe_release_student_number(uuid) to authenticated;

-- 교수자·총괄관리자: 충돌을 확인 완료로 닫는다(예: 학생이 학번을 잘못 입력한 경우).
create or replace function public.roe_resolve_student_number_conflict(conflict_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'), '') not in ('admin', 'faculty') then
    raise exception '교수자 권한이 필요합니다.';
  end if;
  update public.roe_student_number_conflicts
  set resolved_at = now(), resolved_by = auth.uid()
  where id = conflict_id and resolved_at is null;
end;
$$;
revoke all on function public.roe_resolve_student_number_conflict(uuid) from public, anon;
grant execute on function public.roe_resolve_student_number_conflict(uuid) to authenticated;
