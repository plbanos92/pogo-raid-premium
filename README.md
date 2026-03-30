# Pogo Raid Premium — Cloudflare Pages frontend

Mobile-first raid queue MVP frontend for Pokemon GO.

Prerequisites
- Node.js (16+ recommended)
- npm
- Wrangler (installed as a dev dependency in package.json or globally)

Quick start
1. Install dependencies:

   npm install

2. Run locally (Pages dev):

   npm run dev

3. Deploy with Wrangler:

   npm run deploy

4. Run frontend unit tests:

   npm run test:unit

5. Run local backend integration test:

   npm run test:integration

Notes
- Update account_id in wrangler.toml (or log in with `wrangler login`).
- Pages Functions (serverless) go in the `functions/` directory.
- Integration test requires local Supabase env vars:
  - `LOCAL_SUPABASE_URL`
  - `LOCAL_SUPABASE_ANON_KEY`
  - `LOCAL_SUPABASE_SERVICE_ROLE_KEY`

Files added by this scaffold:
- index.html — site entry
- assets/styles.css — basic styling
- wrangler.toml — Wrangler config
- package.json — scripts for dev/deploy
- functions/hello.js — example Pages Function

Planning docs:
- [WEBAPP_CONTEXT_AND_SUPABASE_PLAN.md](WEBAPP_CONTEXT_AND_SUPABASE_PLAN.md) — product context, inefficiency audit, mobile-first UI direction, and Supabase integration plan for raid queue MVP
- [CLOUDFLARE_DEPLOYMENT_GUIDE.md](CLOUDFLARE_DEPLOYMENT_GUIDE.md) — step-by-step deployment flow from git repository to Cloudflare Pages
- [LOCAL_TESTING_GUIDE.md](LOCAL_TESTING_GUIDE.md) — detailed step-by-step local testing flow for frontend + backend (Supabase + Cloudflare Pages dev)
- [INTEGRATION_TEST_GUIDE.md](INTEGRATION_TEST_GUIDE.md) — detailed step-by-step guide to run frontend integration tests against local Supabase

