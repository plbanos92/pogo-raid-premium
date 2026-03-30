# Pogo Raid Premium Web App Context and Supabase Integration Plan

## 1) Product context

Goal: a mobile-friendly Pokemon GO raid queue web app where users can:
- join multiple raid queues in parallel (different raid bosses/locations)
- manage queue conflicts across overlapping raid times
- requeue when conflicts happen (user leaves one queue and re-enters another quickly)
- hosts can invite and update queue status through server-enforced RPC flow

Backend source of truth: `pogo-raid-premium-backend` (Supabase + RLS + RPC functions).

## 2) Current frontend inefficiencies (audit)

### A. Architecture and maintainability
- Single static page (`src/index.html`) with no app structure for auth, data layer, or state.
- No JS app modules yet for API calls, auth session handling, or queue conflict logic.
- No environment-variable strategy for frontend Supabase URL/anon key in this repo.

Impact:
- Feature growth will become hard without introducing a minimal frontend architecture.

### B. UX and mobile readiness
- Current HTML/CSS is scaffold-only and not task-oriented for raid queue operations.
- Layout is centered card boilerplate; no mobile-first workflow for quick in-game actions.
- No queue list/cards, no conflict warning UI, no action affordances for join/leave/requeue.

Impact:
- Cannot support real user queue operations from mobile devices yet.

### C. API integration readiness
- No Supabase client integration (`@supabase/supabase-js`) in frontend.
- No route for core calls: auth, list raids, join queue RPC, host queue RPC.
- No error handling patterns (401/403/409/422) surfaced in UI.

Impact:
- Backend is MVP-ready but frontend cannot consume it yet.

### D. Build/deploy pipeline
- Build pipeline is correct for static assets copy, but does not include app bundling strategy.
- No runtime config injection strategy for environment-specific Supabase URL/anon key.

Impact:
- Deploys work, but frontend behavior cannot vary safely across staging/production yet.

## 3) Target MVP UX (simple + mobile-first)

Keep UI intentionally simple for now.

### Screen layout (single-page app)
- Header: app name + auth button/status.
- Section 1: `Active Raids` (card list).
- Section 2: `My Queues` (card list grouped by status).
- Bottom sticky action area on mobile for quick queue actions.

### Core actions
- Sign in / sign up.
- View active raids.
- Join queue for a selected raid.
- Leave/cancel own queue entry (phase 2 API method).
- Requeue conflict helper:
  - detect overlapping invites/start windows
  - prompt user with one-tap choices:
    - keep current invite
    - requeue into alternate raid

### Mobile behavior
- Touch targets >= 44px height.
- Single-column layout by default.
- Sticky action footer for quick actions.
- Lightweight UI states: loading, empty, error, success toast.

## 4) Frontend structure plan

Add a minimal vanilla JS modular structure (no framework required for MVP):

- `src/index.html`
- `src/app.js` (boot + wiring)
- `src/config.js` (env/config access)
- `src/supabaseClient.js` (client init)
- `src/api/auth.js`
- `src/api/raids.js`
- `src/api/queue.js`
- `src/state/store.js` (simple in-memory state)
- `src/features/raidsView.js`
- `src/features/myQueuesView.js`
- `src/features/conflictsView.js`
- `src/features/hostActionsView.js` (optional host mode)
- `src/utils/conflictDetection.js`
- `src/utils/time.js`
- `src/styles.css` (mobile-first styles)

## 5) Supabase API mapping (frontend)

Use endpoints/functions already defined in backend API guide:

### Auth
- `supabase.auth.signUp`
- `supabase.auth.signInWithPassword`
- `supabase.auth.getSession`
- `supabase.auth.signOut`

### Read models
- `raid_bosses` (public reference read)
- `raids` filtered by `is_active=true`
- `user_profiles` own row
- `raid_queues` own rows (and host-visible rows for host-owned raids)

### Queue actions (RPC-first)
- `join_raid_queue(p_raid_id, p_note)`
- `host_invite_next_in_queue(p_raid_id)`
- `host_update_queue_status(p_queue_id, p_status, p_note)`

### Error handling policy
- 401: redirect to sign-in
- 403: show role/ownership message
- 409: show "already queued" and refresh list
- 422: show actionable validation text
- 500: show request id + generic message

## 6) Parallel queue + conflict model (MVP)

### Parallel queue rule
- User can hold multiple `queued` entries across raids.

### Conflict detection rule (frontend)
- A conflict exists when user has:
  - `invited` or `confirmed` status in queue A
  - and queue B raid time overlaps configurable threshold (e.g. same 30-minute window)

### Requeue flow
1. Detect conflict on refresh or after host invite event.
2. Show conflict card with two actions:
   - `Keep A, requeue B`
   - `Keep B, requeue A`
3. For chosen action:
   - update dropped queue status (`left`/`cancelled` through host/user flow as available)
   - call `join_raid_queue` for target raid if needed
4. Refresh `My Queues`.

Note:
- Full server-side conflict orchestration can be added later with a dedicated RPC.
- MVP can start with deterministic client-side conflict detection + existing RPCs.

## 7) Implementation phases

### Phase 1 - Frontend foundation
- Add Supabase JS dependency.
- Add config + client + auth module.
- Render basic mobile-friendly shell.

### Phase 2 - Core player queue flow
- List active raids.
- Join queue via RPC.
- Show my queue entries.
- Add basic error/loading states.

### Phase 3 - Conflict + requeue UX
- Build overlap detection utility.
- Show inline conflict warnings inside `My Queues` and provide requeue actions.
- Add optimistic UI and rollback on API error.

### Phase 4 - Host tools (optional MVP+)
- Invite next in queue.
- Update queue status (confirmed/declined/cancelled).

## 8) Deployment and environments

- Use Cloudflare Pages env vars per environment:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- Never expose `service_role` key in frontend.
- Continue backend deploy process via `pogo-raid-premium-backend/SUPABASE_DEPLOYMENT_GUIDE.md`.

## 9) Immediate next build steps (recommended)

1. Add `@supabase/supabase-js` to frontend.
2. Create the module structure listed above.
3. Replace scaffold HTML with simple mobile queue UI sections.
4. Implement auth + list raids + join queue.
5. Implement my queues + conflict detection/requeue controls.
6. Deploy to Cloudflare Preview and validate against staging/prod Supabase.
