-- LOUIS CHESS WORLD — Fresh Supabase setup
-- Run this ONE file only in the SQL Editor of a NEW Supabase project.
-- It combines migrations 0001 through 0008 in order.
-- Do not run this after applying the individual migration files.

-- ==================== BEGIN 0001_initial_schema.sql ====================
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
-- ==================== END 0001_initial_schema.sql ======================

-- ==================== BEGIN 0002_secure_student_accounts.sql ====================
-- Security and account management additions for real teacher/student login.

alter table public.profiles add column if not exists student_code text;
alter table public.profiles drop constraint if exists profiles_student_code_format;
alter table public.profiles add constraint profiles_student_code_format
  check (student_code is null or student_code ~ '^[A-HJ-NP-Z2-9]{6,10}$');
create unique index if not exists profiles_student_code_unique
  on public.profiles(student_code);

alter table public.puzzles add column if not exists slug text;
create unique index if not exists puzzles_slug_unique
  on public.puzzles(slug);

-- Students must not be able to grant themselves stars, progress, or achievements.
-- These writes are performed only by trusted server routes after chess.js validation.
drop policy if exists "attempts_student_insert" on public.puzzle_attempts;
drop policy if exists "attempts_student_update_own" on public.puzzle_attempts;
drop policy if exists "student_achievements_insert_own" on public.student_achievements;
drop policy if exists "student_progress_insert_or_update_own" on public.student_progress;
revoke insert, update, delete on public.puzzle_attempts from authenticated;
revoke insert, update, delete on public.student_achievements from authenticated;
revoke insert, update, delete on public.student_progress from authenticated;

-- A learner may read a puzzle if it is published or specifically assigned to them.
drop policy if exists "puzzles_read_published_or_owned" on public.puzzles;
create policy "puzzles_read_published_owned_or_assigned" on public.puzzles
for select to authenticated
using (
  created_by = auth.uid()
  or (
    is_published = true
    and exists (
      select 1 from public.profiles viewer
      where viewer.id = auth.uid()
        and viewer.is_active = true
        and (
          (viewer.role = 'teacher' and viewer.id = puzzles.created_by)
          or (viewer.role = 'student' and viewer.teacher_id = puzzles.created_by)
        )
    )
  )
  or exists (
    select 1 from public.puzzle_assignments pa
    where pa.puzzle_id = puzzles.id and pa.student_id = auth.uid() and pa.status <> 'cancelled'
  )
);

-- Per-IP + student-code throttle. The raw IP address and code are never stored.
create table if not exists public.student_login_attempt_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  blocked_until timestamptz
);
alter table public.student_login_attempt_limits enable row level security;
revoke all on public.student_login_attempt_limits from anon, authenticated;

create or replace function public.consume_student_login_attempt(p_key_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.student_login_attempt_limits%rowtype;
begin
  insert into public.student_login_attempt_limits(key_hash, window_started_at, attempt_count, blocked_until)
  values (p_key_hash, now(), 1, null)
  on conflict (key_hash) do update
  set
    attempt_count = case
      when public.student_login_attempt_limits.window_started_at < now() - interval '15 minutes' then 1
      else public.student_login_attempt_limits.attempt_count + 1
    end,
    window_started_at = case
      when public.student_login_attempt_limits.window_started_at < now() - interval '15 minutes' then now()
      else public.student_login_attempt_limits.window_started_at
    end,
    blocked_until = case
      when public.student_login_attempt_limits.window_started_at < now() - interval '15 minutes' then null
      when public.student_login_attempt_limits.attempt_count + 1 >= 8 then now() + interval '15 minutes'
      else public.student_login_attempt_limits.blocked_until
    end
  returning * into v_row;

  return v_row.blocked_until is null or v_row.blocked_until < now();
end;
$$;
revoke all on function public.consume_student_login_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_student_login_attempt(text) to service_role;

-- Successful puzzle completion is recorded atomically and can only be called by the server.
create unique index if not exists puzzle_attempts_one_success_per_student
  on public.puzzle_attempts(puzzle_id, student_id) where is_solved = true;

create or replace function public.record_puzzle_success(
  p_student_id uuid,
  p_puzzle_id uuid,
  p_moves_uci jsonb,
  p_hints_used integer default 0,
  p_elapsed_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward integer;
  v_attempt_id uuid;
begin
  if p_hints_used < 0 or (p_elapsed_seconds is not null and p_elapsed_seconds < 0) then
    raise exception 'Invalid attempt metadata';
  end if;

  if not exists (select 1 from public.profiles where id = p_student_id and role = 'student' and is_active = true) then
    raise exception 'Student is not active';
  end if;

  select reward_stars into v_reward
  from public.puzzles
  where id = p_puzzle_id and is_published = true;

  if v_reward is null then
    if not exists (
      select 1 from public.puzzles p
      join public.puzzle_assignments pa on pa.puzzle_id = p.id
      where p.id = p_puzzle_id and pa.student_id = p_student_id and pa.status <> 'cancelled'
    ) then
      raise exception 'Puzzle is not available to this student';
    end if;
    select reward_stars into v_reward from public.puzzles where id = p_puzzle_id;
  end if;

  if exists (
    select 1 from public.puzzle_attempts
    where puzzle_id = p_puzzle_id and student_id = p_student_id and is_solved = true
  ) then
    return jsonb_build_object('awarded', false, 'stars', 0, 'already_solved', true);
  end if;

  insert into public.puzzle_attempts(
    puzzle_id, student_id, completed_at, is_solved, moves_uci,
    hints_used, elapsed_seconds, stars_earned
  ) values (
    p_puzzle_id, p_student_id, now(), true, p_moves_uci,
    p_hints_used, p_elapsed_seconds, v_reward
  ) on conflict (puzzle_id, student_id) where is_solved = true do nothing
  returning id into v_attempt_id;

  if v_attempt_id is null then
    return jsonb_build_object('awarded', false, 'stars', 0, 'already_solved', true);
  end if;

  insert into public.student_progress(student_id, stars_total, puzzles_solved, current_streak, best_streak, last_practice_date)
  values (p_student_id, v_reward, 1, 1, 1, current_date)
  on conflict (student_id) do update set
    stars_total = public.student_progress.stars_total + excluded.stars_total,
    puzzles_solved = public.student_progress.puzzles_solved + 1,
    current_streak = case
      when public.student_progress.last_practice_date = current_date then public.student_progress.current_streak
      when public.student_progress.last_practice_date = current_date - 1 then public.student_progress.current_streak + 1
      else 1
    end,
    best_streak = greatest(
      public.student_progress.best_streak,
      case
        when public.student_progress.last_practice_date = current_date then public.student_progress.current_streak
        when public.student_progress.last_practice_date = current_date - 1 then public.student_progress.current_streak + 1
        else 1
      end
    ),
    last_practice_date = current_date,
    updated_at = now();

  update public.puzzle_assignments
  set status = 'completed'
  where puzzle_id = p_puzzle_id and student_id = p_student_id;

  return jsonb_build_object('awarded', true, 'stars', v_reward, 'already_solved', false);
end;
$$;
revoke all on function public.record_puzzle_success(uuid, uuid, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.record_puzzle_success(uuid, uuid, jsonb, integer, integer) to service_role;
-- ==================== END 0002_secure_student_accounts.sql ======================

-- ==================== BEGIN 0003_private_puzzle_solutions.sql ====================
-- Keep approved answers off the student-readable puzzle metadata table.
-- The service-role backend is the only application component allowed to read these records.

create table if not exists public.puzzle_solutions (
  puzzle_id uuid primary key references public.puzzles(id) on delete cascade,
  solution_uci jsonb not null,
  accepted_lines jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint puzzle_solutions_line_is_array check (jsonb_typeof(solution_uci) = 'array'),
  constraint puzzle_solutions_accepted_are_array check (jsonb_typeof(accepted_lines) = 'array')
);

insert into public.puzzle_solutions(puzzle_id, solution_uci, accepted_lines)
select p.id, p.solution_uci, coalesce(p.accepted_lines, '[]'::jsonb)
from public.puzzles p
where p.solution_uci is not null
on conflict (puzzle_id) do nothing;

alter table public.puzzle_solutions enable row level security;
revoke all on table public.puzzle_solutions from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.puzzle_solutions to service_role;

-- Sample puzzle slugs are unique per teacher, not across the entire installation.
drop index if exists public.puzzles_slug_unique;
create unique index if not exists puzzles_creator_slug_unique on public.puzzles(created_by, slug);

-- Remove answers from the student-readable metadata table entirely.
alter table public.puzzles drop column if exists solution_uci;
alter table public.puzzles drop column if exists accepted_lines;
-- ==================== END 0003_private_puzzle_solutions.sql ======================

-- ==================== BEGIN 0004_active_account_enforcement.sql ====================
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
-- ==================== END 0004_active_account_enforcement.sql ======================

-- ==================== BEGIN 0005_policy_and_puzzle_rate_limits.sql ====================
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
-- ==================== END 0005_policy_and_puzzle_rate_limits.sql ======================

-- ==================== BEGIN 0006_single_learner_louis.sql ====================
-- This deployment is intentionally scoped to one learner: LOUIS.
-- Apply after migrations 0001-0005. If test accounts already exist, review them
-- before applying; this migration never deletes accounts and normalizes the learner name.

do $$
begin
  if exists (
    select 1
    from public.profiles
    where role = 'student' and teacher_id is not null
    group by teacher_id
    having count(*) > 1
  ) then
    raise exception 'More than one student profile exists for a teacher. Review old/demo accounts and retain only LOUIS before applying migration 0006.';
  end if;
end $$;

create unique index if not exists profiles_one_student_per_teacher
  on public.profiles(teacher_id)
  where role = 'student' and teacher_id is not null;

create or replace function public.enforce_louis_only_student()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role = 'student' then
    new.display_name := 'LOUIS';
    new.nickname := 'LOUIS';
    if new.teacher_id is null then
      raise exception 'The single-student setup requires a teacher_id.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_louis_only_student on public.profiles;
create trigger profiles_enforce_louis_only_student
before insert or update
on public.profiles
for each row execute function public.enforce_louis_only_student();
-- ==================== END 0006_single_learner_louis.sql ======================

-- ==================== BEGIN 0007_exactly_one_louis_globally.sql ====================
-- Enforce the product decision: exactly one student profile in this deployment, LOUIS.
-- Apply after 0001-0006 on a fresh database with no duplicate demo student profiles.

do $$
begin
  if (select count(*) from public.profiles where role = 'student') > 1 then
    raise exception 'More than one student profile exists. Review demo/test accounts and retain only LOUIS before applying migration 0007.';
  end if;
end $$;

drop index if exists public.profiles_one_student_per_teacher;
create unique index if not exists profiles_exactly_one_student_global
  on public.profiles(role)
  where role = 'student';

create or replace function public.enforce_louis_only_student()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role = 'student' then
    new.display_name := 'LOUIS';
    new.nickname := 'LOUIS';
    if new.teacher_id is null then
      raise exception 'The single-student setup requires a teacher_id.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_louis_only_student on public.profiles;
create trigger profiles_enforce_louis_only_student
before insert or update on public.profiles
for each row execute function public.enforce_louis_only_student();
-- ==================== END 0007_exactly_one_louis_globally.sql ======================

-- ==================== BEGIN 0008_xp_points_and_rewards.sql ====================
-- LOUIS CHESS WORLD — points / XP reward system
-- Apply after migrations 0001-0007. Safe to run more than once.

alter table public.puzzles
  add column if not exists reward_points integer not null default 100;

alter table public.puzzle_attempts
  add column if not exists points_earned integer not null default 0;

alter table public.student_progress
  add column if not exists points_total integer not null default 0;

-- Guard constraints when this migration is re-run.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'puzzles_reward_points_range'
      and conrelid = 'public.puzzles'::regclass
  ) then
    alter table public.puzzles
      add constraint puzzles_reward_points_range
      check (reward_points between 0 and 5000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'puzzle_attempts_points_earned_range'
      and conrelid = 'public.puzzle_attempts'::regclass
  ) then
    alter table public.puzzle_attempts
      add constraint puzzle_attempts_points_earned_range
      check (points_earned between 0 and 5000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_progress_points_total_nonnegative'
      and conrelid = 'public.student_progress'::regclass
  ) then
    alter table public.student_progress
      add constraint student_progress_points_total_nonnegative
      check (points_total >= 0);
  end if;
end $$;

-- Give existing medium/hard puzzles a sensible default. Explicit values other
-- than the original 100-point default are preserved.
update public.puzzles
set reward_points = case difficulty
  when 'Vừa' then 150
  when 'Khó' then 200
  else 100
end
where reward_points = 100 and difficulty in ('Vừa', 'Khó');

create table if not exists public.student_point_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  puzzle_id uuid not null references public.puzzles(id) on delete cascade,
  attempt_id uuid not null unique references public.puzzle_attempts(id) on delete cascade,
  points integer not null check (points > 0 and points <= 5000),
  reason text not null default 'Hoàn thành câu đố',
  created_at timestamptz not null default now()
);

create index if not exists idx_student_point_ledger_student_created
  on public.student_point_ledger(student_id, created_at desc);

alter table public.student_point_ledger enable row level security;
drop policy if exists student_point_ledger_read_related on public.student_point_ledger;
create policy student_point_ledger_read_related
  on public.student_point_ledger
  for select to authenticated
  using (public.can_access_student(student_id));

revoke all on table public.student_point_ledger from public, anon, authenticated;
grant select on table public.student_point_ledger to authenticated;
grant all on table public.student_point_ledger to service_role;

-- Backfill XP for successes earned before this migration. The unique attempt_id
-- prevents duplicate ledger entries if the migration is run again.
update public.puzzle_attempts pa
set points_earned = p.reward_points
from public.puzzles p
where p.id = pa.puzzle_id
  and pa.is_solved = true
  and pa.points_earned = 0;

insert into public.student_point_ledger(student_id, puzzle_id, attempt_id, points, reason, created_at)
select pa.student_id, pa.puzzle_id, pa.id, pa.points_earned,
       'Hoàn thành câu đố (cập nhật dữ liệu cũ)', coalesce(pa.completed_at, now())
from public.puzzle_attempts pa
where pa.is_solved = true and pa.points_earned > 0
on conflict (attempt_id) do nothing;

update public.student_progress sp
set points_total = coalesce((
  select sum(l.points)::integer
  from public.student_point_ledger l
  where l.student_id = sp.student_id
), 0),
updated_at = now();

-- Award stars and XP in one transaction. The unique successful-attempt index
-- prevents double awards even when the student taps twice or retries a request.
create or replace function public.record_puzzle_success(
  p_student_id uuid,
  p_puzzle_id uuid,
  p_moves_uci jsonb,
  p_hints_used integer default 0,
  p_elapsed_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_stars integer;
  v_reward_points integer;
  v_attempt_id uuid;
  v_total_points integer;
begin
  if p_hints_used is null or p_hints_used < 0 or p_hints_used > 50
    or (p_elapsed_seconds is not null and (p_elapsed_seconds < 0 or p_elapsed_seconds > 86400))
    or (case
      when jsonb_typeof(p_moves_uci) = 'array'
        then jsonb_array_length(p_moves_uci) < 1 or jsonb_array_length(p_moves_uci) > 40
      else true
    end) then
    raise exception 'Invalid attempt metadata';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_student_id and role = 'student' and is_active = true
  ) then
    raise exception 'Student is not active';
  end if;

  select p.reward_stars, p.reward_points
  into v_reward_stars, v_reward_points
  from public.puzzles p
  where p.id = p_puzzle_id
    and (
      p.is_published = true
      or exists (
        select 1 from public.puzzle_assignments pa
        where pa.puzzle_id = p.id
          and pa.student_id = p_student_id
          and pa.status <> 'cancelled'
      )
    );

  if not found then
    raise exception 'Puzzle is not available to this student';
  end if;

  if exists (
    select 1 from public.puzzle_attempts
    where puzzle_id = p_puzzle_id
      and student_id = p_student_id
      and is_solved = true
  ) then
    select points_total into v_total_points
    from public.student_progress
    where student_id = p_student_id;
    return jsonb_build_object(
      'awarded', false,
      'stars', 0,
      'points', 0,
      'points_total', coalesce(v_total_points, 0),
      'already_solved', true
    );
  end if;

  insert into public.puzzle_attempts(
    puzzle_id, student_id, completed_at, is_solved, moves_uci,
    hints_used, elapsed_seconds, stars_earned, points_earned
  ) values (
    p_puzzle_id, p_student_id, now(), true, p_moves_uci,
    p_hints_used, p_elapsed_seconds, v_reward_stars, v_reward_points
  )
  on conflict (puzzle_id, student_id) where is_solved = true do nothing
  returning id into v_attempt_id;

  if v_attempt_id is null then
    select points_total into v_total_points
    from public.student_progress
    where student_id = p_student_id;
    return jsonb_build_object(
      'awarded', false,
      'stars', 0,
      'points', 0,
      'points_total', coalesce(v_total_points, 0),
      'already_solved', true
    );
  end if;

  insert into public.student_progress(
    student_id, stars_total, points_total, puzzles_solved,
    current_streak, best_streak, last_practice_date
  ) values (
    p_student_id, v_reward_stars, v_reward_points, 1,
    1, 1, current_date
  )
  on conflict (student_id) do update set
    stars_total = public.student_progress.stars_total + excluded.stars_total,
    points_total = public.student_progress.points_total + excluded.points_total,
    puzzles_solved = public.student_progress.puzzles_solved + 1,
    current_streak = case
      when public.student_progress.last_practice_date = current_date then public.student_progress.current_streak
      when public.student_progress.last_practice_date = current_date - 1 then public.student_progress.current_streak + 1
      else 1
    end,
    best_streak = greatest(
      public.student_progress.best_streak,
      case
        when public.student_progress.last_practice_date = current_date then public.student_progress.current_streak
        when public.student_progress.last_practice_date = current_date - 1 then public.student_progress.current_streak + 1
        else 1
      end
    ),
    last_practice_date = current_date,
    updated_at = now()
  returning points_total into v_total_points;

  if v_reward_points > 0 then
    insert into public.student_point_ledger(
      student_id, puzzle_id, attempt_id, points, reason
    ) values (
      p_student_id, p_puzzle_id, v_attempt_id, v_reward_points,
      'Hoàn thành câu đố'
    );
  end if;

  update public.puzzle_assignments
  set status = 'completed'
  where puzzle_id = p_puzzle_id and student_id = p_student_id;

  return jsonb_build_object(
    'awarded', true,
    'stars', v_reward_stars,
    'points', v_reward_points,
    'points_total', v_total_points,
    'already_solved', false
  );
end;
$$;

revoke all on function public.record_puzzle_success(uuid, uuid, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_puzzle_success(uuid, uuid, jsonb, integer, integer)
  to service_role;
-- ==================== END 0008_xp_points_and_rewards.sql ======================
