# Integration Test Guide (Frontend -> Local Supabase Backend)

This guide shows exactly how to run the frontend integration test against your local Supabase backend.

Test file:
- `tests/integration/localBackend.integration.test.cjs`

NPM script:
- `npm run test:integration`

## What this integration test verifies

- local auth admin bootstrap (create confirmed user via service role)
- sign in with email/password
- read active raids from local backend
- call `join_raid_queue` RPC
- verify queue row is visible for signed-in user

## Prerequisites

1. Docker Desktop is running.
2. Supabase local backend stack is running.
3. Backend migrations and seed are applied locally.
4. Frontend dependencies are installed.

## Step-by-step

### 1) Start backend local stack

Open Terminal A:

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium-backend
supabase start
```

Keep Terminal A running.

### 2) Reset backend local DB (migrations + seed)

Open Terminal B:

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium-backend
supabase db reset --local
```

### 3) Get local keys

From `supabase start` output (Terminal A), copy:
- anon key
- service role key

### 4) Set integration test environment variables

Open Terminal C:

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium
$env:LOCAL_SUPABASE_URL="http://127.0.0.1:54321"
$env:LOCAL_SUPABASE_ANON_KEY="PASTE_LOCAL_ANON_KEY"
$env:LOCAL_SUPABASE_SERVICE_ROLE_KEY="PASTE_LOCAL_SERVICE_ROLE_KEY"
$env:LOCAL_SEED_RAID_ID="00000000-0000-0000-0000-000000000201"
```

`LOCAL_SEED_RAID_ID` is optional if unchanged from seed.

### 5) Run integration test

In Terminal C:

```powershell
npm run test:integration
```

## Expected success output

You should see 1 integration test executed and passing.

## If test is skipped

The test auto-skips when required env vars are missing.

Required vars:
- `LOCAL_SUPABASE_ANON_KEY`
- `LOCAL_SUPABASE_SERVICE_ROLE_KEY`

## Troubleshooting

### Error: connection refused / fetch failed
- local backend is not running
- fix: rerun `supabase start`

### Error: 401 / invalid JWT
- wrong anon key or service role key
- fix: copy fresh keys from current `supabase start` output

### Error: RPC join queue failed
- migrations/seed not applied
- fix: run `supabase db reset --local`

### Error: seed raid not found
- wrong `LOCAL_SEED_RAID_ID`
- fix: use default seed raid id from backend seed file

## Clean up env vars (optional)

```powershell
Remove-Item Env:LOCAL_SUPABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:LOCAL_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
Remove-Item Env:LOCAL_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:LOCAL_SEED_RAID_ID -ErrorAction SilentlyContinue
```
