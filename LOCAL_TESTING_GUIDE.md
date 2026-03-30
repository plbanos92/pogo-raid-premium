# Local Testing Guide (Frontend + Backend)

This guide explains how to test the full stack locally:
- backend: Supabase local stack (`pogo-raid-premium-backend`)
- frontend: Cloudflare Pages local dev (`pogo-raid-premium`)

## 1) What this validates

- Supabase migrations and seed apply cleanly.
- Core backend queue logic passes SQL smoke checks.
- Frontend builds and serves correctly in local Pages dev.
- Frontend can use local Supabase URL/anon key for auth + queue API calls.

## 2) Prerequisites

Install and verify:

```powershell
node -v
npm -v
docker --version
supabase --version
```

Required apps:
- Docker Desktop (running)
- Supabase CLI
- Node.js + npm

## 3) Start backend locally (Supabase)

Open Terminal A:

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium-backend
supabase start
```

Keep this terminal running.

Expected local ports from config:
- API: `http://127.0.0.1:54321`
- DB: `127.0.0.1:54322`
- Studio: `http://127.0.0.1:54323`
- Inbucket: `http://127.0.0.1:54324`

## 4) Reset backend schema + seed

Open Terminal B:

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium-backend
supabase db reset --local
```

This runs all migrations and applies `supabase/seed.sql`.

## 5) Run backend SQL smoke checks

In Terminal B:

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium-backend
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/01_rpc_and_rls.sql
```

Pass criteria:
- SQL file completes without errors.

## 5.1) Run frontend unit tests

In Terminal C:

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium
npm run test:unit
```

Pass criteria:
- conflict detection unit tests pass.

## 6) Verify local backend API manually

In Terminal B, set local API values:

```powershell
$env:SUPABASE_URL="http://127.0.0.1:54321"
$env:SUPABASE_ANON_KEY="<paste local anon key from supabase start output>"
```

Read reference data:

```powershell
curl.exe -s "$env:SUPABASE_URL/rest/v1/raid_bosses?select=id,name,tier,pokemon_id&order=tier.desc" -H "apikey: $env:SUPABASE_ANON_KEY"
```

Sign up a local test user:

```powershell
curl.exe -s -X POST "$env:SUPABASE_URL/auth/v1/signup" -H "apikey: $env:SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d "{\"email\":\"localuser@example.com\",\"password\":\"TestPass123!\"}"
```

If your local auth requires confirmation, use sign-in with an existing confirmed local user.

## 7) Start frontend locally (Cloudflare Pages dev)

Open Terminal C:

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium
npm install
npm run build
npm run dev
```

Open the URL shown by Wrangler (typically localhost).

Pass criteria:
- frontend loads without 404
- `assets/styles.css` loads
- function route works: `/api/hello` (or the route configured by Pages Functions)

## 8) Frontend <-> local Supabase integration test plan

When frontend Supabase integration is implemented:

1. Configure local frontend env values to point to local Supabase:
   - `SUPABASE_URL=http://127.0.0.1:54321`
   - `SUPABASE_ANON_KEY=<local anon key>`
2. Start frontend (`npm run dev`).
3. In UI, execute this flow:
   - sign in / sign up
   - list active raids
   - join queue on a raid
   - verify `My Queues` shows new queue row
4. Confirm in Supabase Studio (`http://127.0.0.1:54323`) that row exists in `raid_queues`.

## 9) End-to-end checklist (quick)

- [ ] `supabase start` is running
- [ ] `supabase db reset --local` succeeds
- [ ] `01_rpc_and_rls.sql` succeeds
- [ ] frontend unit tests (`npm run test:unit`) pass
- [ ] frontend `npm run build` succeeds
- [ ] frontend `npm run dev` loads page
- [ ] local auth works
- [ ] local `join_raid_queue` works
- [ ] queue row appears in UI and database

## 9.1) Local backend integration test from frontend repo

In Terminal C, set required env vars:

```powershell
$env:LOCAL_SUPABASE_URL="http://127.0.0.1:54321"
$env:LOCAL_SUPABASE_ANON_KEY="<local anon key>"
$env:LOCAL_SUPABASE_SERVICE_ROLE_KEY="<local service role key>"
```

Run integration test:

```powershell
npm run test:integration
```

This test validates:
- admin bootstrap user on local auth
- sign in via password
- active raids fetch
- `join_raid_queue` RPC call
- `raid_queues` row visibility for the signed-in user

## 10) Common local issues

- Docker not running:
  - start Docker Desktop and rerun `supabase start`.
- Port already in use (`54321/54322/...`):
  - stop conflicting processes or change ports in `supabase/config.toml`.
- `psql` not found:
  - install PostgreSQL client tools or run tests through your DB client.
- Frontend has no Supabase calls yet:
  - expected until integration modules are implemented.

## 11) Stop local services

Stop frontend dev server: `Ctrl+C` in Terminal C.

Stop Supabase local stack (Terminal B):

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium-backend
supabase stop
```
