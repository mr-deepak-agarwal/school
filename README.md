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
