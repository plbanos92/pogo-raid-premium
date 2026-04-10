/**
 * Unit tests for QueueFSM — src/state-machines/queueStateMachine.js
 *
 * AppConstants must be mocked on global BEFORE require() because the IIFE
 * executes immediately on load and getPollInterval / getMaintenanceInterval
 * read from AppConstants at call time.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ── Mock AppConstants before loading QueueFSM ────────────────────────────────
global.AppConstants = {
  POLL:        { HOT_MS: 2000,  WARM_MS: 5000,  IDLE_MS: 20000 },
  MAINTENANCE: { HOT_MS: 10000, WARM_MS: 30000, IDLE_MS: 60000 }
};

const QueueFSM = require('../../src/state-machines/queueStateMachine.js');

// ═══════════════════════════════════════════════════════════════
// Module shape
// ═══════════════════════════════════════════════════════════════

test('QueueFSM exports expected keys', () => {
  const expectedKeys = [
    'QUEUE_STATUS', 'RAID_STATUS', 'POLL_HEAT', 'LOBBY_STATE', 'JOINER_STATE',
    'isValidTransition', 'isValidQueueTransition', 'isValidRaidTransition',
    'getQueueStatusMeta', 'getRaidStatusMeta',
    'getSyncHeat', 'getMaintenanceHeat',
    'getPollInterval', 'getMaintenanceInterval',
    'getLobbyState', 'getJoinerState'
  ];
  expectedKeys.forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(QueueFSM, k), 'missing key: ' + k);
  });
});

// ═══════════════════════════════════════════════════════════════
// getQueueStatusMeta
// ═══════════════════════════════════════════════════════════════

test('getQueueStatusMeta — queued', () => {
  const m = QueueFSM.getQueueStatusMeta('queued');
  assert.equal(m.cssClass, 'status-queued');
  assert.equal(m.isLeavable, true);
  assert.equal(m.isTerminal, false);
  assert.equal(m.isActionable, true);
});

test('getQueueStatusMeta — invited', () => {
  const m = QueueFSM.getQueueStatusMeta('invited');
  assert.equal(m.cssClass, 'status-invited');
  assert.equal(m.isLeavable, true);
  assert.equal(m.isTerminal, false);
  assert.equal(m.isActionable, true);
});

test('getQueueStatusMeta — confirmed', () => {
  const m = QueueFSM.getQueueStatusMeta('confirmed');
  assert.equal(m.cssClass, 'status-confirmed');
  assert.equal(m.isLeavable, true);
  assert.equal(m.isTerminal, false);
  assert.equal(m.isActionable, true);
});

test('getQueueStatusMeta — raiding', () => {
  const m = QueueFSM.getQueueStatusMeta('raiding');
  assert.equal(m.cssClass, 'status-raiding');
  assert.equal(m.isLeavable, false);
  assert.equal(m.isTerminal, false);
  assert.equal(m.isActionable, false);
});

test('getQueueStatusMeta — done', () => {
  const m = QueueFSM.getQueueStatusMeta('done');
  assert.equal(m.cssClass, 'status-done');
  assert.equal(m.isLeavable, false);
  assert.equal(m.isTerminal, false);
  assert.equal(m.isActionable, false);
});

test('getQueueStatusMeta — left', () => {
  const m = QueueFSM.getQueueStatusMeta('left');
  assert.equal(m.cssClass, 'status-left');
  assert.equal(m.isLeavable, false);
  assert.equal(m.isTerminal, true);
  assert.equal(m.isActionable, false);
});

test('getQueueStatusMeta — cancelled', () => {
  const m = QueueFSM.getQueueStatusMeta('cancelled');
  assert.equal(m.cssClass, 'status-cancelled');
  assert.equal(m.isLeavable, false);
  assert.equal(m.isTerminal, true);
  assert.equal(m.isActionable, false);
});

test('getQueueStatusMeta — unknown status returns safe default', () => {
  const m = QueueFSM.getQueueStatusMeta('nonexistent');
  assert.equal(typeof m.cssClass, 'string');
  assert.equal(m.isLeavable, false);
  assert.equal(m.isTerminal, false);
});

// ═══════════════════════════════════════════════════════════════
// getRaidStatusMeta
// ═══════════════════════════════════════════════════════════════

test('getRaidStatusMeta — open', () => {
  const m = QueueFSM.getRaidStatusMeta('open');
  assert.equal(m.isJoinable, true);
  assert.equal(m.isActive, true);
  assert.equal(m.isTerminal, false);
});

test('getRaidStatusMeta — lobby', () => {
  const m = QueueFSM.getRaidStatusMeta('lobby');
  assert.equal(m.isJoinable, true);
  assert.equal(m.isActive, true);
  assert.equal(m.isTerminal, false);
});

test('getRaidStatusMeta — raiding', () => {
  const m = QueueFSM.getRaidStatusMeta('raiding');
  assert.equal(m.isJoinable, false);
  assert.equal(m.isActive, true);
  assert.equal(m.isTerminal, false);
});

test('getRaidStatusMeta — completed', () => {
  const m = QueueFSM.getRaidStatusMeta('completed');
  assert.equal(m.isJoinable, false);
  assert.equal(m.isActive, false);
  assert.equal(m.isTerminal, true);
});

test('getRaidStatusMeta — cancelled', () => {
  const m = QueueFSM.getRaidStatusMeta('cancelled');
  assert.equal(m.isJoinable, false);
  assert.equal(m.isActive, false);
  assert.equal(m.isTerminal, true);
});

// ═══════════════════════════════════════════════════════════════
// isValidTransition
// ═══════════════════════════════════════════════════════════════

test('isValidTransition — valid queue transitions', () => {
  assert.equal(QueueFSM.isValidTransition('queued', 'invited'), true);
  assert.equal(QueueFSM.isValidTransition('invited', 'confirmed'), true);
  assert.equal(QueueFSM.isValidTransition('confirmed', 'raiding'), true);
  assert.equal(QueueFSM.isValidTransition('raiding', 'done'), true);
  assert.equal(QueueFSM.isValidTransition('queued', 'left'), true);
  assert.equal(QueueFSM.isValidTransition('invited', 'left'), true);
  assert.equal(QueueFSM.isValidTransition('confirmed', 'cancelled'), true);
});

test('isValidTransition — invalid queue transitions', () => {
  assert.equal(QueueFSM.isValidTransition('done', 'queued'), false);
  assert.equal(QueueFSM.isValidTransition('left', 'queued'), false);
  assert.equal(QueueFSM.isValidTransition('cancelled', 'queued'), false);
  assert.equal(QueueFSM.isValidTransition('raiding', 'queued'), false);
});

test('isValidTransition — valid raid transitions', () => {
  assert.equal(QueueFSM.isValidTransition('open', 'lobby'), true);
  assert.equal(QueueFSM.isValidTransition('lobby', 'raiding'), true);
  assert.equal(QueueFSM.isValidTransition('raiding', 'completed'), true);
  assert.equal(QueueFSM.isValidTransition('open', 'cancelled'), true);
});

test('isValidTransition — invalid raid transitions', () => {
  assert.equal(QueueFSM.isValidTransition('completed', 'open'), false);
  assert.equal(QueueFSM.isValidTransition('cancelled', 'open'), false);
});

// ═══════════════════════════════════════════════════════════════
// getSyncHeat
// ═══════════════════════════════════════════════════════════════

test('getSyncHeat — realtime mode with no managingLobby → IDLE', () => {
  const state = { realtimeMode: 'realtime', managingLobby: null, queues: [], hosts: [] };
  assert.equal(QueueFSM.getSyncHeat(state), QueueFSM.POLL_HEAT.IDLE);
});

test('getSyncHeat — realtime mode WITH managingLobby → not forced idle, falls through to heat', () => {
  const state = { realtimeMode: 'realtime', managingLobby: 'raid-1', queues: [], hosts: [] };
  // managingLobby is truthy → HOT
  assert.equal(QueueFSM.getSyncHeat(state), QueueFSM.POLL_HEAT.HOT);
});

test('getSyncHeat — polling mode with invited queue → HOT', () => {
  const state = { realtimeMode: 'polling', managingLobby: null, queues: [{ status: 'invited' }], hosts: [] };
  assert.equal(QueueFSM.getSyncHeat(state), QueueFSM.POLL_HEAT.HOT);
});

test('getSyncHeat — polling mode with raiding queue → HOT', () => {
  const state = { realtimeMode: 'polling', managingLobby: null, queues: [{ status: 'raiding' }], hosts: [] };
  assert.equal(QueueFSM.getSyncHeat(state), QueueFSM.POLL_HEAT.HOT);
});

test('getSyncHeat — polling mode with queued only → WARM', () => {
  const state = { realtimeMode: 'polling', managingLobby: null, queues: [{ status: 'queued' }], hosts: [] };
  assert.equal(QueueFSM.getSyncHeat(state), QueueFSM.POLL_HEAT.WARM);
});

test('getSyncHeat — polling mode with no queues → IDLE', () => {
  const state = { realtimeMode: 'polling', managingLobby: null, queues: [], hosts: [] };
  assert.equal(QueueFSM.getSyncHeat(state), QueueFSM.POLL_HEAT.IDLE);
});

// ═══════════════════════════════════════════════════════════════
// getMaintenanceHeat
// ═══════════════════════════════════════════════════════════════

test('getMaintenanceHeat — realtime mode with invited queue → HOT (no realtime suppression)', () => {
  const state = { realtimeMode: 'realtime', managingLobby: null, queues: [{ status: 'invited' }], hosts: [] };
  assert.equal(QueueFSM.getMaintenanceHeat(state), QueueFSM.POLL_HEAT.HOT);
});

test('getMaintenanceHeat — realtime mode with no queues → IDLE', () => {
  const state = { realtimeMode: 'realtime', managingLobby: null, queues: [], hosts: [] };
  assert.equal(QueueFSM.getMaintenanceHeat(state), QueueFSM.POLL_HEAT.IDLE);
});

test('getMaintenanceHeat — queued only → WARM', () => {
  const state = { realtimeMode: 'polling', managingLobby: null, queues: [{ status: 'queued' }], hosts: [] };
  assert.equal(QueueFSM.getMaintenanceHeat(state), QueueFSM.POLL_HEAT.WARM);
});

// ═══════════════════════════════════════════════════════════════
// getPollInterval / getMaintenanceInterval
// ═══════════════════════════════════════════════════════════════

test('getPollInterval(hot) === AppConstants.POLL.HOT_MS', () => {
  assert.equal(QueueFSM.getPollInterval('hot'), 2000);
});

test('getPollInterval(warm) === AppConstants.POLL.WARM_MS', () => {
  assert.equal(QueueFSM.getPollInterval('warm'), 5000);
});

test('getPollInterval(idle) === AppConstants.POLL.IDLE_MS', () => {
  assert.equal(QueueFSM.getPollInterval('idle'), 20000);
});

test('getMaintenanceInterval(hot) === AppConstants.MAINTENANCE.HOT_MS', () => {
  assert.equal(QueueFSM.getMaintenanceInterval('hot'), 10000);
});

test('getMaintenanceInterval(idle) === AppConstants.MAINTENANCE.IDLE_MS', () => {
  assert.equal(QueueFSM.getMaintenanceInterval('idle'), 60000);
});

// ═══════════════════════════════════════════════════════════════
// getLobbyState
// ═══════════════════════════════════════════════════════════════

test('getLobbyState — null managingLobby → IDLE', () => {
  assert.equal(QueueFSM.getLobbyState(null, []), QueueFSM.LOBBY_STATE.IDLE);
});

test('getLobbyState — managingLobby set but host not found → IDLE', () => {
  assert.equal(QueueFSM.getLobbyState('raid-1', []), QueueFSM.LOBBY_STATE.IDLE);
});

test('getLobbyState — host status open → OPEN_WAITING', () => {
  assert.equal(
    QueueFSM.getLobbyState('raid-1', [{ id: 'raid-1', status: 'open' }]),
    QueueFSM.LOBBY_STATE.OPEN_WAITING
  );
});

test('getLobbyState — host status lobby → LOBBY_READY', () => {
  assert.equal(
    QueueFSM.getLobbyState('raid-1', [{ id: 'raid-1', status: 'lobby' }]),
    QueueFSM.LOBBY_STATE.LOBBY_READY
  );
});

test('getLobbyState — host status raiding → RAIDING', () => {
  assert.equal(
    QueueFSM.getLobbyState('raid-1', [{ id: 'raid-1', status: 'raiding' }]),
    QueueFSM.LOBBY_STATE.RAIDING
  );
});

test('getLobbyState — host status completed → FINISHED', () => {
  assert.equal(
    QueueFSM.getLobbyState('raid-1', [{ id: 'raid-1', status: 'completed' }]),
    QueueFSM.LOBBY_STATE.FINISHED
  );
});

test('getLobbyState — host status cancelled → FINISHED', () => {
  assert.equal(
    QueueFSM.getLobbyState('raid-1', [{ id: 'raid-1', status: 'cancelled' }]),
    QueueFSM.LOBBY_STATE.FINISHED
  );
});

// ═══════════════════════════════════════════════════════════════
// getJoinerState
// ═══════════════════════════════════════════════════════════════

test('getJoinerState — empty array → IDLE', () => {
  assert.equal(QueueFSM.getJoinerState([]), QueueFSM.JOINER_STATE.IDLE);
});

test('getJoinerState — null → IDLE', () => {
  assert.equal(QueueFSM.getJoinerState(null), QueueFSM.JOINER_STATE.IDLE);
});

test('getJoinerState — queued only → WAITING', () => {
  assert.equal(
    QueueFSM.getJoinerState([{ status: 'queued' }]),
    QueueFSM.JOINER_STATE.WAITING
  );
});

test('getJoinerState — invited beats queued → ACTION_REQUIRED', () => {
  assert.equal(
    QueueFSM.getJoinerState([{ status: 'invited' }, { status: 'queued' }]),
    QueueFSM.JOINER_STATE.ACTION_REQUIRED
  );
});

test('getJoinerState — confirmed (no invited) → IN_LOBBY', () => {
  assert.equal(
    QueueFSM.getJoinerState([{ status: 'confirmed' }]),
    QueueFSM.JOINER_STATE.IN_LOBBY
  );
});

test('getJoinerState — raiding beats all → RAIDING', () => {
  assert.equal(
    QueueFSM.getJoinerState([{ status: 'raiding' }, { status: 'invited' }]),
    QueueFSM.JOINER_STATE.RAIDING
  );
});

test('getJoinerState — only terminal entries → WRAPPING_UP', () => {
  assert.equal(
    QueueFSM.getJoinerState([{ status: 'done' }, { status: 'left' }]),
    QueueFSM.JOINER_STATE.WRAPPING_UP
  );
});

test('getJoinerState — only cancelled → WRAPPING_UP', () => {
  assert.equal(
    QueueFSM.getJoinerState([{ status: 'cancelled' }]),
    QueueFSM.JOINER_STATE.WRAPPING_UP
  );
});
