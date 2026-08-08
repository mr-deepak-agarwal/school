-- Run this in the Supabase SQL editor.
--
-- Adds half-day leave support to the existing leave_register table, and
-- is what backs:
--   1. Full/half-day selection when the admin marks someone absent
--      (Substitutions tab).
--   2. The teacher's own "Request leave" panel, which inserts rows with
--      status = 'pending' for the admin to review/approve.
--
-- Safe to run again — guarded with IF NOT EXISTS / DO blocks.

alter table leave_register
  add column if not exists half text not null default 'full';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_register_half_check'
  ) then
    alter table leave_register
      add constraint leave_register_half_check check (half in ('full', 'first', 'second'));
  end if;
end $$;

-- No RLS changes needed — leave_register already allows any authenticated
-- user to select/insert/update/delete (see 003_leave_register.sql). That
-- was fine when only the admin UI touched this table; now that teachers
-- can insert their own pending requests too, the same open policy still
-- covers it. If you later want to restrict teachers to only editing their
-- *own* rows, swap the insert/update/delete policies below in for the
-- existing ones:
--
-- drop policy if exists "leave_register_insert" on leave_register;
-- create policy "leave_register_insert" on leave_register
--   for insert to authenticated
--   with check (
--     teacher_id = auth.uid()
--     or exists (select 1 from teachers where id = auth.uid() and role = 'admin')
--   );
--
-- (repeat the same shape for update/delete)
