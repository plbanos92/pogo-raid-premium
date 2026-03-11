# Pogo Raid Premium — Cloudflare Pages boilerplate

Minimal Cloudflare Pages project scaffold.

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

Notes
- Update account_id in wrangler.toml (or log in with `wrangler login`).
- Pages Functions (serverless) go in the `functions/` directory.

Files added by this scaffold:
- index.html — site entry
- assets/styles.css — basic styling
- wrangler.toml — Wrangler config
- package.json — scripts for dev/deploy
- functions/hello.js — example Pages Function

