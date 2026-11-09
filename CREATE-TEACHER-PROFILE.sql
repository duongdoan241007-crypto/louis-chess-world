-- Run after creating the teacher in Supabase Authentication > Users.
-- Replace teacher@example.com with the exact teacher email.
insert into public.profiles (id, role, display_name, is_active)
select id, 'teacher', coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1)), true
from auth.users
where lower(email) = lower('teacher@example.com')
on conflict (id) do update
set role = 'teacher', is_active = true;
