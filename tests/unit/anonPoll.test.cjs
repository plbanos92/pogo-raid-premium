/**
 * Regression tests for the unauthenticated (anon) poll fix.
 *
 * Background:
 *   The polling loop in scheduleNextPoll() previously short-circuited with a bare
 *   scheduleNextPoll() return when !isAuthed(). This meant a logged-out browser
 *   was permanently stuck on its startup snapshot — boss card counters (queue_length,
 *   active_hosts) would never update regardless of poll interval.
 *
 *   Fix: unauthenticated browsers now call refreshData() (which safely skips
 *   auth-only endpoints and still fetches boss_queue_stats) and then reschedule.
 *
 * These tests guard:
 *   1. The anon poll path calls refreshData() before rescheduling.
 *   2. The anon poll path does NOT call maintenance (requires auth).
 *   3. The anon poll path does NOT call getQueueSyncCursor (requires auth).
 *   4. The authenticated poll path is unchanged (maintenance + cursor + conditional refresh).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(
  path.resolve(__dirname, "../../src/app.js"),
  "utf8"
);

// Isolate the anon branch: the block from !isAuthed() check to the closing
// of that early-return branch (ends just before `var api = getApi()`).
function getAnonBranch() {
  const marker = "if (!isAuthed()) {";
  const start = src.indexOf(marker, src.indexOf("function scheduleNextPoll"));
  const end = src.indexOf("var api = getApi()", start);
  assert.ok(start > -1, "scheduleNextPoll must contain an !isAuthed() guard");
  assert.ok(end > start, "!isAuthed() branch must precede 'var api = getApi()'");
  return src.slice(start, end);
}

// ── Anon branch must call refreshData() ──────────────────────────────────────

test("anon poll branch calls refreshData() before rescheduling", () => {
  const branch = getAnonBranch();
  assert.ok(
    branch.includes("refreshData()"),
    "!isAuthed() branch must call refreshData() to keep boss card counters current"
  );
});

test("anon poll branch reschedules via scheduleNextPoll after refreshData", () => {
  const branch = getAnonBranch();
  // refreshData().catch(...).then(function () { scheduleNextPoll(); })
  assert.ok(
    /refreshData\(\)[\s\S]*?scheduleNextPoll\(\)/.test(branch),
    "!isAuthed() branch must reschedule via scheduleNextPoll() after refreshData()"
  );
});

test("anon poll branch returns early (does not fall through to auth-only code)", () => {
  const branch = getAnonBranch();
  assert.ok(
    branch.includes("return;"),
    "!isAuthed() branch must return after scheduling the anon refresh"
  );
});

// ── Anon branch must NOT call auth-only helpers ────────────────────────────────

test("anon poll branch does not call runQueueMaintenance", () => {
  const branch = getAnonBranch();
  assert.ok(
    !branch.includes("runQueueMaintenance"),
    "!isAuthed() branch must not call runQueueMaintenance (requires auth)"
  );
});

test("anon poll branch does not call getQueueSyncCursor", () => {
  const branch = getAnonBranch();
  assert.ok(
    !branch.includes("getQueueSyncCursor"),
    "!isAuthed() branch must not call getQueueSyncCursor (requires auth)"
  );
});

// ── Authenticated path is unchanged ──────────────────────────────────────────

test("authenticated poll path still calls getQueueSyncCursor", () => {
  // The auth path begins after the anon branch's early return and includes
  // the maintenance + cursor check flow.
  const pollFnStart = src.indexOf("function scheduleNextPoll");
  const pollFnBlock = src.slice(pollFnStart, src.indexOf("function updateCountdowns"));
  assert.ok(
    pollFnBlock.includes("getQueueSyncCursor("),
    "Authenticated poll path must still call getQueueSyncCursor"
  );
});

test("authenticated poll path still calls runQueueMaintenance", () => {
  const pollFnStart = src.indexOf("function scheduleNextPoll");
  const pollFnBlock = src.slice(pollFnStart, src.indexOf("function updateCountdowns"));
  assert.ok(
    pollFnBlock.includes("runQueueMaintenance("),
    "Authenticated poll path must still call runQueueMaintenance"
  );
});

test("authenticated poll path still conditionally calls refreshData on cursor change", () => {
  const pollFnStart = src.indexOf("function scheduleNextPoll");
  const pollFnBlock = src.slice(pollFnStart, src.indexOf("function updateCountdowns"));
  assert.ok(
    /syncCursorChanged[\s\S]*?refreshData\(\)/.test(pollFnBlock),
    "Authenticated poll must call refreshData() when syncCursorChanged returns true"
  );
});

// ── scheduleNextPoll structure invariants ────────────────────────────────────

test("scheduleNextPoll clears any existing pollTimer before setting a new one", () => {
  const pollFnStart = src.indexOf("function scheduleNextPoll");
  const pollFnBlock = src.slice(pollFnStart, src.indexOf("function updateCountdowns"));
  assert.ok(
    /if\s*\(pollTimer\)\s*clearTimeout\(pollTimer\)/.test(pollFnBlock),
    "scheduleNextPoll must clear the existing pollTimer before setting a new one"
  );
});

test("getSyncPollInterval drives the poll delay and covers all three tiers", () => {
  assert.ok(
    src.includes("POLL.HOT_MS"),
    "getSyncPollInterval must reference POLL.HOT_MS"
  );
  assert.ok(
    src.includes("POLL.WARM_MS"),
    "getSyncPollInterval must reference POLL.WARM_MS"
  );
  assert.ok(
    src.includes("POLL.IDLE_MS"),
    "getSyncPollInterval must reference POLL.IDLE_MS"
  );
});
