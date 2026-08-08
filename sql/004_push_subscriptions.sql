-- Run this in the Supabase SQL editor.
--
-- Backs web push notifications: one row per browser/device a teacher has
-- enabled alerts on (they can have more than one — phone + laptop, etc).
-- The `subscription` column stores the raw PushSubscription JSON the
-- browser hands back (endpoint + encryption keys) exactly as-is; the
-- send-push edge function reads it straight off this table.

create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references teachers(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_teacher_idx on push_subscriptions (teacher_id);

-- Re-enabling notifications on the same browser should update the existing
-- row (keys can rotate) rather than pile up duplicates.
alter table push_subscriptions drop constraint if exists push_subscriptions_endpoint_key;
alter table push_subscriptions
  add constraint push_subscriptions_endpoint_key unique (endpoint);

-- RLS: same trust model as leave_register / period_swaps — this app is
-- admin-only at the UI level today (see AppShell), so any signed-in user
-- is trusted. A teacher subscribes/unsubscribes their own device; the
-- send-push edge function reads this table with the service-role key,
-- which bypasses RLS entirely, so no policy is needed for sending.
alter table push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_self" on push_subscriptions;
create policy "push_subscriptions_self" on push_subscriptions
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());
