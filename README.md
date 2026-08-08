# School Timetable App

## Deploying (GitHub → Vercel, no local run needed)

1. **Push this folder to a new GitHub repo.**
   `backend/` can stay in the same repo — Vercel will ignore it since it
   only builds the Next.js app at the root.

2. **Import the repo in Vercel** (vercel.com → Add New → Project → pick the repo).
   Vercel auto-detects Next.js — no build settings to change.

3. **Add environment variables** in Vercel → Project → Settings → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` — from Supabase → Project Settings → API
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same page (the `anon` public key, NOT service_role)
   - `NEXT_PUBLIC_API_URL` — your FastAPI backend URL (leave blank / a placeholder until you deploy it on Render — the app works fine without it, only "Add teacher" in the admin panel needs it)

4. **Deploy.** Every push to `main` auto-redeploys.

## Deploying the backend (separate — Render, not Vercel)

Vercel doesn't run a persistent FastAPI server well, so the `backend/`
folder deploys separately, e.g. on Render:
1. New Web Service → connect the same repo → set root directory to `backend`
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (the service_role key — Project Settings → API → keep this one secret, never in the frontend)
5. Once deployed, copy its URL into Vercel's `NEXT_PUBLIC_API_URL` and redeploy the frontend.

Until the backend is deployed, add teachers manually in Supabase
(Authentication → Add user, then insert the matching row in `teachers`
with the same id) — everything else in the app works without the backend.

## Teacher login

Teachers can now sign in with the same login page as the admin — the app
checks `teachers.role` and routes accordingly: `admin` sees the full tabbed
admin view, anyone else sees a simple "Your day" view of their own
timetable for a picked date, with each period showing whether it was
covered by someone else, swapped, or is an extra period they're covering
as a substitute. That's also where their "Enable alerts" button lives.

Note on data access: the existing tables (`timetable`, `substitutions`,
etc.) use a permissive RLS policy — any signed-in user can read them, not
just their own rows — because the app was admin-only until now and every
signed-in user was trusted. That still holds for teacher logins today
(a teacher's requests are simply scoped to their own id in the UI), but if
you want teachers restricted at the database level too, not just the UI,
tighten those policies to check `teacher_id = auth.uid()` — same pattern
as `push_subscriptions_self` in `sql/004_push_subscriptions.sql`.

## Push notifications (web push)

A teacher taps "Enable alerts" in the header once, and gets a browser
notification the moment they're assigned a substitution — no app open
needed. Three pieces to set up, all one-time:

1. **Run the migration.** In Supabase → SQL Editor, run
   `sql/004_push_subscriptions.sql`. This stores each device's push
   subscription against the teacher who enabled it.

2. **Generate VAPID keys and set the two secrets.**
   ```
   npx web-push generate-vapid-keys
   ```
   This prints a public and a private key.
   - Public key → set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in Vercel's env vars
     (same place as the Supabase keys) and redeploy.
   - Private key → **never put this in Vercel/the frontend.** Set it as a
     Supabase Edge Function secret instead:
     ```
     supabase secrets set VAPID_PUBLIC_KEY=<the public key>
     supabase secrets set VAPID_PRIVATE_KEY=<the private key>
     supabase secrets set VAPID_SUBJECT=mailto:you@yourschool.org
     ```

3. **Deploy the edge function** that actually sends the notification:
   ```
   supabase functions deploy send-push
   ```
   (Needs the Supabase CLI — `npm i -g supabase` if you don't have it —
   and `supabase link` to your project first if this is your first
   function.)

That's it — the app calls this function automatically every time a
substitution is assigned in the Substitutions tab.

**Good to know:**
- Notification permission is a one-time browser prompt per device; a
  teacher can turn it off again with the same "Alerts on" button.
- Works out of the box on desktop Chrome/Firefox/Edge and Android Chrome.
  **iPhone/iPad Safari only delivers push if the site is added to the Home
  Screen first** (Share → Add to Home Screen) — that's an Apple platform
  restriction, not something this app can work around.
- If a device's subscription goes stale (browser data cleared, etc.), the
  edge function quietly drops it after a failed send rather than erroring
  every time — no cleanup needed on your end.
