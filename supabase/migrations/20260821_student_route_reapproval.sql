-- A student changing class/faculty must be approved again by the new instructor.
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
  if new.faculty_user_id is distinct from old.faculty_user_id
     or new.class_name is distinct from old.class_name then
    new.approval_status := 'pending';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;
