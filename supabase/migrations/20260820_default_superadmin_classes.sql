insert into public.roe_faculty_classes(faculty_user_id,class_name,assigned_by)
select id,c,id from auth.users cross join unnest(array['A1','A2']) c
where lower(email)='jhk1223@kyungmin.ac.kr'
on conflict (faculty_user_id,class_name) do nothing;
