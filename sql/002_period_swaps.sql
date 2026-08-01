-- Run this in the Supabase SQL editor.

-- New table for the Swapped Periods tab: two teachers trading one period
-- each on a given date. No substitute needed for either side.
create table if not exists period_swaps (
  id bigint generated always as identity primary key,
  swap_date date not null,
  teacher_a uuid not null references teachers(id),
  period_a int not null,
  teacher_b uuid not null references teachers(id),
  period_b int not null,
  created_at timestamptz not null default now()
);

create index if not exists period_swaps_date_idx on period_swaps (swap_date);

-- The Preferred Periods tab upserts on (date, teacher_id) — one preference
-- row per teacher per date. Add the constraint if it isn't already there
-- (skip this if you already have it).
alter table preferred_substitutions
  add constraint preferred_substitutions_date_teacher_key unique (date, teacher_id);
