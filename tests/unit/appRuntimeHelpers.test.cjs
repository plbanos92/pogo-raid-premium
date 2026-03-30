const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJsPath = path.resolve(__dirname, "../../src/app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");

function hasFunctionDeclaration(name) {
  return new RegExp("\\bfunction\\s+" + name + "\\s*\\(").test(appSource);
}

test("app.js keeps rethrowIfExpired helper declaration", () => {
  assert.equal(
    hasFunctionDeclaration("rethrowIfExpired"),
    true,
    "Missing function rethrowIfExpired in src/app.js"
  );
});

test("refreshData catch chains still use rethrowIfExpired", () => {
  assert.equal(
    /\.catch\(rethrowIfExpired\)/.test(appSource),
    true,
    "Expected refreshData request catches to call rethrowIfExpired"
  );
});

test("app.js keeps queue sync helper declarations", () => {
  assert.equal(
    hasFunctionDeclaration("getQueueSyncCursor"),
    true,
    "Missing function getQueueSyncCursor in src/app.js"
  );

  assert.equal(
    hasFunctionDeclaration("captureQueueSyncCursor"),
    true,
    "Missing function captureQueueSyncCursor in src/app.js"
  );
});

test("queue sync helpers remain wired to refresh and polling flow", () => {
  assert.equal(
    /return\s+captureQueueSyncCursor\(api,\s*store\.getState\(\)\.managingLobby\)/.test(appSource),
    true,
    "Expected refresh flow to persist sync cursor via captureQueueSyncCursor"
  );

  assert.equal(
    /return\s+getQueueSyncCursor\(api,\s*store\.getState\(\)\.managingLobby\)/.test(appSource),
    true,
    "Expected polling flow to fetch sync cursor via getQueueSyncCursor"
  );
});

test("app.js keeps auth helper declarations used by queue actions", () => {
  assert.equal(
    hasFunctionDeclaration("ensureAuth"),
    true,
    "Missing function ensureAuth in src/app.js"
  );

  assert.equal(
    hasFunctionDeclaration("handleSessionExpiry"),
    true,
    "Missing function handleSessionExpiry in src/app.js"
  );
});

test("Manage Lobby flow remains guarded by ensureAuth and 401 handling", () => {
  assert.equal(
    /function\s+initQueueActions\s*\([\s\S]*?if\s*\(!ensureAuth\(\)\)\s*return;/.test(appSource),
    true,
    "Expected initQueueActions to guard actions with ensureAuth"
  );

  assert.equal(
    /var\s+manageLobby\s*=\s*target\.getAttribute\("data-manage-lobby"\)[\s\S]*?catch\(function\s*\(err\)\s*\{[\s\S]*?handleSessionExpiry\(\)/.test(appSource),
    true,
    "Expected Manage Lobby error path to call handleSessionExpiry on 401"
  );
});

test("queue click delegation handles non-element targets safely", () => {
  assert.equal(
    /var\s+origin\s*=\s*e\.target\s*&&\s*e\.target\.nodeType\s*===\s*1\s*\?\s*e\.target\s*:\s*e\.target\s*&&\s*e\.target\.parentElement;/.test(appSource),
    true,
    "Expected queue click handler to normalize text-node targets"
  );

  assert.equal(
    /if\s*\(!origin\s*\|\|\s*typeof\s+origin\.closest\s*!==\s*"function"\)\s*return;/.test(appSource),
    true,
    "Expected queue click handler to guard closest() access"
  );
});

test("Manage Lobby has shared helper and direct button binding fallback", () => {
  assert.equal(
    hasFunctionDeclaration("openManageLobby"),
    true,
    "Missing function openManageLobby in src/app.js"
  );

  assert.equal(
    hasFunctionDeclaration("bindDirectManageLobbyActions"),
    true,
    "Missing function bindDirectManageLobbyActions in src/app.js"
  );

  assert.equal(
    /bindDirectManageLobbyActions\(\);/.test(appSource),
    true,
    "Expected queue post-render flow to bind direct Manage Lobby handlers"
  );

  assert.equal(
    /btn\.addEventListener\("pointerup",\s*function\s*\(e\)\s*\{[\s\S]*?activate\(e\);[\s\S]*?\}\);/.test(appSource),
    true,
    "Expected direct Manage Lobby handler to support touch/pointer activation"
  );
});

test("refreshData keeps profile self-heal fallback helpers", () => {
  assert.equal(
    hasFunctionDeclaration("loadProfileWithFallback"),
    true,
    "Missing function loadProfileWithFallback in src/app.js"
  );

  assert.equal(
    /profilePromise\s*=\s*loadProfileWithFallback\(api,\s*state\.config\.userId\);/.test(appSource),
    true,
    "Expected refreshData to load profile with fallback provisioning"
  );
});

test("api client keeps ensureMyProfile upsert helper", () => {
  var apiSource = fs.readFileSync(path.resolve(__dirname, "../../src/api/supabaseApi.js"), "utf8");
  assert.equal(
    /ensureMyProfile:\s*function\s*\(userId\)\s*\{/.test(apiSource),
    true,
    "Missing ensureMyProfile API helper in src/api/supabaseApi.js"
  );

  assert.equal(
    /Prefer:\s*"resolution=merge-duplicates,return=representation"/.test(apiSource),
    true,
    "Expected ensureMyProfile to upsert with merge-duplicates preference"
  );
});

test("app.js declares applyHostCapacityState for host form VIP capacity", () => {
  assert.equal(
    hasFunctionDeclaration("applyHostCapacityState"),
    true,
    "Missing function applyHostCapacityState in src/app.js"
  );
});

test("app.js declares buildBossesFromRaids fallback for boss list", () => {
  assert.equal(
    hasFunctionDeclaration("buildBossesFromRaids"),
    true,
    "Missing function buildBossesFromRaids in src/app.js"
  );
});

test("app.js declares getMaintenanceInterval for poll timing", () => {
  assert.equal(
    hasFunctionDeclaration("getMaintenanceInterval"),
    true,
    "Missing function getMaintenanceInterval in src/app.js"
  );
});

test("app.js declares runQueueMaintenance for stale invite expiry", () => {
  assert.equal(
    hasFunctionDeclaration("runQueueMaintenance"),
    true,
    "Missing function runQueueMaintenance in src/app.js"
  );
});

test("init uses safeInit wrappers so one failure does not kill the app", () => {
  assert.equal(
    hasFunctionDeclaration("safeInit"),
    true,
    "Missing function safeInit in src/app.js"
  );

  assert.equal(
    /safeInit\('initQueueActions',\s*initQueueActions\)/.test(appSource),
    true,
    "Expected initQueueActions to be wrapped in safeInit"
  );

  assert.equal(
    /safeInit\('initHostForm',\s*initHostForm\)/.test(appSource),
    true,
    "Expected initHostForm to be wrapped in safeInit"
  );
});

test("store.subscribe wraps render in try-catch for resilience", () => {
  assert.equal(
    /store\.subscribe\(function\s*\(state\)\s*\{\s*try\s*\{\s*render\(state\);\s*\}\s*catch/.test(appSource),
    true,
    "Expected store subscriber to wrap render() in try-catch"
  );
});
