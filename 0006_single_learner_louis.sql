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
