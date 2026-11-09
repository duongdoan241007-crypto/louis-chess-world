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
