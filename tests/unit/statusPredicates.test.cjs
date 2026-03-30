/**
 * Unit tests for raid status predicates introduced in Phases 6 and 7.
 *
 * These predicates are currently inlined in app.js. This file documents
 * and guards their expected behavior as a contract test.
 *
 *   joinable     : status IN ('open', 'lobby')
 *   active       : status NOT IN ('completed', 'cancelled')  — Phase 6 runQueueMaintenance
 *   terminal     : status IN ('completed', 'cancelled')      — Phase 7 terminal banner
 */

const test = require("node:test");
const assert = require("node:assert/strict");


const { isJoinable, isActive, isTerminal } = require("../../src/utils/predicates.js");

// ── isJoinable ────────────────────────────────────────────────────────────────

test("isJoinable returns true for open and lobby", () => {
  assert.equal(isJoinable('open'), true);
  assert.equal(isJoinable('lobby'), true);
});

test("isJoinable returns false for non-joinable statuses", () => {
  assert.equal(isJoinable('raiding'), false);
  assert.equal(isJoinable('completed'), false);
  assert.equal(isJoinable('cancelled'), false);
  assert.equal(isJoinable(null), false);
  assert.equal(isJoinable(undefined), false);
});

// ── isActive (Phase 6 runQueueMaintenance host filter) ───────────────────────

test("isActive returns true for non-terminal statuses", () => {
  assert.equal(isActive('open'), true);
  assert.equal(isActive('lobby'), true);
  assert.equal(isActive('raiding'), true);
});

test("isActive returns false for terminal statuses and missing status", () => {
  assert.equal(isActive('completed'), false);
  assert.equal(isActive('cancelled'), false);
  assert.equal(isActive(null), false);
  assert.equal(isActive(undefined), false);
});

// ── isTerminal (Phase 7 terminal-state banner guard) ─────────────────────────

test("isTerminal returns true for completed and cancelled", () => {
  assert.equal(isTerminal('completed'), true);
  assert.equal(isTerminal('cancelled'), true);
});

test("isTerminal returns false for non-terminal statuses", () => {
  assert.equal(isTerminal('open'), false);
  assert.equal(isTerminal('lobby'), false);
  assert.equal(isTerminal('raiding'), false);
  assert.equal(isTerminal(null), false);
});
