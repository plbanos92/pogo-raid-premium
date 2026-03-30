/**
 * State machine integrity tests for RaidSync frontend.
 *
 * Guards the critical init → render → refresh → poll lifecycle chain.
 * These tests exist because the KISS refactor (March 2026) deleted 4 function
 * bodies from app.js without recreating them, which silently killed the entire
 * app. See: .github/plans/bugfix-missing-init-functions.md
 *
 * Test categories:
 *   1. Function existence — every function called in app.js must be defined
 *   2. Init chain resilience — safeInit wrappers, render try-catch
 *   3. Refresh data pipeline — Promise chain integrity
 *   4. Polling lifecycle — sync cursor, maintenance, countdown
 *   5. View handler registration — every initXxxActions is wired
 *   6. Data-attribute contract — views emit what app.js handles
 *   7. Script load order safety — assertGlobals presence
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.resolve(__dirname, "../../src/app.js"), "utf8");
const apiSource = fs.readFileSync(path.resolve(__dirname, "../../src/api/supabaseApi.js"), "utf8");

function hasFunctionDeclaration(source, name) {
  return new RegExp("\\bfunction\\s+" + name + "\\s*\\(").test(source);
}

function hasAppFunction(name) {
  return hasFunctionDeclaration(appSource, name);
}

// ═══════════════════════════════════════════════════════════════
// 1. FUNCTION EXISTENCE — every function called must be defined
// ═══════════════════════════════════════════════════════════════

test("all core helper functions exist in app.js", () => {
  var coreFunctions = [
    // State & config
    "isAuthed", "getApi", "ensureAuth", "handleSessionExpiry",
    // Rendering
    "render", "renderNav", "renderFooter", "renderAccountView",
    "renderHomeView", "renderHostBossSelectView", "renderHostSuccessView",
    "renderQueuesView", "renderVipView", "renderAdminView",
    "updateRenderedHtml", "showToast", "dismissToast", "setLoading",
    "setMessage", "switchView",
    // Data pipeline
    "refreshData", "rethrowIfExpired", "attachQueueHostProfiles",
    "loadProfileWithFallback", "pickProfileRow", "buildBossesFromRaids",
    // Sync & polling
    "getSyncPollInterval", "getMaintenanceInterval", "runQueueMaintenance",
    "getQueueSyncCursor", "captureQueueSyncCursor",
    "normalizeSyncCursor", "syncCursorChanged",
    // Init chain
    "init", "safeInit", "assertGlobals",
    "initAccountActions", "initNavigation", "initHomeActions",
    "initHostForm", "initQueueActions", "initVipActions", "initAdminActions",
    // Host form helpers
    "applyHostCapacityState",
    // Queue interaction helpers
    "openManageLobby", "bindDirectManageLobbyActions",
    "findFallbackRaidIdByBossId",
    // Misc UI helpers
    "openDrawer", "closeDrawer", "postRenderQueueEffects",
    "postRenderAccountEffects", "renderQrSvg", "formatRelativeTime",
    "handleAuthCallback"
  ];

  var missing = coreFunctions.filter(function (name) {
    return !hasAppFunction(name);
  });

  assert.deepEqual(
    missing, [],
    "Functions called in app.js but missing definitions: " + missing.join(", ")
  );
});

// ═══════════════════════════════════════════════════════════════
// 2. INIT CHAIN RESILIENCE — safeInit for every view initializer
// ═══════════════════════════════════════════════════════════════

test("every initXxxActions call is wrapped in safeInit", () => {
  var initFns = [
    "initAccountActions", "initNavigation", "initHomeActions",
    "initHostForm", "initQueueActions", "initVipActions", "initAdminActions"
  ];

  initFns.forEach(function (fn) {
    var pattern = new RegExp("safeInit\\('" + fn + "',\\s*" + fn + "\\)");
    assert.equal(
      pattern.test(appSource), true,
      fn + " is not wrapped in safeInit — a crash there kills the entire app"
    );
  });
});

test("store.subscribe wraps render in try-catch", () => {
  assert.equal(
    /store\.subscribe\(function\s*\(state\)\s*\{\s*try\s*\{\s*render\(state\);\s*\}\s*catch/.test(appSource),
    true,
    "render() inside store.subscribe must be wrapped in try-catch"
  );
});

test("safeInit catches errors and logs them without rethrowing", () => {
  assert.equal(
    /function\s+safeInit\s*\(\s*name\s*,\s*fn\s*\)\s*\{\s*try\s*\{\s*fn\(\);\s*\}\s*catch\s*\(err\)\s*\{\s*console\.error/.test(appSource),
    true,
    "safeInit must try { fn(); } catch (err) { console.error(...) }"
  );
});

// ═══════════════════════════════════════════════════════════════
// 3. REFRESH DATA PIPELINE — correct Promise chain structure
// ═══════════════════════════════════════════════════════════════

test("refreshData fetches raids and raidBosses unconditionally", () => {
  assert.equal(
    /var\s+raidsPromise\s*=\s*api\.listActiveRaids\(\)/.test(appSource), true,
    "refreshData must call api.listActiveRaids()"
  );
  assert.equal(
    /var\s+raidBossesPromise\s*=\s*api\.listRaidBosses\(\)/.test(appSource), true,
    "refreshData must call api.listRaidBosses()"
  );
});

test("refreshData gates user-specific fetches behind auth check", () => {
  // All user-specific promises are set inside an if-block checking userId+token
  assert.equal(
    /if\s*\(state\.config\.userId\s*&&\s*state\.config\.token\)\s*\{/.test(appSource), true,
    "refreshData must gate user fetches behind userId && token check"
  );
});

test("refreshData catch chains use rethrowIfExpired for 401 propagation", () => {
  var catchCount = (appSource.match(/\.catch\(rethrowIfExpired\)/g) || []).length;
  assert.ok(
    catchCount >= 3,
    "Expected at least 3 rethrowIfExpired catch guards, found " + catchCount
  );
});

test("refreshData 401 catch calls handleSessionExpiry", () => {
  // The final .catch in refreshData must handle 401
  assert.equal(
    /\.catch\(function\s*\(err\)\s*\{[\s\S]*?if\s*\(err\s*&&\s*err\.status\s*===\s*401\)\s*\{[\s\S]*?handleSessionExpiry\(\)/.test(appSource),
    true,
    "refreshData top-level catch must call handleSessionExpiry on 401"
  );
});

test("refreshData ends with setLoading(false) in finally block", () => {
  assert.equal(
    /\.finally\(function\s*\(\)\s*\{\s*setLoading\(false\);\s*\}\)/.test(appSource),
    true,
    "refreshData must call setLoading(false) in .finally()"
  );
});

test("buildBossesFromRaids is used as fallback in refreshData", () => {
  assert.equal(
    /bosses:\s*buildBossesFromRaids\(raids\)/.test(appSource), true,
    "refreshData must fall back to buildBossesFromRaids when listBossQueueStats fails"
  );
});

// ═══════════════════════════════════════════════════════════════
// 4. POLLING LIFECYCLE — sync, maintenance, countdown
// ═══════════════════════════════════════════════════════════════

test("poll timer calls getMaintenanceInterval and runQueueMaintenance", () => {
  assert.equal(
    /var\s+maintenanceInterval\s*=\s*getMaintenanceInterval\(s\)/.test(appSource), true,
    "Poll must compute maintenance interval"
  );
  assert.equal(
    /runQueueMaintenance\(api,\s*s\)/.test(appSource), true,
    "Poll must call runQueueMaintenance"
  );
});

test("poll timer checks syncCursorChanged before full refresh", () => {
  assert.equal(
    /syncCursorChanged\(store\.getState\(\)\.syncCursor,\s*nextCursor\)/.test(appSource), true,
    "Poll must compare sync cursors before triggering refreshData"
  );
});

test("poll timer reschedules on error instead of dying", () => {
  // After the main poll promise chain there must be a .catch that calls scheduleNextPoll
  assert.equal(
    /\.catch\(function\s*\(err\)\s*\{[\s\S]*?scheduleNextPoll\(\)[\s\S]*?\}\);/.test(appSource),
    true,
    "Poll catch block must call scheduleNextPoll to avoid silent death"
  );
});

test("poll timer handles 401 in catch block", () => {
  // The poll catch must check for 401 and call handleSessionExpiry
  assert.equal(
    /\.catch\(function\s*\(err\)\s*\{[\s\S]*?err\.status\s*===\s*401[\s\S]*?handleSessionExpiry\(\)/.test(appSource),
    true,
    "Poll catch must handle 401 with handleSessionExpiry"
  );
});

test("refreshData triggers scheduleNextPoll after initial load", () => {
  assert.equal(
    /refreshData\(\)\.then\(function\s*\(\)\s*\{[\s\S]*?scheduleNextPoll\(\)/.test(appSource), true,
    "init must call refreshData().then(scheduleNextPoll)"
  );
});

// ═══════════════════════════════════════════════════════════════
// 5. VIEW HANDLER REGISTRATION — each init attaches listeners
// ═══════════════════════════════════════════════════════════════

test("initQueueActions attaches click listener on queuesContent", () => {
  assert.equal(
    /function\s+initQueueActions[\s\S]*?qs\("queuesContent"\)\.addEventListener\("click"/.test(appSource),
    true,
    "initQueueActions must attach click handler to #queuesContent"
  );
});

test("initHomeActions attaches click listener on activeRaids", () => {
  assert.equal(
    /function\s+initHomeActions[\s\S]*?qs\("activeRaids"\)\.addEventListener\("click"/.test(appSource),
    true,
    "initHomeActions must attach click handler to #activeRaids"
  );
});

test("initAccountActions attaches click listener on accountContent", () => {
  assert.equal(
    /function\s+initAccountActions[\s\S]*?qs\("accountContent"\)[\s\S]*?\.addEventListener\("click"/.test(appSource),
    true,
    "initAccountActions must attach click handler to #accountContent"
  );
});

test("initVipActions attaches click listener on vipContent", () => {
  assert.equal(
    /function\s+initVipActions[\s\S]*?qs\("vipContent"\)\.addEventListener\("click"/.test(appSource),
    true,
    "initVipActions must attach click handler to #vipContent"
  );
});

test("initNavigation attaches click listener on navLinks", () => {
  assert.equal(
    /function\s+initNavigation[\s\S]*?qs\("navLinks"\)\.addEventListener\("click"/.test(appSource),
    true,
    "initNavigation must attach click handler to #navLinks"
  );
});

// ═══════════════════════════════════════════════════════════════
// 6. DATA-ATTRIBUTE CONTRACT — views emit, app.js handles
// ═══════════════════════════════════════════════════════════════

test("initQueueActions handles all queue data-attributes from views", () => {
  var queueAttributes = [
    "data-leave", "data-keep", "data-view", "data-friend-sent",
    "data-finish-raiding", "data-manage-lobby", "data-close-lobby",
    "data-start-raid", "data-host-finish", "data-copy-fc",
    "data-toggle-lobby-qr", "data-toggle-all-lobby-qrs",
    "data-toggle-lobby-info"
  ];

  queueAttributes.forEach(function (attr) {
    assert.equal(
      appSource.indexOf('"' + attr + '"') >= 0 || appSource.indexOf("'" + attr + "'") >= 0,
      true,
      "app.js must handle " + attr + " from queuesView.js"
    );
  });
});

test("initHomeActions handles boss join data-attributes", () => {
  ["data-boss-toggle", "data-join-boss", "data-join-vip", "data-join-vip-direct"].forEach(function (attr) {
    assert.equal(
      appSource.indexOf('"' + attr + '"') >= 0 || appSource.indexOf("'" + attr + "'") >= 0,
      true,
      "app.js must handle " + attr + " from homeView.js"
    );
  });
});

test("initAccountActions handles account data-attributes", () => {
  ["data-auth-tab", "data-copy-deeplink", "data-copy-value"].forEach(function (attr) {
    assert.equal(
      appSource.indexOf('"' + attr + '"') >= 0 || appSource.indexOf("'" + attr + "'") >= 0,
      true,
      "app.js must handle " + attr + " from accountView.js"
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. SCRIPT LOAD ORDER SAFETY — assertGlobals
// ═══════════════════════════════════════════════════════════════

test("assertGlobals checks for required modules", () => {
  ["AppConfig", "AppStore", "SupabaseApi"].forEach(function (name) {
    assert.equal(
      appSource.indexOf("'" + name + "'") >= 0 || appSource.indexOf('"' + name + '"') >= 0,
      true,
      "assertGlobals must check for " + name
    );
  });
});

test("init calls assertGlobals before anything else", () => {
  assert.equal(
    /function\s+init\(\)\s*\{\s*assertGlobals\(\);/.test(appSource),
    true,
    "init() must call assertGlobals() as its very first statement"
  );
});

// ═══════════════════════════════════════════════════════════════
// 8. API CLIENT COMPLETENESS — every RPC/endpoint used by app.js
// ═══════════════════════════════════════════════════════════════

test("API client exposes all methods called by app.js and views", () => {
  var requiredMethods = [
    "listActiveRaids", "listBossQueueStats", "listRaidBosses",
    "listMyQueues", "listMyHostedRaids",
    "joinBossQueue", "joinRaidQueue", "createRaid",
    "leaveQueue", "confirmInvite",
    "expireStaleInvites", "startRaid", "checkHostInactivity",
    "listRaidQueue", "getRaidHostProfile",
    "finishRaiding", "hostFinishRaiding",
    "getMyProfile", "ensureMyProfile", "updateMyProfile",
    "getMyAccountStats",
    "getVipStatus", "activateVip", "deactivateVip",
    "getQueueSnapshot", "getQueueSyncState",
    "getAppConfig", "checkIsAdmin",
    "signUp", "signIn"
  ];

  var missing = requiredMethods.filter(function (method) {
    return !new RegExp(method + ":\\s*function").test(apiSource);
  });

  assert.deepEqual(
    missing, [],
    "API client missing method definitions: " + missing.join(", ")
  );
});

// ═══════════════════════════════════════════════════════════════
// 9. HOST FORM CAPACITY — applyHostCapacityState wiring
// ═══════════════════════════════════════════════════════════════

test("initHostForm calls applyHostCapacityState on init and subscribe", () => {
  assert.equal(
    /function\s+initHostForm[\s\S]*?applyHostCapacityState\(store\.getState\(\)\.isVip\)/.test(appSource),
    true,
    "initHostForm must call applyHostCapacityState on initial setup"
  );
  assert.equal(
    /store\.subscribe\(function\s*\(state\)\s*\{[\s\S]*?applyHostCapacityState\(state\.isVip\)/.test(appSource),
    true,
    "initHostForm must call applyHostCapacityState on state updates via subscribe"
  );
});

// ═══════════════════════════════════════════════════════════════
// 10. PROFILE SELF-HEAL — loadProfileWithFallback chain
// ═══════════════════════════════════════════════════════════════

test("loadProfileWithFallback calls getMyProfile then ensureMyProfile on null", () => {
  assert.equal(
    /function\s+loadProfileWithFallback[\s\S]*?api\.getMyProfile\(userId\)/.test(appSource), true,
    "loadProfileWithFallback must call getMyProfile first"
  );
  assert.equal(
    /function\s+loadProfileWithFallback[\s\S]*?api\.ensureMyProfile\(userId\)/.test(appSource), true,
    "loadProfileWithFallback must fall back to ensureMyProfile when profile is null"
  );
});

test("refreshData uses loadProfileWithFallback for authenticated users", () => {
  assert.equal(
    /profilePromise\s*=\s*loadProfileWithFallback\(api,\s*state\.config\.userId\)/.test(appSource), true,
    "refreshData must use loadProfileWithFallback, not getMyProfile directly"
  );
});
