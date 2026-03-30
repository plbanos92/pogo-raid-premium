# Cloudflare Deployment Guide (pogo-raid-premium)

This is the production deployment runbook for this repository.

Important:
- This project is deployed as a Cloudflare Worker with static assets (not Cloudflare Pages).
- Wrangler config source is [wrangler.toml](wrangler.toml).
- Worker name is `pogo-raid-premium`.

## 1) Deployment Architecture

1. Source code lives in `src/` and `assets/`.
2. Build step copies assets into `dist/` via [scripts/build.js](scripts/build.js).
3. Wrangler reads [wrangler.toml](wrangler.toml):
   - `name = "pogo-raid-premium"`
   - `[assets] directory = "./dist"`
4. Deploy command publishes worker + assets to:
   - `https://pogo-raid-premium.plbanos92.workers.dev`

## 2) Prerequisites (One-Time Setup)

1. Install Node.js LTS.
2. Verify Node and npm:

```powershell
node -v
npm -v
```

3. Install project dependencies:

```powershell
npm install
```

4. Authenticate Wrangler with Cloudflare account:

```powershell
npx wrangler login
```

5. Verify connected account:

```powershell
npx wrangler whoami
```

Expected account:
- Account Name: `plbanos92`
- Account ID: `40fa129038c8d86d0bfb504489b3c587`

## 3) Daily Deployment Flow (Manual)

Run all commands from repository root:

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium
```

### Step 1: Check git state

```powershell
git status
```

### Step 2: Run unit tests

```powershell
npm run test:unit
```

### Step 3: Build production assets

```powershell
npm run build
```

### Step 4: Optional dry-run deploy

```powershell
npx wrangler deploy --dry-run
```

Dry-run confirms bundle and config resolve without publishing.

### Step 5: Deploy to Cloudflare

```powershell
npx wrangler deploy
```

Capture the output fields:
- Worker URL
- Current Version ID

### Step 6: Verify deployment exists remotely

```powershell
npx wrangler deployments list --name pogo-raid-premium
```

### Step 7: Smoke check in browser

1. Open `https://pogo-raid-premium.plbanos92.workers.dev`.
2. Hard refresh.
3. Confirm new UI is visible.
4. Confirm app can connect/auth and load boss/queue data.

## 4) Scripted Deployment Flow (Recommended)

This repository now includes scripts to avoid manual mistakes.

### 4.1 Check deployment status

Script: [scripts/cloudflare-status.ps1](scripts/cloudflare-status.ps1)

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium
.\scripts\cloudflare-status.ps1
```

What it does:
1. Runs `npx wrangler whoami`.
2. Lists deployments for `pogo-raid-premium`.
3. Lists recent worker versions.

### 4.2 Full deploy

Script: [scripts/cloudflare-deploy.ps1](scripts/cloudflare-deploy.ps1)

Standard deploy:

```powershell
.\scripts\cloudflare-deploy.ps1
```

Dry-run only:

```powershell
.\scripts\cloudflare-deploy.ps1 -DryRunOnly
```

Skip tests (emergency only):

```powershell
.\scripts\cloudflare-deploy.ps1 -SkipUnitTests
```

Skip build (only if `dist` is already freshly built):

```powershell
.\scripts\cloudflare-deploy.ps1 -SkipBuild
```

### 4.3 Rollback to a previous version

Script: [scripts/cloudflare-rollback.ps1](scripts/cloudflare-rollback.ps1)

1. Get target version ID from:

```powershell
npx wrangler deployments list --name pogo-raid-premium
```

2. Rollback:

```powershell
.\scripts\cloudflare-rollback.ps1 -VersionId <version-id>
```

3. Verify rollback deployment appears in list.

## 5) NPM Commands in This Repo

From [package.json](package.json):

```json
"build": "node ./scripts/build.js",
"dev": "npm run build && npx wrangler dev",
"start": "npm run build && npx wrangler dev",
"deploy": "npm run build && npx wrangler deploy"
```

Use:

```powershell
npm run deploy
```

for the quickest production publish path.

## 6) CI/CD (GitHub -> Cloudflare)

If you want automated deploy on push to `main`, use this pattern:

1. Add repo secret `CLOUDFLARE_API_TOKEN` with Worker deployment permissions.
2. Add repo secret `CLOUDFLARE_ACCOUNT_ID`.
3. Create workflow `.github/workflows/deploy-worker.yml` with steps:
   - checkout
   - setup node
   - npm ci
   - npm run test:unit
   - npm run build
   - npx wrangler deploy

Optional safety:
- Only deploy on protected branch merges.
- Require tests to pass before deploy job.

## 7) Troubleshooting Playbook

### Issue: `wrangler` not recognized

Use `npx wrangler ...` (already used by scripts and npm deploy command).

### Issue: Wrong account connected

1. Run `npx wrangler whoami`.
2. If wrong account:

```powershell
npx wrangler logout
npx wrangler login
```

### Issue: Deploy command succeeds but old UI still visible

1. Hard refresh browser.
2. Confirm latest version ID appears in:

```powershell
npx wrangler deployments list --name pogo-raid-premium
```

3. Confirm `dist/` contains expected files before deploy.

### Issue: Asset changes not uploaded

Wrangler may report no changed assets if output is identical. Rebuild and redeploy:

```powershell
npm run build
npx wrangler deploy
```

### Issue: Runtime errors after deploy

1. Roll back immediately using [scripts/cloudflare-rollback.ps1](scripts/cloudflare-rollback.ps1).
2. Collect logs:

```powershell
npx wrangler tail pogo-raid-premium
```

3. Fix locally, test, redeploy.

## 8) Release Checklist (Copy/Paste)

```powershell
cd C:\Users\paulo\Documents\projects\pogo\pogo-raid-premium
git status
npm run test:unit
npm run build
npx wrangler deploy --dry-run
npx wrangler deploy
npx wrangler deployments list --name pogo-raid-premium
```

If any step fails, stop and fix before continuing.
