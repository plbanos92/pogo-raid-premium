(function (global) {
  'use strict';

  var SK_SID  = 'raidSync_audit_sid';
  var SK_SEQ  = 'raidSync_audit_seq';
  var FLUSH_MS      = 5000;
  var BUFFER_MAX    = 50;

  var _sessionId    = null;
  var _seq          = 0;
  var _buffer       = [];
  var _flushTimer   = null;
  var _getApiFn     = null;      // factory: () => apiClient; always gets fresh token
  var _getState     = null;      // () => store.getState(); set via init()
  var _tabId        = _genUuid();// random per page-load; identifies tab
  var _pagehideBound = false;    // guard: only bind pagehide once per page lifetime
  var _clickBound   = false;     // guard: only bind global click interceptor once

  function _genUuid() {
    try { return crypto.randomUUID(); } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function _readSession() {
    try {
      _sessionId = sessionStorage.getItem(SK_SID) || null;
      _seq       = parseInt(sessionStorage.getItem(SK_SEQ) || '0', 10) || 0;
    } catch (e) {}
  }

  function _persistSession() {
    try {
      if (_sessionId) sessionStorage.setItem(SK_SID, _sessionId);
      sessionStorage.setItem(SK_SEQ, String(_seq));
    } catch (e) {}
  }

  function _clearSession() {
    _sessionId = null;
    _seq       = 0;
    _buffer    = [];
    try {
      sessionStorage.removeItem(SK_SID);
      sessionStorage.removeItem(SK_SEQ);
    } catch (e) {}
  }

  function _compactSnapshot() {
    if (!_getState) return null;
    try {
      var s = _getState();
      return {
        view:          s.view,
        realtimeMode:  s.realtimeMode,
        isVip:         s.isVip,
        isAdmin:       s.isAdmin,
        managingLobby: s.managingLobby,
        hostSuccess:   s.hostSuccess,
        queues: (s.queues || []).map(function (q) {
          return { id: q.id, status: q.status, raid_id: q.raid_id, boss_id: q.boss_id || null };
        }),
        hosts: (s.hosts || []).map(function (h) {
          return { id: h.id, status: h.status };
        }),
        conflicts: (s.conflicts || []).map(function (c) {
          return { left: c.leftQueueId, right: c.rightQueueId, reason: c.reason };
        }),
        raids_slim: (s.raids || []).map(function (r) {
          return { id: r.id, status: r.status, boss_id: r.raid_boss_id || null };
        })
      };
    } catch (e) { return null; }
  }

  function _readAuditConfig() {
    var DEFAULT = { enabled: true, flush_interval_ms: 5000, buffer_max: 50,
                    categories: { session:true, error:true, nav:true, queue:true,
                                  host:true, lifecycle:true, realtime:true,
                                  data:true, account:true, admin:true, ui:true } };
    try {
      var s = _getState && _getState();
      var cfg = s && s.appConfig && s.appConfig.audit_config;
      return cfg || DEFAULT;
    } catch (e) { return DEFAULT; }
  }

  function _getApiClient() {
    return _getApiFn ? _getApiFn() : null;
  }

  function init(getApiFn, getStateFn) {
    _getApiFn = getApiFn;
    _getState = getStateFn;
    _readSession();
    if (_flushTimer) clearInterval(_flushTimer);
    _flushTimer = setInterval(flush, FLUSH_MS);
    if (!_pagehideBound) {
      _pagehideBound = true;
      window.addEventListener('pagehide', function () {
        track('lifecycle', 'lifecycle.page_unload', null, false);
        flush();
      });
      // bfcache restore — page popped from browser back/forward cache
      window.addEventListener('pageshow', function (e) {
        if (e.persisted) {
          track('lifecycle', 'lifecycle.bfcache_restore', null, true);
          flush();
        }
      });
      // JS exceptions — best-effort; only fires if SessionAudit.init() has already run
      window.addEventListener('error', function (e) {
        track('error', 'error.js_exception', {
          message: e.message || null,
          source:  e.filename || null,
          line:    e.lineno || null,
          col:     e.colno || null
        }, true);
      });
      // Unhandled promise rejections
      window.addEventListener('unhandledrejection', function (e) {
        var reason = e.reason;
        track('error', 'error.unhandled_rejection', {
          message: reason && reason.message ? reason.message : String(reason || 'unknown')
        }, true);
      });
    }
    // Global click interceptor — capture every button/link interaction.
    // Uses capture phase so it fires before any stopPropagation in individual handlers.
    // Only records interactive elements (BUTTON, A, [role=button], [data-action]).
    if (!_clickBound) {
      _clickBound = true;
      document.addEventListener('click', function (e) {
        if (!_sessionId) return;
        var el = e.target;
        // Walk up max 6 levels to find nearest interactable ancestor
        for (var i = 0; i < 6; i++) {
          if (!el || !el.tagName) break;
          var tag = el.tagName;
          if (tag === 'BUTTON' || tag === 'A' ||
              el.getAttribute('role') === 'button' ||
              el.getAttribute('data-action') != null) {
            var text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
            var dataMap = {};
            var attrs = el.attributes;
            for (var j = 0; j < attrs.length; j++) {
              if (attrs[j].name.slice(0, 5) === 'data-') {
                dataMap[attrs[j].name.slice(5)] = attrs[j].value;
              }
            }
            track('ui', 'ui.click', {
              tag:     tag,
              text:    text,
              action:  el.getAttribute('data-action') || null,
              id:      el.id || null,
              classes: el.className || null,
              data:    dataMap
            }, true);
            return;
          }
          el = el.parentElement;
        }
      }, true); // capture phase
    }
  }

  function resumeOrOpen(getApiFn, getStateFn, userAgent, clientInfo) {
    init(getApiFn, getStateFn);
    if (_sessionId) return Promise.resolve(_sessionId);
    return openSession(userAgent, clientInfo);
  }

  function openSession(userAgent, clientInfo) {
    var api = _getApiClient();
    if (!api) return Promise.resolve(null);
    return api.openUserSession(
      userAgent || navigator.userAgent,
      Object.assign({ tab_id: _tabId, screen_w: screen.width, screen_h: screen.height,
                       timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                    clientInfo || {})
    ).then(function (sid) {
      _sessionId = sid;
      _seq = 0;
      _persistSession();
      return sid;
    }).catch(function () { return null; });
  }

  function closeSession(reason, finalPayload) {
    var api = _getApiClient();
    if (!api || !_sessionId) { _clearSession(); return Promise.resolve(); }
    var sid = _sessionId;
    var events = _buffer.slice();
    _clearSession();
    if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
    // Note: if reason is 'session_expiry', the JWT is already invalid and this RPC will
    // silently 401. The session row keeps ended_at IS NULL — correctly flagged as abrupt.
    return api.closeUserSession(sid, reason, events).catch(function () {});
  }

  function track(eventType, eventName, payload, includeSnapshot) {
    if (!_sessionId) return;
    var cfg = _readAuditConfig();
    if (!cfg.enabled) return;
    var ALWAYS_ON = { session: true, error: true };
    if (!ALWAYS_ON[eventType] && !(cfg.categories && cfg.categories[eventType])) return;
    _seq += 1;
    _persistSession();
    var evt = {
      seq:            _seq,
      event_type:     eventType,
      event_name:     eventName,
      payload:        payload || {},
      store_snapshot: _compactSnapshot(),
      occurred_at:    new Date().toISOString()
    };
    _buffer.push(evt);
    if (_buffer.length >= BUFFER_MAX) flush();
  }

  function flush() {
    var api = _getApiClient();
    if (!api || !_sessionId || _buffer.length === 0) return;
    var events = _buffer.slice();
    _buffer = [];
    api.batchInsertSessionEvents(_sessionId, events).catch(function () {
      // On failure: silently drop — audit must never affect the app
    });
  }

  function applyConfig(cfg) {
    if (!cfg) return;
    var newInterval = cfg.flush_interval_ms || FLUSH_MS;
    BUFFER_MAX = cfg.buffer_max || BUFFER_MAX;
    if (newInterval !== FLUSH_MS) {
      FLUSH_MS = newInterval;
      if (_flushTimer) clearInterval(_flushTimer);
      _flushTimer = setInterval(flush, FLUSH_MS);
    }
  }

  global.SessionAudit = { init: init, resumeOrOpen: resumeOrOpen, openSession: openSession,
                          closeSession: closeSession, track: track, flush: flush,
                          applyConfig: applyConfig };
})(window);
