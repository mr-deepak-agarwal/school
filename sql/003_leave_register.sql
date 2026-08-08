-- Run this in the Supabase SQL editor.
--
-- Backs the new "Teachers on leave" panel at the top of the Substitutions
-- tab. If you already have this table from an earlier setup step, this
-- file is safe to run again — everything is guarded with IF NOT EXISTS.

create table if not exists leave_register (
  id bigint generated always as identity primary key,
  date date not null,
  teacher_id uuid not null references teachers(id),
  reason text,
  status text not null default 'approved' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now()
);

create index if not exists leave_register_date_idx on leave_register (date);
create index if not exists leave_register_teacher_idx on leave_register (teacher_id);

-- One entry per teacher per day — marking someone absent twice for the
-- same date just no-ops instead of creating a duplicate row.
alter table leave_register drop constraint if exists leave_register_date_teacher_key;
alter table leave_register
  add constraint leave_register_date_teacher_key unique (date, teacher_id);
