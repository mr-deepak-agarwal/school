-- Run this in the Supabase SQL editor.
--
-- Widens leave_register.half to also allow quarter-day leave (q1–q4),
-- on top of the existing full/first/second. Safe to run again.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'leave_register_half_check'
  ) then
    alter table leave_register drop constraint leave_register_half_check;
  end if;

  alter table leave_register
    add constraint leave_register_half_check check (half in ('full', 'first', 'second', 'q1', 'q2', 'q3', 'q4'));
end $$;
