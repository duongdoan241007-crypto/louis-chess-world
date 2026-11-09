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
