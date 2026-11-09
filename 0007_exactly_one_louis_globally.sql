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
