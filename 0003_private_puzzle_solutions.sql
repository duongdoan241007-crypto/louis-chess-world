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
