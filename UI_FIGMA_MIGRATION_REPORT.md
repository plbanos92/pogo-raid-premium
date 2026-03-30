# UI Migration Report (Figma -> JS App)

Date: 2026-03-22
Target frontend: pogo-raid-premium (vanilla JS)
Reference only: pogo-raid-premium-figma (TypeScript)

## Summary
Implemented a full UI/feature upgrade in the vanilla JS app based on the Figma screens:
- Home (Raid Boss list and queue join actions)
- Host Raid form
- My Queues (queued sessions + hosted lobbies)
- VIP page (activate/deactivate)
- Top auth/connection controls with tabbed navigation

No TypeScript code from the Figma project was reused directly. The behavior was rewritten for the existing JavaScript architecture.

## Frontend Changes

### 1) Page Structure
File: src/index.html
- Replaced MVP two-panel layout with tabbed app shell.
- Added views: homeView, hostView, queuesView, vipView.
- Added Home search input and boss card container.
- Added Host form (boss select, trainer code, invite slider).
- Added My Queues sections for hosted raids and queue entries.
- Added VIP section with tier cards and toggle action.
- Kept existing connection/auth controls and made them part of the upgraded UI.

### 2) Styling
File: assets/styles.css
- Reworked design tokens and color system to a figma-like visual direction.
- Added responsive tab bar and view switch styling.
- Added boss card UI styles, stats blocks, chips, VIP cards, and host/queue sections.
- Added desktop/mobile responsive behavior for auth and card grids.

### 3) App Logic Rewrite
File: src/app.js
- Replaced old section rendering with multi-view rendering:
  - renderHome
  - renderHostBossSelect
  - renderQueues
  - renderVip
- Added state fields for: view, bosses, raidBosses, hosts, isVip, searchTerm.
- Added event handlers for:
  - tab navigation
  - boss search
  - join queue / join VIP
  - host form submit
  - queue leave / conflict resolution
  - VIP toggle
- Added authenticated flow guard for protected actions.
- Added robust refreshData orchestration for public + authenticated data.

### 4) API Layer Expansion
File: src/api/supabaseApi.js
- Added methods:
  - listBossQueueStats
  - listRaidBosses (with fallback query)
  - listMyHostedRaids
  - joinBossQueue
  - createRaid (friend_code fallback)
  - getVipStatus
  - activateVip
  - deactivateVip
- Expanded listActiveRaids/listMyQueues selects to support new UI requirements.

## Backend Adjustments

### 1) New Migration
File: pogo-raid-premium-backend/supabase/migrations/20260322170000_add_boss_profile_and_host_fields.sql
- Added raid_bosses fields:
  - image_url text
  - cp int
  - types text[]
- Added friend_code to:
  - user_profiles
  - raids
- Added boss_queue_stats view for boss-level queue/host stats.
- Added join_boss_queue RPC to route users into an active raid for a selected boss.
- Added grants for view/RPC access.

### 2) Seed Upgrade
File: pogo-raid-premium-backend/supabase/seed.sql
- Enriched raid_bosses seed rows with cp/image_url/types.
- Updated conflict handling so existing boss rows are upgraded on reseed.

## Validation
- Syntax checks:
  - node --check src/app.js
  - node --check src/api/supabaseApi.js
- Unit tests:
  - npm run test:unit
  - Result: pass (3/3)

## Deployment Notes
1. Apply backend migration before relying on boss_queue_stats and join_boss_queue.
2. Reseed local/dev DB so boss images/types/cp appear in Home cards.
3. Rebuild frontend dist after source changes.

## Known Compatibility Fallbacks
Frontend includes safe fallbacks if backend migration is not applied yet:
- If boss_queue_stats fails, Home cards are derived from active raids.
- If join_boss_queue RPC is unavailable, queue join falls back to join_raid_queue using a matching active raid.
- If raids.friend_code column is missing, host creation retries without friend_code.
