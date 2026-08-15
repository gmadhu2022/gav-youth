# GAV YOUTH — Chat App (React + FastAPI + Supabase)

A responsive real-time chat app (works on desktop and mobile) with the exact
GAV YOUTH look: dark rose-black theme, coral→amber gradient, bottom nav
(Chats / People / Profile), email + Google auth, and read receipts.

## Architecture (hybrid)
- **Supabase** — authentication, realtime message delivery, Postgres + RLS.
- **FastAPI (`backend/`)** — the Python business logic: conversations, chat
  list, sending, read receipts, profiles. Uses the service-role key and
  verifies the Supabase JWT on every request.
- **React (`src/`)** — signs in with Supabase, subscribes to Supabase Realtime
  for live messages, and calls FastAPI for everything else.

```
Browser ──JWT──> FastAPI ──service key──> Supabase (Postgres)
   └───────── Supabase Auth + Realtime ──────────┘
```

## 1. Create a Supabase project
- Go to https://supabase.com → **New project**.
- Open **SQL Editor**, paste everything from `supabase/schema.sql`, and **Run**.
  This creates the tables, security rules, realtime, and helper functions.

## 2. (Optional) Enable Google login
- Supabase → **Authentication → Providers → Google** → enable and add your
  Google OAuth client ID/secret.
- Supabase → **Authentication → URL Configuration** → add your site URL
  (e.g. `http://localhost:5173`) to redirect URLs.
- Email confirmations: for quick local testing you can turn off
  **Confirm email** under Authentication → Providers → Email.

## 3. Configure the app
```bash
cp .env.example .env
```
Fill `.env` with values from Supabase → **Project Settings → API**:
- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = anon public key

## 4. Run the backend (Python)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # add SUPABASE_URL, ANON key, and SERVICE ROLE key
uvicorn app.main:app --reload   # http://localhost:8000  (docs at /docs)
```
See `backend/README.md` for details. Keep the service-role key server-side.

## 5. Run the frontend
```bash
npm install
npm run dev        # http://localhost:5173
```
Build for production with `npm run build` (outputs to `dist/`). Deploy the
`dist/` folder to Vercel/Netlify/Cloudflare Pages, and the backend to any
Python host (Railway, Render, Fly.io, a VM). Point `VITE_API_URL` at the
deployed backend and add that frontend origin to the backend `CORS_ORIGINS`.

## How to use
1. Open the app → **Get Started** → **Create account** (name + username).
2. Create a second account (another browser/incognito) to chat with.
3. Go to **People**, tap a user to open a conversation, and start messaging.
   Messages appear in real time; ✓ = sent, ✓✓ = read.

## Project structure
```
src/                        React frontend
  context/AuthContext.jsx   session, profile, sign-in/up, Google, heartbeat
  lib/supabase.js           Supabase client (auth + realtime) + helpers
  lib/api.js                calls FastAPI with the Supabase token
  pages/                    Landing, Auth, Chats, Chat, People, Profile
  components/               Logo, Avatar, BottomNav, ProtectedRoute
backend/                    FastAPI service (see backend/README.md)
  app/services.py           all business logic — extend here
supabase/schema.sql         DB tables, RLS, realtime (run once)
```

## Security
Row Level Security is on for every table — a user can only read a
conversation and its messages if they are a participant, enforced in the
database (see `supabase/schema.sql`). The anon key is safe to ship in the
frontend; it only works within those rules.

## What's stubbed for "next release"
Photos, voice notes, calls, and group chats — the schema already leaves room
(conversations aren't hard-limited to two people) so you can extend it.
