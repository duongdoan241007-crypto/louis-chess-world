-- Deactivated users retain no access to student learning data, private photos or puzzle content.

create or replace function public.can_access_student(target_student uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid() and actor.is_active = true
  ) and exists (
    select 1 from public.profiles target
    where target.id = target_student
      and (
        target.id = auth.uid()
        or target.teacher_id = auth.uid()
        or target.parent_id = auth.uid()
        or exists (
          select 1 from public.class_members cm
          join public.classes c on c.id = cm.class_id
          where cm.student_id = target_student and c.teacher_id = auth.uid()
        )
      )
  )
$$;

-- The helper returns NULL for inactive accounts, and is used by teacher-only policies.
create or replace function public.current_user_role()
returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and is_active = true limit 1 $$;

drop policy if exists "profiles_read_self_teacher_parent" on public.profiles;
create policy "profiles_read_self_teacher_parent" on public.profiles
for select to authenticated
using (
  public.current_user_role() is not null
  and (id = auth.uid() or teacher_id = auth.uid() or parent_id = auth.uid()
    or (public.current_user_role() = 'teacher' and public.can_access_student(id)))
);

drop policy if exists "profiles_update_self_or_teacher" on public.profiles;
create policy "profiles_update_self_or_teacher" on public.profiles
for update to authenticated
using (
  public.current_user_role() = 'teacher'
  and public.can_access_student(id)
)
with check (
  public.current_user_role() = 'teacher'
  and public.can_access_student(id)
);

drop policy if exists "class_members_visible_to_related_users" on public.class_members;
create policy "class_members_visible_to_related_users" on public.class_members
for select to authenticated
using (
  public.current_user_role() is not null
  and (student_id = auth.uid()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = student_id and p.parent_id = auth.uid()))
);

drop policy if exists "puzzles_read_published_owned_or_assigned" on public.puzzles;
create policy "puzzles_read_published_owned_or_assigned" on public.puzzles
for select to authenticated
using (
  public.current_user_role() is not null
  and (
    created_by = auth.uid()
    or (
      is_published = true
      and exists (
        select 1 from public.profiles viewer
        where viewer.id = auth.uid() and viewer.is_active = true
          and ((viewer.role = 'teacher' and viewer.id = puzzles.created_by)
            or (viewer.role = 'student' and viewer.teacher_id = puzzles.created_by))
      )
    )
    or exists (
      select 1 from public.puzzle_assignments pa
      where pa.puzzle_id = puzzles.id and pa.student_id = auth.uid() and pa.status <> 'cancelled'
    )
  )
);

drop policy if exists "assignments_student_or_teacher_read" on public.puzzle_assignments;
create policy "assignments_student_or_teacher_read" on public.puzzle_assignments
for select to authenticated
using (
  public.current_user_role() is not null
  and (student_id = auth.uid() or assigned_by = auth.uid() or public.can_access_student(student_id))
);

drop policy if exists "attempts_student_or_teacher_read" on public.puzzle_attempts;
create policy "attempts_student_or_teacher_read" on public.puzzle_attempts
for select to authenticated
using (
  public.current_user_role() is not null
  and (student_id = auth.uid() or public.can_access_student(student_id))
);

drop policy if exists "student_progress_read_related" on public.student_progress;
create policy "student_progress_read_related" on public.student_progress
for select to authenticated
using (public.can_access_student(student_id));

drop policy if exists "student_achievements_read_related" on public.student_achievements;
create policy "student_achievements_read_related" on public.student_achievements
for select to authenticated
using (public.can_access_student(student_id));

drop policy if exists "student_photos_read_related" on storage.objects;
create policy "student_photos_read_related" on storage.objects
for select to authenticated
using (
  bucket_id = 'student-photos'
  and public.current_user_role() is not null
  and public.can_access_student(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "student_photos_upload_own_or_teacher" on storage.objects;
create policy "student_photos_upload_own_or_teacher" on storage.objects
for insert to authenticated
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
);

drop policy if exists "student_photos_delete_related" on storage.objects;
create policy "student_photos_delete_related" on storage.objects
for delete to authenticated
using (
  bucket_id = 'student-photos'
  and public.current_user_role() = 'teacher'
  and public.can_access_student(((storage.foldername(name))[1])::uuid)
);
