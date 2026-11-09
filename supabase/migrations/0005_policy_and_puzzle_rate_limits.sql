-- Tighten access for deactivated teachers and ensure photo consent remains valid
-- when replacing an existing avatar.

drop policy if exists "classes_teacher_manage" on public.classes;
create policy "classes_teacher_manage" on public.classes
for all to authenticated
using (
  public.current_user_role() = 'teacher'
  and teacher_id = auth.uid()
)
with check (
  public.current_user_role() = 'teacher'
  and teacher_id = auth.uid()
);

drop policy if exists "class_members_teacher_manage" on public.class_members;
create policy "class_members_teacher_manage" on public.class_members
for all to authenticated
using (
  public.current_user_role() = 'teacher'
  and exists (
    select 1 from public.classes c
    where c.id = class_id and c.teacher_id = auth.uid()
  )
)
with check (
  public.current_user_role() = 'teacher'
  and exists (
    select 1 from public.classes c
    where c.id = class_id and c.teacher_id = auth.uid()
  )
  and exists (
    select 1 from public.profiles student
    where student.id = student_id
      and student.role = 'student'
      and student.teacher_id = auth.uid()
      and student.is_active = true
  )
);

drop policy if exists "student_photos_update_related" on storage.objects;
create policy "student_photos_update_related" on storage.objects
for update to authenticated
using (
  bucket_id = 'student-photos'
  and public.current_user_role() = 'teacher'
  and public.can_access_student(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'student-photos'
  and public.current_user_role() = 'teacher'
  and public.can_access_student(((storage.foldername(name))[1])::uuid)
  and exists (
    select 1 from public.profiles student
    where student.id = ((storage.foldername(name))[1])::uuid
      and student.photo_consent_confirmed_at is not null
  )
);

-- Rate-limit puzzle validation per student and puzzle. This makes the server-side
-- move checker much harder to use as an answer-discovery oracle.
create table if not exists public.puzzle_move_attempt_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  blocked_until timestamptz
);
alter table public.puzzle_move_attempt_limits enable row level security;
revoke all on table public.puzzle_move_attempt_limits from public, anon, authenticated;
grant all on table public.puzzle_move_attempt_limits to service_role;

create or replace function public.consume_puzzle_move_attempt(p_key_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.puzzle_move_attempt_limits%rowtype;
begin
  insert into public.puzzle_move_attempt_limits(key_hash, window_started_at, attempt_count, blocked_until)
  values (p_key_hash, now(), 1, null)
  on conflict (key_hash) do update
  set
    attempt_count = case
      when public.puzzle_move_attempt_limits.window_started_at < now() - interval '15 minutes' then 1
      else public.puzzle_move_attempt_limits.attempt_count + 1
    end,
    window_started_at = case
      when public.puzzle_move_attempt_limits.window_started_at < now() - interval '15 minutes' then now()
      else public.puzzle_move_attempt_limits.window_started_at
    end,
    blocked_until = case
      when public.puzzle_move_attempt_limits.window_started_at < now() - interval '15 minutes' then null
      when public.puzzle_move_attempt_limits.attempt_count + 1 >= 121 then now() + interval '15 minutes'
      else public.puzzle_move_attempt_limits.blocked_until
    end
  returning * into v_row;

  return v_row.blocked_until is null or v_row.blocked_until < now();
end;
$$;
revoke all on function public.consume_puzzle_move_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_puzzle_move_attempt(text) to service_role;
