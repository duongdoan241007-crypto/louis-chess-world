-- VUONG QUOC 64 O — initial schema
-- Run in a fresh Supabase project after enabling the required extensions.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('teacher','student','parent')),
  display_name text not null,
  nickname text,
  level text not null default 'Tốt tập sự',
  avatar_path text,
  teacher_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.profiles(id) on delete set null,
  photo_consent_confirmed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table if not exists public.puzzles (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subtitle text,
  difficulty text not null default 'Dễ' check (difficulty in ('Dễ','Vừa','Khó')),
  theme text not null default 'Chiến thuật',
  zone text,
  fen text not null,
  solution_uci jsonb not null,
  accepted_lines jsonb not null default '[]'::jsonb,
  hint_1 text,
  hint_2 text,
  explanation text,
  reward_stars integer not null default 10 check (reward_stars between 0 and 100),
  is_published boolean not null default false,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.puzzle_assignments (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references public.puzzles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete cascade,
  due_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','completed','cancelled')),
  created_at timestamptz not null default now(),
  unique (puzzle_id, student_id)
);

create table if not exists public.puzzle_attempts (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references public.puzzles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  is_solved boolean not null default false,
  moves_uci jsonb not null default '[]'::jsonb,
  hints_used integer not null default 0 check (hints_used >= 0),
  elapsed_seconds integer check (elapsed_seconds is null or elapsed_seconds >= 0),
  stars_earned integer not null default 0 check (stars_earned between 0 and 100)
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  icon text,
  criteria jsonb not null default '{}'::jsonb
);

create table if not exists public.student_achievements (
  student_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (student_id, achievement_id)
);

create table if not exists public.student_progress (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  stars_total integer not null default 0 check (stars_total >= 0),
  puzzles_solved integer not null default 0 check (puzzles_solved >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  last_practice_date date,
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_teacher on public.profiles(teacher_id);
create index if not exists idx_classes_teacher on public.classes(teacher_id);
create index if not exists idx_class_members_student on public.class_members(student_id);
create index if not exists idx_puzzles_created_by on public.puzzles(created_by);
create index if not exists idx_assignments_student on public.puzzle_assignments(student_id, status);
create index if not exists idx_attempts_student on public.puzzle_attempts(student_id, started_at desc);

-- SECURITY DEFINER helpers avoid recursive RLS policy lookups.
create or replace function public.current_user_role()
returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and is_active = true limit 1 $$;

create or replace function public.can_access_student(target_student uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_student
      and (
        p.id = auth.uid()
        or p.teacher_id = auth.uid()
        or p.parent_id = auth.uid()
        or exists (
          select 1 from public.class_members cm
          join public.classes c on c.id = cm.class_id
          where cm.student_id = target_student and c.teacher_id = auth.uid()
        )
      )
  )
$$;

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.puzzles enable row level security;
alter table public.puzzle_assignments enable row level security;
alter table public.puzzle_attempts enable row level security;
alter table public.achievements enable row level security;
alter table public.student_achievements enable row level security;
alter table public.student_progress enable row level security;

create policy "profiles_read_self_teacher_parent" on public.profiles
for select to authenticated
using (id = auth.uid() or teacher_id = auth.uid() or parent_id = auth.uid() or public.current_user_role() = 'teacher' and public.can_access_student(id));

create policy "profiles_update_self_or_teacher" on public.profiles
for update to authenticated
using (id = auth.uid() or (public.current_user_role() = 'teacher' and public.can_access_student(id)))
with check (id = auth.uid() or (public.current_user_role() = 'teacher' and public.can_access_student(id)));

create policy "classes_teacher_manage" on public.classes
for all to authenticated
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid() and public.current_user_role() = 'teacher');

create policy "class_members_visible_to_related_users" on public.class_members
for select to authenticated
using (student_id = auth.uid() or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()) or exists (select 1 from public.profiles p where p.id = student_id and p.parent_id = auth.uid()));

create policy "class_members_teacher_manage" on public.class_members
for all to authenticated
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

create policy "puzzles_read_published_or_owned" on public.puzzles
for select to authenticated
using (is_published = true or created_by = auth.uid());

create policy "teachers_manage_own_puzzles" on public.puzzles
for all to authenticated
using (created_by = auth.uid() and public.current_user_role() = 'teacher')
with check (created_by = auth.uid() and public.current_user_role() = 'teacher');

create policy "assignments_student_or_teacher_read" on public.puzzle_assignments
for select to authenticated
using (student_id = auth.uid() or assigned_by = auth.uid() or public.can_access_student(student_id));

create policy "teachers_manage_assignments" on public.puzzle_assignments
for all to authenticated
using (assigned_by = auth.uid() and public.current_user_role() = 'teacher')
with check (assigned_by = auth.uid() and public.current_user_role() = 'teacher' and public.can_access_student(student_id));

create policy "attempts_student_insert" on public.puzzle_attempts
for insert to authenticated
with check (student_id = auth.uid());

create policy "attempts_student_or_teacher_read" on public.puzzle_attempts
for select to authenticated
using (student_id = auth.uid() or public.can_access_student(student_id));

create policy "attempts_student_update_own" on public.puzzle_attempts
for update to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

create policy "achievements_read_authenticated" on public.achievements
for select to authenticated using (true);

create policy "student_achievements_read_related" on public.student_achievements
for select to authenticated using (public.can_access_student(student_id));

create policy "student_achievements_insert_own" on public.student_achievements
for insert to authenticated with check (student_id = auth.uid());

create policy "student_progress_read_related" on public.student_progress
for select to authenticated using (public.can_access_student(student_id));

create policy "student_progress_insert_or_update_own" on public.student_progress
for all to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());

-- Private student photo bucket. Object paths must begin with the student's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "student_photos_read_related" on storage.objects
for select to authenticated
using (
  bucket_id = 'student-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.can_access_student(((storage.foldername(name))[1])::uuid)
  )
);

create policy "student_photos_upload_own_or_teacher" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'student-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (public.current_user_role() = 'teacher' and public.can_access_student(((storage.foldername(name))[1])::uuid))
  )
);

create policy "student_photos_update_related" on storage.objects
for update to authenticated
using (
  bucket_id = 'student-photos'
  and (public.can_access_student(((storage.foldername(name))[1])::uuid))
)
with check (
  bucket_id = 'student-photos'
  and (public.can_access_student(((storage.foldername(name))[1])::uuid))
);

create policy "student_photos_delete_related" on storage.objects
for delete to authenticated
using (
  bucket_id = 'student-photos'
  and (public.can_access_student(((storage.foldername(name))[1])::uuid))
);

insert into public.achievements (code, title, description, icon) values
('first_move', 'Nước đi đầu tiên', 'Hoàn thành câu đố đầu tiên.', '♟'),
('knight_explorer', 'Kỵ sĩ Mã', 'Giải các thử thách về quân Mã.', '♞'),
('tactic_master', 'Bậc thầy chiến thuật', 'Hoàn thành một chuỗi câu đố chiến thuật.', '♛'),
('checkmate_hero', 'Người hùng chiếu hết', 'Tìm được thế chiếu hết.', '♚')
on conflict (code) do nothing;

-- Keep role / ownership columns server-managed; browser users may only edit presentation fields.
revoke update on public.profiles from authenticated;
grant update (display_name, nickname, level, avatar_path, updated_at) on public.profiles to authenticated;
