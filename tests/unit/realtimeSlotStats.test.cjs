/**
 * Unit tests for RealtimeUtils helper module.
 *
 * Tests formatRealtimeSlotStats and isRealtimeEnabled for all edge cases.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

// Load via the UMD CommonJS path
const RealtimeUtils = require("../../src/utils/realtimeUtils.js");

const { formatRealtimeSlotStats, isRealtimeEnabled } = RealtimeUtils;

// ═══════════════════════════════════════════════════════════════
// formatRealtimeSlotStats
// ═══════════════════════════════════════════════════════════════

test("formatRealtimeSlotStats returns 'used / total' for normal stats", () => {
  assert.equal(formatRealtimeSlotStats({ used: 3, total: 10 }), "3 / 10");
});

test("formatRealtimeSlotStats returns '0 / total' when used is zero", () => {
  assert.equal(formatRealtimeSlotStats({ used: 0, total: 150 }), "0 / 150");
});

test("formatRealtimeSlotStats returns em-dash pair for null input", () => {
  assert.equal(formatRealtimeSlotStats(null), "\u2014 / \u2014");
});

test("formatRealtimeSlotStats returns full capacity string", () => {
  assert.equal(formatRealtimeSlotStats({ used: 150, total: 150 }), "150 / 150");
});

test("formatRealtimeSlotStats returns em-dash pair when 'used' is missing", () => {
  assert.equal(formatRealtimeSlotStats({ total: 10 }), "\u2014 / \u2014");
});

test("formatRealtimeSlotStats returns em-dash pair when 'total' is missing", () => {
  assert.equal(formatRealtimeSlotStats({ used: 3 }), "\u2014 / \u2014");
});

// ═══════════════════════════════════════════════════════════════
// isRealtimeEnabled
// ═══════════════════════════════════════════════════════════════

test("isRealtimeEnabled returns true when realtime_slots > 0", () => {
  assert.equal(isRealtimeEnabled({ realtime_slots: 150 }), true);
});

test("isRealtimeEnabled returns false when realtime_slots is 0", () => {
  assert.equal(isRealtimeEnabled({ realtime_slots: 0 }), false);
});

test("isRealtimeEnabled returns false when appConfig is null", () => {
  assert.equal(isRealtimeEnabled(null), false);
});

test("isRealtimeEnabled returns false when appConfig is undefined", () => {
  assert.equal(isRealtimeEnabled(undefined), false);
});

test("isRealtimeEnabled returns false for empty object (missing realtime_slots)", () => {
  assert.equal(isRealtimeEnabled({}), false);
});

test("isRealtimeEnabled returns true when realtime_slots is 1", () => {
  assert.equal(isRealtimeEnabled({ realtime_slots: 1 }), true);
});
