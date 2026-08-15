# GAV YOUTH — FastAPI backend

The Python half of the hybrid. Supabase keeps auth + realtime; this service
owns the business logic (conversations, chat list with unread counts,
sending, read receipts, profile updates) and talks to Supabase with the
service-role key.

## How auth works
The React app signs in with Supabase and gets an access token (JWT). It sends
that token as `Authorization: Bearer <token>` on every API call. This service
validates the token against Supabase Auth (`/auth/v1/user`, cached ~60s) to
resolve the user, then enforces authorization in Python (e.g. you must be a
participant to read or post in a conversation) before using the service key.

Realtime is untouched: a message inserted here lands in the same `messages`
table the frontend subscribes to, so it streams live automatically.

## Run it
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env             # fill SUPABASE_URL, ANON key, SERVICE key
uvicorn app.main:app --reload    # http://localhost:8000
```
Interactive API docs: http://localhost:8000/docs

> Keep `SUPABASE_SERVICE_KEY` server-side only. Never put it in the frontend.

## Endpoints
| Method | Path                               | Purpose                        |
|--------|------------------------------------|--------------------------------|
| GET    | /conversations                     | My chats + last msg + unread   |
| POST   | /conversations                     | Find/create a 1:1 conversation |
| GET    | /conversations/{id}                | Other participant + history    |
| POST   | /conversations/{id}/messages       | Send a message                 |
| POST   | /conversations/{id}/read           | Mark conversation read         |
| GET    | /people                            | List other users              |
| GET    | /me                                | My profile                     |
| PUT    | /profile                           | Update my profile             |

## Files
```
app/
  main.py            app, CORS, routers, lifespan
  config.py          env settings
  deps.py            get_current_user (verifies Supabase JWT)
  supabase_client.py REST + Auth wrapper (service role) + token cache
  services.py        all business logic  ← extend here
  schemas.py         request models
  routers/           thin HTTP layer
```

## Where to add features
`services.py` is the place. The `send_message` function has a marked hook
point for moderation / push notifications. Group chats need no schema change —
conversations already allow more than two participants.

## Performance note
`list_conversations` composes several REST calls per chat for clarity. If you
have many conversations, move that aggregation into a single Postgres function
(the SQL RPC `get_my_conversations` in `supabase/schema.sql` does exactly this)
and call it from `services.py` with a forwarded user token.
