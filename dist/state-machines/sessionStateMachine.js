(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // SessionFSM — Session Authentication State Machine Service
  //
  // Single source of truth for session authentication states and valid
  // transitions. Provides a pure-value factory `createSessionMachine(initialState)`
  // that returns a machine instance with getState / transition / can / is / isAnyOf.
  //
  // No CustomEvent, no timers, no network calls, no store references.
  // Registered as window.SessionFSM (browser) or module.exports (Node/test).
  // Load order: after queueStateMachine.js, before config.js.
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Enums ─────────────────────────────────────────────────────────────────

  var SESSION_STATE = Object.freeze({
    UNAUTHENTICATED:        'unauthenticated',
    AUTHENTICATED_POLLING:  'authenticated_polling',
    AUTHENTICATED_REALTIME: 'authenticated_realtime',
    DEMOTION_IN_FLIGHT:     'demotion_in_flight',
    RECOVERY_IN_FLIGHT:     'recovery_in_flight',
    SIGNING_OUT:            'signing_out',
    SESSION_EXPIRED:        'session_expired'
  });

  // ── Valid transitions ─────────────────────────────────────────────────────

  var VALID_SESSION_TRANSITIONS = Object.freeze({
    unauthenticated:        ['authenticated_polling'],
    authenticated_polling:  ['authenticated_realtime', 'recovery_in_flight', 'signing_out', 'session_expired'],
    authenticated_realtime: ['demotion_in_flight', 'recovery_in_flight', 'signing_out', 'session_expired'],
    demotion_in_flight:     ['authenticated_polling', 'session_expired'],
    recovery_in_flight:     ['authenticated_polling', 'authenticated_realtime', 'session_expired'],
    signing_out:            ['unauthenticated'],
    session_expired:        ['unauthenticated']
  });

  // ── Factory ───────────────────────────────────────────────────────────────

  function createSessionMachine(initialState) {
    var _state = initialState;

    return {
      getState: function () {
        return _state;
      },

      transition: function (to) {
        var allowed = VALID_SESSION_TRANSITIONS[_state];
        if (!allowed || allowed.indexOf(to) < 0) {
          console.warn('[SessionFSM] Illegal transition: ' + _state + ' → ' + to);
          return false;
        }
        _state = to;
        return true;
      },

      can: function (to) {
        var allowed = VALID_SESSION_TRANSITIONS[_state];
        return !!(allowed && allowed.indexOf(to) >= 0);
      },

      is: function (state) {
        return _state === state;
      },

      isAnyOf: function () {
        var states = Array.prototype.slice.call(arguments);
        return states.indexOf(_state) >= 0;
      }
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  var SessionFSM = {
    SESSION_STATE:              SESSION_STATE,
    VALID_SESSION_TRANSITIONS:  VALID_SESSION_TRANSITIONS,
    createSessionMachine:       createSessionMachine
  };

  // UMD export — allows require() in Node.js test runner
  if (typeof module === 'object' && module.exports) {
    module.exports = SessionFSM;
  } else {
    global.SessionFSM = SessionFSM;
  }
})(typeof window !== 'undefined' ? window : global);
