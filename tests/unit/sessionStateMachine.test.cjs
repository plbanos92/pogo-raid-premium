/**
 * Unit tests for SessionFSM — src/state-machines/sessionStateMachine.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const SessionFSM = require('../../src/state-machines/sessionStateMachine.js');
const { SESSION_STATE, VALID_SESSION_TRANSITIONS, createSessionMachine } = SessionFSM;

// ═══════════════════════════════════════════════════════════════
// Factory shape
// ═══════════════════════════════════════════════════════════════

test('createSessionMachine returns object with expected methods', () => {
  const m = createSessionMachine(SESSION_STATE.UNAUTHENTICATED);
  assert.equal(typeof m.getState,   'function');
  assert.equal(typeof m.transition, 'function');
  assert.equal(typeof m.can,        'function');
  assert.equal(typeof m.is,         'function');
  assert.equal(typeof m.isAnyOf,    'function');
});

test('initial state is correctly set from createSessionMachine argument', () => {
  const m = createSessionMachine(SESSION_STATE.AUTHENTICATED_POLLING);
  assert.equal(m.getState(), SESSION_STATE.AUTHENTICATED_POLLING);
});

// ═══════════════════════════════════════════════════════════════
// transition()
// ═══════════════════════════════════════════════════════════════

test('transition() returns true for legal transition UNAUTHENTICATED → AUTHENTICATED_POLLING', () => {
  const m = createSessionMachine(SESSION_STATE.UNAUTHENTICATED);
  assert.equal(m.transition(SESSION_STATE.AUTHENTICATED_POLLING), true);
});

test('transition() returns false for illegal transition UNAUTHENTICATED → SIGNING_OUT', () => {
  const m = createSessionMachine(SESSION_STATE.UNAUTHENTICATED);
  assert.equal(m.transition(SESSION_STATE.SIGNING_OUT), false);
});

test('transition() returns false for illegal transition SIGNING_OUT → AUTHENTICATED_REALTIME', () => {
  const m = createSessionMachine(SESSION_STATE.SIGNING_OUT);
  assert.equal(m.transition(SESSION_STATE.AUTHENTICATED_REALTIME), false);
});

test('after legal transition, getState() returns the new state', () => {
  const m = createSessionMachine(SESSION_STATE.UNAUTHENTICATED);
  m.transition(SESSION_STATE.AUTHENTICATED_POLLING);
  assert.equal(m.getState(), SESSION_STATE.AUTHENTICATED_POLLING);
});

// ═══════════════════════════════════════════════════════════════
// can()
// ═══════════════════════════════════════════════════════════════

test('can() returns true for legal next state', () => {
  const m = createSessionMachine(SESSION_STATE.AUTHENTICATED_POLLING);
  assert.equal(m.can(SESSION_STATE.AUTHENTICATED_REALTIME), true);
});

test('can() returns false for illegal next state', () => {
  const m = createSessionMachine(SESSION_STATE.AUTHENTICATED_POLLING);
  assert.equal(m.can(SESSION_STATE.UNAUTHENTICATED), false);
});

test('can() does not mutate state', () => {
  const m = createSessionMachine(SESSION_STATE.UNAUTHENTICATED);
  m.can(SESSION_STATE.AUTHENTICATED_POLLING);
  m.can(SESSION_STATE.AUTHENTICATED_POLLING);
  assert.equal(m.getState(), SESSION_STATE.UNAUTHENTICATED);
});

// ═══════════════════════════════════════════════════════════════
// is()
// ═══════════════════════════════════════════════════════════════

test('is() returns true when current state matches', () => {
  const m = createSessionMachine(SESSION_STATE.SESSION_EXPIRED);
  assert.equal(m.is(SESSION_STATE.SESSION_EXPIRED), true);
});

test('is() returns false when current state does not match', () => {
  const m = createSessionMachine(SESSION_STATE.SESSION_EXPIRED);
  assert.equal(m.is(SESSION_STATE.UNAUTHENTICATED), false);
});

// ═══════════════════════════════════════════════════════════════
// isAnyOf()
// ═══════════════════════════════════════════════════════════════

test('isAnyOf() returns true when current matches one of the args', () => {
  const m = createSessionMachine(SESSION_STATE.AUTHENTICATED_REALTIME);
  assert.equal(m.isAnyOf(SESSION_STATE.AUTHENTICATED_POLLING, SESSION_STATE.AUTHENTICATED_REALTIME), true);
});

test('isAnyOf() returns false when current matches none of the args', () => {
  const m = createSessionMachine(SESSION_STATE.UNAUTHENTICATED);
  assert.equal(m.isAnyOf(SESSION_STATE.SIGNING_OUT, SESSION_STATE.SESSION_EXPIRED), false);
});

// ═══════════════════════════════════════════════════════════════
// VALID_SESSION_TRANSITIONS coverage
// ═══════════════════════════════════════════════════════════════

test('all 7 SESSION_STATE values exist in VALID_SESSION_TRANSITIONS as keys', () => {
  Object.values(SESSION_STATE).forEach(function (s) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(VALID_SESSION_TRANSITIONS, s),
      'missing key in VALID_SESSION_TRANSITIONS: ' + s
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Legal chain
// ═══════════════════════════════════════════════════════════════

test('legal chain: UNAUTHENTICATED → AUTHENTICATED_POLLING → AUTHENTICATED_REALTIME → DEMOTION_IN_FLIGHT → AUTHENTICATED_POLLING', () => {
  const m = createSessionMachine(SESSION_STATE.UNAUTHENTICATED);
  assert.equal(m.transition(SESSION_STATE.AUTHENTICATED_POLLING),  true, 'step 1');
  assert.equal(m.transition(SESSION_STATE.AUTHENTICATED_REALTIME), true, 'step 2');
  assert.equal(m.transition(SESSION_STATE.DEMOTION_IN_FLIGHT),     true, 'step 3');
  assert.equal(m.transition(SESSION_STATE.AUTHENTICATED_POLLING),  true, 'step 4');
});

// ═══════════════════════════════════════════════════════════════
// Double-demotion guard
// ═══════════════════════════════════════════════════════════════

test('second simultaneous demotion attempt rejected', () => {
  const m = createSessionMachine(SESSION_STATE.AUTHENTICATED_REALTIME);
  // first demotion — succeeds
  assert.equal(m.transition(SESSION_STATE.DEMOTION_IN_FLIGHT), true);
  // already in DEMOTION_IN_FLIGHT — can't transition to itself (not in allowed list)
  assert.equal(m.transition(SESSION_STATE.DEMOTION_IN_FLIGHT), false);
});
