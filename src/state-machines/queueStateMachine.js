(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // QueueFSM — Queue & Session State Machine Service
  //
  // Single source of truth for all queue/raid status enums, valid transitions,
  // per-status UI metadata, poll-heat classification, and derived lobby/joiner
  // aggregate states.
  //
  // Registered as window.QueueFSM (browser) or module.exports (Node/test).
  // Load order: after constants.js, before app.js.
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Enums ─────────────────────────────────────────────────────────────────

  var QUEUE_STATUS = Object.freeze({
    QUEUED:    'queued',
    INVITED:   'invited',
    CONFIRMED: 'confirmed',
    RAIDING:   'raiding',
    DONE:      'done',
    LEFT:      'left',
    CANCELLED: 'cancelled'
  });

  var RAID_STATUS = Object.freeze({
    OPEN:      'open',
    LOBBY:     'lobby',
    RAIDING:   'raiding',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  });

  var POLL_HEAT = Object.freeze({
    HOT:  'hot',
    WARM: 'warm',
    IDLE: 'idle'
  });

  var LOBBY_STATE = Object.freeze({
    IDLE:         'idle',
    OPEN_WAITING: 'open_waiting',
    LOBBY_READY:  'lobby_ready',
    RAIDING:      'raiding',
    FINISHED:     'finished'
  });

  var JOINER_STATE = Object.freeze({
    IDLE:            'idle',
    WAITING:         'waiting',
    ACTION_REQUIRED: 'action_required',
    IN_LOBBY:        'in_lobby',
    RAIDING:         'raiding',
    WRAPPING_UP:     'wrapping_up'
  });

  var VIEW_KEY = Object.freeze({
    HOME:    'home',
    HOST:    'host',
    QUEUES:  'queues',
    VIP:     'vip',
    ACCOUNT: 'account',
    ADMIN:   'admin'
  });

  // ── Valid transitions ─────────────────────────────────────────────────────

  var VALID_QUEUE_TRANSITIONS = Object.freeze({
    queued:    ['invited', 'left', 'cancelled'],
    invited:   ['confirmed', 'queued', 'left', 'cancelled'],
    confirmed: ['raiding', 'left', 'cancelled'],
    raiding:   ['done', 'cancelled'],
    done:      [],
    left:      [],
    cancelled: []
  });

  var VALID_RAID_TRANSITIONS = Object.freeze({
    open:      ['lobby', 'cancelled'],
    lobby:     ['open', 'raiding', 'cancelled'],
    raiding:   ['completed', 'cancelled'],
    completed: [],
    cancelled: []
  });

  function isValidQueueTransition(from, to) {
    var allowed = VALID_QUEUE_TRANSITIONS[from];
    return !!(allowed && allowed.indexOf(to) >= 0);
  }

  function isValidRaidTransition(from, to) {
    var allowed = VALID_RAID_TRANSITIONS[from];
    return !!(allowed && allowed.indexOf(to) >= 0);
  }

  function isValidTransition(from, to) {
    return isValidQueueTransition(from, to) || isValidRaidTransition(from, to);
  }

  // ── Per-status UI metadata ────────────────────────────────────────────────

  var _queueStatusMeta = {
    queued:    { cssClass: 'status-queued',    label: 'Queued',               iconName: null,    isLeavable: true,  isTerminal: false, isActionable: true  },
    invited:   { cssClass: 'status-invited',   label: 'Invited',              iconName: null,    isLeavable: true,  isTerminal: false, isActionable: true  },
    confirmed: { cssClass: 'status-confirmed', label: 'Friend Request Sent',  iconName: 'check', isLeavable: true,  isTerminal: false, isActionable: true  },
    raiding:   { cssClass: 'status-raiding',   label: 'Raiding',              iconName: null,    isLeavable: false, isTerminal: false, isActionable: false },
    done:      { cssClass: 'status-done',      label: 'Done',                 iconName: 'check', isLeavable: false, isTerminal: false, isActionable: false },
    left:      { cssClass: 'status-left',      label: 'Left',                 iconName: null,    isLeavable: false, isTerminal: true,  isActionable: false },
    cancelled: { cssClass: 'status-cancelled', label: 'Cancelled',            iconName: null,    isLeavable: false, isTerminal: true,  isActionable: false }
  };

  var _unknownQueueMeta = { cssClass: 'status-queued', label: 'Unknown', iconName: null, isLeavable: false, isTerminal: false, isActionable: false };

  function getQueueStatusMeta(status) {
    return _queueStatusMeta[status] || _unknownQueueMeta;
  }

  var _raidStatusMeta = {
    open:      { isJoinable: true,  isActive: true,  isTerminal: false },
    lobby:     { isJoinable: true,  isActive: true,  isTerminal: false },
    raiding:   { isJoinable: false, isActive: true,  isTerminal: false },
    completed: { isJoinable: false, isActive: false, isTerminal: true  },
    cancelled: { isJoinable: false, isActive: false, isTerminal: true  }
  };

  var _unknownRaidMeta = { isJoinable: false, isActive: false, isTerminal: false };

  function getRaidStatusMeta(status) {
    return _raidStatusMeta[status] || _unknownRaidMeta;
  }

  // ── Poll heat classification ──────────────────────────────────────────────
  //
  // Two separate classifiers — they diverge on realtimeMode:
  //   getSyncHeat:        suppresses polling when in realtime mode (WS handles updates),
  //                       unless the user is managing a lobby (host view needs fast refresh).
  //   getMaintenanceHeat: never suppressed by realtimeMode — maintenance must always run.
  //
  // Hot condition: queue in 'invited' or 'raiding' state (matches existing app.js logic).
  // Warm condition: any queues or hosts present (non-empty store lists).
  // Idle: everything else.

  function _classifyHeat(state) {
    var queues = state.queues || [];
    var hasHotQueue = queues.some(function (q) {
      return q.status === 'invited' || q.status === 'raiding';
    });
    if (state.managingLobby || hasHotQueue) return POLL_HEAT.HOT;
    if (queues.length > 0 || (state.hosts || []).length > 0) return POLL_HEAT.WARM;
    return POLL_HEAT.IDLE;
  }

  function getSyncHeat(state) {
    if (state.realtimeMode === 'realtime' && !state.managingLobby) return POLL_HEAT.IDLE;
    return _classifyHeat(state);
  }

  function getMaintenanceHeat(state) {
    return _classifyHeat(state);
  }

  // ── Poll interval lookup ──────────────────────────────────────────────────
  //
  // _heatKey maps POLL_HEAT string values to AppConstants key suffixes.
  // Direct bracket access (AppConstants.POLL[heat]) would return undefined
  // because keys are 'HOT_MS' not 'hot'.

  var _heatKey = { hot: 'HOT_MS', warm: 'WARM_MS', idle: 'IDLE_MS' };

  function getPollInterval(heat) {
    return AppConstants.POLL[_heatKey[heat]];
  }

  function getMaintenanceInterval(heat) {
    return AppConstants.MAINTENANCE[_heatKey[heat]];
  }

  // ── Derived lobby state ───────────────────────────────────────────────────

  function getLobbyState(managingLobby, hosts) {
    if (!managingLobby) return LOBBY_STATE.IDLE;
    var host = (hosts || []).filter(function (h) { return h.id === managingLobby; })[0];
    if (!host) return LOBBY_STATE.IDLE;
    var s = host.status;
    if (s === 'open')                        return LOBBY_STATE.OPEN_WAITING;
    if (s === 'lobby')                       return LOBBY_STATE.LOBBY_READY;
    if (s === 'raiding')                     return LOBBY_STATE.RAIDING;
    if (s === 'completed' || s === 'cancelled') return LOBBY_STATE.FINISHED;
    return LOBBY_STATE.IDLE;
  }

  // ── Derived joiner state ──────────────────────────────────────────────────
  //
  // Urgency ranking: RAIDING > IN_LOBBY > ACTION_REQUIRED > WAITING > WRAPPING_UP > IDLE.
  // The highest-urgency status in the queue set wins.

  function getJoinerState(queues) {
    if (!queues || queues.length === 0) return JOINER_STATE.IDLE;
    var statuses = queues.map(function (q) { return q.status; });
    if (statuses.indexOf('raiding')   >= 0) return JOINER_STATE.RAIDING;
    if (statuses.indexOf('confirmed') >= 0) return JOINER_STATE.IN_LOBBY;
    if (statuses.indexOf('invited')   >= 0) return JOINER_STATE.ACTION_REQUIRED;
    if (statuses.indexOf('queued')    >= 0) return JOINER_STATE.WAITING;
    var hasTerminal = statuses.some(function (s) {
      return s === 'done' || s === 'left' || s === 'cancelled';
    });
    return hasTerminal ? JOINER_STATE.WRAPPING_UP : JOINER_STATE.IDLE;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  var QueueFSM = {
    // Enums
    QUEUE_STATUS:  QUEUE_STATUS,
    RAID_STATUS:   RAID_STATUS,
    POLL_HEAT:     POLL_HEAT,
    LOBBY_STATE:   LOBBY_STATE,
    JOINER_STATE:  JOINER_STATE,
    VIEW_KEY:      VIEW_KEY,

    // Transition guards
    isValidTransition:      isValidTransition,
    isValidQueueTransition: isValidQueueTransition,
    isValidRaidTransition:  isValidRaidTransition,

    // Status metadata
    getQueueStatusMeta: getQueueStatusMeta,
    getRaidStatusMeta:  getRaidStatusMeta,

    // Heat classification
    getSyncHeat:        getSyncHeat,
    getMaintenanceHeat: getMaintenanceHeat,

    // Poll intervals
    getPollInterval:        getPollInterval,
    getMaintenanceInterval: getMaintenanceInterval,

    // Derived aggregate states
    getLobbyState:  getLobbyState,
    getJoinerState: getJoinerState
  };

  // UMD export — allows require() in Node.js test runner
  if (typeof module === 'object' && module.exports) {
    module.exports = QueueFSM;
  } else {
    global.QueueFSM = QueueFSM;
  }
})(typeof window !== 'undefined' ? window : global);
