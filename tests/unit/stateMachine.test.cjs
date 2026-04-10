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
    // Misc UI helpers
    "openDrawer", "closeDrawer", "postRenderQueueEffects",
    "postRenderAccountEffects", "renderQrSvg", "formatRelativeTime",
    "handleAuthCallback",
    "initRealtimeMode",
    "teardownRealtimeMode",
    "handleRealtimeEvent",
    "handleRealtimeDemotion"
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
    /\.finally\(function\s*\(\)\s*\{[^}]*setLoading\(false\)/.test(appSource),
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
    "data-toggle-lobby-info",
    "data-rejoin-boss", "data-delete-queue", "data-delete-lobby"
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
    "joinBossQueue", "createRaid",
    "leaveQueue", "confirmInvite",
    "expireStaleInvites", "startRaid", "checkHostInactivity", "touchHostActivity",
    "listRaidQueue", "getRaidHostProfile",
    "finishRaiding", "hostFinishRaiding",
    "cancelRaid", "deleteQueueEntry",
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

// ═══════════════════════════════════════════════════════════════
// 8. REALTIME API CONTRACT — new RPC methods in supabaseApi.js
// ═══════════════════════════════════════════════════════════════

test("supabaseApi exposes getRealtimeSlotStats method", () => {
  assert.equal(
    /getRealtimeSlotStats:\s*function/.test(apiSource), true,
    "supabaseApi must define getRealtimeSlotStats"
  );
});

test("supabaseApi exposes claimRealtimeSlot method", () => {
  assert.equal(
    /claimRealtimeSlot:\s*function/.test(apiSource), true,
    "supabaseApi must define claimRealtimeSlot"
  );
});

test("supabaseApi exposes releaseRealtimeSlot method", () => {
  assert.equal(
    /releaseRealtimeSlot:\s*function/.test(apiSource), true,
    "supabaseApi must define releaseRealtimeSlot"
  );
});

// ═══════════════════════════════════════════════════════════════
// 9. _refreshInFlight GUARD — conflict-prevention assertions
// ═══════════════════════════════════════════════════════════════

test("_refreshInFlight flag is declared before refreshData", () => {
  assert.equal(
    /var\s+_refreshInFlight\s*=\s*false/.test(appSource), true,
    "_refreshInFlight must be declared as var _refreshInFlight = false"
  );
});

test("refreshData sets _refreshInFlight = true at start", () => {
  assert.equal(
    /_refreshInFlight\s*=\s*true/.test(appSource), true,
    "refreshData must set _refreshInFlight = true as its first statement"
  );
});

test("refreshData resets _refreshInFlight = false in .finally()", () => {
  assert.equal(
    /\.finally\s*\([\s\S]{0,150}_refreshInFlight\s*=\s*false/.test(appSource), true,
    "refreshData must reset _refreshInFlight in .finally() block"
  );
});

test("handleRealtimeEvent guards against _refreshInFlight", () => {
  assert.ok(
    /function\s+handleRealtimeEvent\s*\(\)\s*\{[\s\S]*?_refreshInFlight/.test(appSource),
    "handleRealtimeEvent must guard against concurrent refreshes via _refreshInFlight"
  );
});

test("scheduleNextPoll guards syncCursorChanged branch with _refreshInFlight", () => {
  assert.equal(
    /syncCursorChanged[\s\S]{0,200}_refreshInFlight[^}]*scheduleNextPoll\(\)[^}]*return/.test(appSource), true,
    "syncCursorChanged branch must check _refreshInFlight before calling refreshData"
  );
});

test("getSyncPollInterval returns IDLE_MS when in realtime mode (C-0)", () => {
  assert.equal(
    /realtimeMode\s*===\s*['"]realtime['"][\s\S]{0,30}managingLobby/.test(appSource), true,
    "getSyncPollInterval must short-circuit to IDLE_MS when realtimeMode === 'realtime' and not managingLobby"
  );
});

// ═══════════════════════════════════════════════════════════════
// 11. FOOTER FRESHNESS — renderFooter called on every data sync
//
// Regression guard for: "Synced Ns ago" not updating when slot
// count pill changes or a full refresh completes.
// ═══════════════════════════════════════════════════════════════

test("refreshData pipeline calls renderFooter immediately after store.setState(payload)", () => {
  // The .then(payload) handler must call renderFooter right after persisting the payload.
  assert.equal(
    /store\.setState\(payload\);\s*(?:\/\/[^\n]+\n\s*)?renderFooter\(store\.getState\(\)\);/.test(appSource),
    true,
    "refreshData must call renderFooter(store.getState()) immediately after store.setState(payload)"
  );
});

test("slot stats poll timer includes lastRefreshedAt on every tick", () => {
  // The _slotStatsPollTimer callback must update lastRefreshedAt alongside realtimeSlotStats
  // so the footer timestamp stays current even when only the slot count changes.
  assert.equal(
    /realtimeSlotStats:\s*stats,\s*lastRefreshedAt:\s*new Date\(\)/.test(appSource),
    true,
    "_slotStatsPollTimer must set lastRefreshedAt: new Date() together with realtimeSlotStats"
  );
});

test("slot stats poll timer calls renderFooter after each stats update", () => {
  // renderFooter must be called inside the _slotStatsPollTimer callback so the pill
  // change is immediately reflected in the 'Synced Ns ago' text.
  assert.equal(
    /_slotStatsPollTimer\s*=\s*setInterval[\s\S]{0,300}renderFooter\(store\.getState\(\)\)/.test(appSource),
    true,
    "_slotStatsPollTimer callback must call renderFooter(store.getState()) after updating slot stats"
  );
});

// ═══════════════════════════════════════════════════════════════
// 12. HEARTBEAT SELF-TERMINATION GUARD
//
// Regression guard for: pre-fix tabs keeping stale realtime
// sessions alive via a baked-in JWT after sign-out, because
// _heartbeatTimer was never cleared. The guard makes any
// lingering heartbeat self-destruct on its next tick when the
// store no longer reflects realtime mode.
// ═══════════════════════════════════════════════════════════════

test("heartbeat timer checks realtimeMode before firing the claim RPC", () => {
  assert.equal(
    /store\.getState\(\)\.realtimeMode\s*!==\s*['"]realtime['"]/.test(appSource),
    true,
    "_heartbeatTimer must guard against stale sessions by checking store.getState().realtimeMode !== 'realtime'"
  );
});

test("heartbeat self-terminates by calling clearInterval(_heartbeatTimer)", () => {
  assert.equal(
    /store\.getState\(\)\.realtimeMode\s*!==\s*['"]realtime['"][\s\S]{0,150}clearInterval\(_heartbeatTimer\)/.test(appSource),
    true,
    "When realtimeMode !== 'realtime', heartbeat must call clearInterval(_heartbeatTimer)"
  );
});

test("heartbeat self-termination nullifies the _heartbeatTimer reference", () => {
  // Nullifying prevents a second clearInterval on a dead timer during teardownRealtimeMode.
  assert.equal(
    /clearInterval\(_heartbeatTimer\);\s*_heartbeatTimer\s*=\s*null/.test(appSource),
    true,
    "heartbeat self-termination must set _heartbeatTimer = null after clearInterval"
  );
});

// ═══════════════════════════════════════════════════════════════
// 13. BFCACHE PAGESHOW RECOVERY
//
// Regression guard for: pressing the browser back button restores
// the page from bfcache without re-running DOMContentLoaded, so
// initRealtimeMode is never called and VIP users stay in polling.
// The pageshow listener re-checks eligibility and re-initialises
// the realtime WS on every bfcache restore.
// ═══════════════════════════════════════════════════════════════

test("pageshow event listener is registered in init", () => {
  assert.equal(
    /window\.addEventListener\s*\(\s*['"]pageshow['"]/.test(appSource),
    true,
    "init must register a window 'pageshow' event listener to handle bfcache restores"
  );
});

test("pageshow handler is a no-op for normal (non-persisted) page loads", () => {
  // Only bfcache restores should trigger the re-init path.
  assert.equal(
    /if\s*\(!e\.persisted\)\s*return/.test(appSource),
    true,
    "pageshow handler must return early when e.persisted === false"
  );
});

test("pageshow handler calls refreshData to get fresh state on bfcache restore", () => {
  assert.equal(
    /window\.addEventListener[\s\S]{0,800}pageshow[\s\S]{0,800}refreshData\(\)/.test(appSource) ||
    /pageshow[\s\S]{0,800}refreshData\(\)/.test(appSource),
    true,
    "pageshow handler must call refreshData() to fetch up-to-date VIP/slot state"
  );
});

test("pageshow handler attempts to re-init realtime after bfcache restore", () => {
  // Accept both: initRealtimeMode(getApi()) directly, or via a captured local 'api' variable
  assert.equal(
    /pageshow[\s\S]{0,1200}initRealtimeMode\((?:getApi\(\)|api)\)/.test(appSource),
    true,
    "pageshow handler must call initRealtimeMode to upgrade eligible users from polling"
  );
});

test("pageshow handler tears down stale realtime WS before re-initialising", () => {
  // When page was in realtime mode at freeze time, the WS is dead after bfcache restore.
  // Must teardown before re-init to avoid duplicate timers and orphaned slots.
  assert.equal(
    /pageshow[\s\S]{0,800}teardownRealtimeMode/.test(appSource),
    true,
    "pageshow handler must call teardownRealtimeMode for the realtime→realtime recovery path"
  );
});
// ═══════════════════════════════════════════════════════════════
// 14. VISIBILITY CHANGE RECOVERY (APP-SWITCH / SCREEN LOCK)
//
// Regression guard for: user switches to another app (or locks screen)
// for >30s — the mobile OS kills the WebSocket during that time.
// visibilitychange fires on return; pageshow does NOT. Without this
// listener the user is stuck in dead-realtime until a hard refresh.
// ═══════════════════════════════════════════════════════════════

test("_hiddenAt variable is declared at module level in app.js", () => {
  assert.equal(
    /var\s+_hiddenAt\s*=\s*null/.test(appSource),
    true,
    "_hiddenAt must be declared at module level to track when the tab became hidden"
  );
});

test("sessionMachine (SessionFSM) is declared at module level in app.js", () => {
  assert.equal(
    /var\s+sessionMachine\s*=\s*SessionFSM\.createSessionMachine/.test(appSource),
    true,
    "sessionMachine must be declared at module level using SessionFSM.createSessionMachine (replaces _recoveryInFlight + _demotionInFlight)"
  );
});

test("_recoveryWatchdog variable is declared at module level in app.js", () => {
  assert.equal(
    /var\s+_recoveryWatchdog\s*=\s*null/.test(appSource),
    true,
    "_recoveryWatchdog must be declared at module level to reset the flag if teardown hangs"
  );
});

test("STALE_THRESHOLD_MS is declared at module level in app.js", () => {
  assert.equal(
    /var\s+STALE_THRESHOLD_MS\s*=\s*30000/.test(appSource),
    true,
    "STALE_THRESHOLD_MS must be declared at module level (not inside init) so it is auditable and testable"
  );
});

test("visibilitychange listener is registered in app.js", () => {
  assert.equal(
    /document\.addEventListener\s*\(\s*['"]visibilitychange['"]/.test(appSource),
    true,
    "app.js must register a document 'visibilitychange' listener for app-switch recovery"
  );
});

test("pageshow handler uses SessionFSM guard before starting recovery", () => {
  assert.equal(
    /pageshow[\s\S]{0,600}sessionMachine\.can/.test(appSource),
    true,
    "pageshow handler must use sessionMachine.can() to guard against racing with visibilitychange recovery"
  );
});

test("app.js contains sessionMachine.transition calls (Phase 6 wiring)", () => {
  assert.equal(
    /sessionMachine\.transition/.test(appSource),
    true,
    "app.js must wire sessionMachine.transition() calls confirming Phase 6 FSM integration"
  );
});

test("_recoveryWatchdog setTimeout is wired in app.js", () => {
  assert.equal(
    /_recoveryWatchdog\s*=\s*setTimeout/.test(appSource),
    true,
    "_recoveryWatchdog must be armed via setTimeout so the flag resets if teardown hangs on a dead network"
  );
});

// ═══════════════════════════════════════════════════════════════
// 15. PHASE 3 — POLL INTERVAL / HEAT DELEGATION TO QueueFSM
// ═══════════════════════════════════════════════════════════════

const queueFsmSource = fs.readFileSync(path.resolve(__dirname, '../../src/state-machines/queueStateMachine.js'), 'utf8');

test("getSyncPollInterval in app.js delegates to QueueFSM.getSyncHeat", () => {
  assert.equal(
    /QueueFSM\.getSyncHeat/.test(appSource), true,
    "getSyncPollInterval must delegate to QueueFSM.getSyncHeat(state)"
  );
});

test("getMaintenanceInterval in app.js delegates to QueueFSM.getMaintenanceHeat", () => {
  assert.equal(
    /QueueFSM\.getMaintenanceHeat/.test(appSource), true,
    "getMaintenanceInterval must delegate to QueueFSM.getMaintenanceHeat(state)"
  );
});

test("QueueFSM.getSyncHeat is declared as a function in queueStateMachine.js", () => {
  assert.equal(
    hasFunctionDeclaration(queueFsmSource, 'getSyncHeat'), true,
    "queueStateMachine.js must declare function getSyncHeat"
  );
});

test("QueueFSM.getMaintenanceHeat is declared as a function in queueStateMachine.js", () => {
  assert.equal(
    hasFunctionDeclaration(queueFsmSource, 'getMaintenanceHeat'), true,
    "queueStateMachine.js must declare function getMaintenanceHeat"
  );
});

// ═══════════════════════════════════════════════════════════════
// 16. PHASE 5 — queuesView uses QueueFSM for status meta
//
// Guards that raw status-pill CSS class ternary chains have been
// removed from queuesView.js and replaced with QueueFSM calls.
// If any of these ternary literals reappear, the migration was
// partially reverted.
// ═══════════════════════════════════════════════════════════════

const queuesViewSource = fs.readFileSync(path.resolve(__dirname, '../../src/views/queuesView.js'), 'utf8');

test("queuesView.js has no raw status-pill CSS class ternary for 'confirmed'", () => {
  assert.equal(
    /\? 'status-confirmed'/.test(queuesViewSource), false,
    "queuesView.js must not contain ? 'status-confirmed' ternary — use deps.QueueFSM.getQueueStatusMeta().cssClass instead"
  );
});

test("queuesView.js has no raw status-pill CSS class ternary for 'invited'", () => {
  assert.equal(
    /\? 'status-invited'/.test(queuesViewSource), false,
    "queuesView.js must not contain ? 'status-invited' ternary — use deps.QueueFSM.getQueueStatusMeta().cssClass instead"
  );
});

test("queuesView.js has no raw status-pill CSS class ternary for 'raiding'", () => {
  assert.equal(
    /\? 'status-raiding'/.test(queuesViewSource), false,
    "queuesView.js must not contain ? 'status-raiding' ternary — use deps.QueueFSM.getQueueStatusMeta().cssClass instead"
  );
});

test("queuesView.js has no raw status-pill CSS class ternary for 'done'", () => {
  assert.equal(
    /\? 'status-done'/.test(queuesViewSource), false,
    "queuesView.js must not contain ? 'status-done' ternary — use deps.QueueFSM.getQueueStatusMeta().cssClass instead"
  );
});

test("queuesView.js delegates status CSS class to QueueFSM.getQueueStatusMeta", () => {
  assert.equal(
    /deps\.QueueFSM\.getQueueStatusMeta/.test(queuesViewSource), true,
    "queuesView.js must call deps.QueueFSM.getQueueStatusMeta() for status pill CSS classes"
  );
});

test("app.js passes QueueFSM into renderQueues deps", () => {
  assert.equal(
    /QueueFSM\s*:\s*global\.QueueFSM/.test(appSource), true,
    "renderQueuesView() in app.js must pass QueueFSM: global.QueueFSM into the deps object"
  );
});

// ═══════════════════════════════════════════════════════════════
// 17. PHASE 7 — VIEW_KEY enum + switchView guard
//
// Guards that:
//   a) VIEW_KEY enum is defined in queueStateMachine.js with all 6 keys
//   b) switchView validates against VIEW_KEY before proceeding
//   c) Raw view string literals are replaced with QueueFSM.VIEW_KEY constants
// ═══════════════════════════════════════════════════════════════

test("queueStateMachine.js defines VIEW_KEY enum with all 6 view keys", () => {
  var required = ['home', 'host', 'queues', 'vip', 'account', 'admin'];
  required.forEach(function (v) {
    assert.equal(
      queueFsmSource.indexOf("'" + v + "'") >= 0,
      true,
      "VIEW_KEY in queueStateMachine.js must include '" + v + "'"
    );
  });
  assert.equal(
    /VIEW_KEY\s*:\s*VIEW_KEY/.test(queueFsmSource), true,
    "VIEW_KEY must be exported on the QueueFSM public API object"
  );
});

test("switchView in app.js guards against unknown view keys via QueueFSM.VIEW_KEY", () => {
  assert.equal(
    /function\s+switchView[\s\S]{0,200}QueueFSM\.VIEW_KEY/.test(appSource), true,
    "switchView must reference QueueFSM.VIEW_KEY early in its body for the guard"
  );
  assert.equal(
    /function\s+switchView[\s\S]{0,450}nav\.view_invalid/.test(appSource), true,
    "switchView must call SessionAudit.track with 'nav.view_invalid' on unknown keys"
  );
});

test("app.js has no raw switchView('home') calls remaining", () => {
  assert.equal(
    /switchView\(\s*['"]home['"]\s*\)/.test(appSource), false,
    "app.js must not contain switchView('home') — use switchView(QueueFSM.VIEW_KEY.HOME)"
  );
});

test("app.js has no raw switchView('queues') calls remaining", () => {
  assert.equal(
    /switchView\(\s*['"]queues['"]\s*\)/.test(appSource), false,
    "app.js must not contain switchView('queues') — use switchView(QueueFSM.VIEW_KEY.QUEUES)"
  );
});

test("app.js has no raw switchView('account') calls remaining", () => {
  assert.equal(
    /switchView\(\s*['"]account['"]\s*\)/.test(appSource), false,
    "app.js must not contain switchView('account') — use switchView(QueueFSM.VIEW_KEY.ACCOUNT)"
  );
});

test("app.js has no raw store.setState({ view: 'queues' }) remaining", () => {
  assert.equal(
    /store\.setState\(\s*\{\s*view\s*:\s*['"]queues['"]\s*\}/.test(appSource), false,
    "app.js must not contain store.setState({ view: 'queues' }) — use QueueFSM.VIEW_KEY.QUEUES"
  );
});

test("app.js has no raw store.setState({ view: 'account' }) remaining", () => {
  assert.equal(
    /store\.setState\(\s*\{\s*view\s*:\s*['"]account['"]\s*\}/.test(appSource), false,
    "app.js must not contain store.setState({ view: 'account' }) — use QueueFSM.VIEW_KEY.ACCOUNT"
  );
});