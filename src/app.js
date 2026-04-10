(function (global) {
  var AppHtml = global.AppHtml || {};

  /* ═══════════════════════════════════════════════════════════════
     State bootstrap
     ═══════════════════════════════════════════════════════════════ */
  var store = global.AppStore.createStore({
    config: global.AppConfig.getRuntimeConfig(),
    raids: [],
    bosses: [],
    raidBosses: [],
    queues: [],
    hosts: [],
    conflicts: [],
    loading: false,
    message: "",
    lastRefreshedAt: null,
    syncCursor: null,
    view: "home",
    isVip: false,
    isAdmin: false,
    searchTerm: "",
    hostSuccess: false,
    authMode: "signin",
    pendingConfirmation: null,
    managingLobby: null,
    lobbyQueues: [],
    profile: null,
    accountStats: null,
    snapshots: {},
    openLobbyQrs: {},
    lobbyInfoOpen: {},
    adminBosses: [],
    adminEditingId: null,
    adminShowAddForm: false,
    adminTab: 'bosses',
    appConfig: null,
    realtimeMode: 'polling',
    realtimeRetrying: false,
    realtimeSlotStats: null
  });

  var AppConstants = global.AppConstants || {
    STATUS: {
      QUEUED: 'queued',
      INVITED: 'invited',
      CONFIRMED: 'confirmed',
      RAIDING: 'raiding',
      DONE: 'done',
      LEFT: 'left',
      CANCELLED: 'cancelled'
    },
    POLL: { HOT_MS: 2000, WARM_MS: 5000, IDLE_MS: 20000 },
    MAINTENANCE: { HOT_MS: 10000, WARM_MS: 30000, IDLE_MS: 60000 },
    INACTIVITY_TIMEOUT_S: 100,
    FRIEND_CODE_LENGTH: 12,
    FRIEND_CODE_BLOCK: 4,
    FORM_PERSIST_PREFIX: 'rsp:'
  };

    /* ═══════════════════════════════════════════════════════════════
      Globals & startup validation
      ═══════════════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════════════
     Helpers
     ═══════════════════════════════════════════════════════════════ */
  var DEBUG_STARTUP = false;
  var ROLLBACK_SWITCHES = {
    signOutCancelsHostedRaids: true,
    beforeUnloadClosesAuditSession: true
  };
  var profileEditMode = false;
  var hostSuccessTimer = null;

  function assertRequiredGlobal(name) {
    if (!global[name]) {
      throw new Error('[RaidSync] Required global missing: ' + name + '. Check script load order in index.html.');
    }
  }

  function assertRequiredView(name) {
    if (!global.AppViews || typeof global.AppViews[name] !== 'function') {
      throw new Error('[RaidSync] AppViews.' + name + ' is not a function. Check views script loading.');
    }
  }

  function assertGlobals() {
    // Always required in current architecture.
    assertRequiredGlobal('AppConfig');
    assertRequiredGlobal('AppStore');
    assertRequiredGlobal('SupabaseApi');

    // Incremental checks: strict only when debugging startup or when globals already exist.
    if (DEBUG_STARTUP || global.AppConstants) {
      assertRequiredGlobal('AppConstants');
    }
    if (DEBUG_STARTUP || global.QueueFSM) {
      assertRequiredGlobal('QueueFSM');
    }
    if (DEBUG_STARTUP || global.SessionFSM) {
      assertRequiredGlobal('SessionFSM');
    }
    if (DEBUG_STARTUP || global.AppHtml) {
      assertRequiredGlobal('AppHtml');
    }
    if (DEBUG_STARTUP || global.AppViews) {
      assertRequiredGlobal('AppViews');
    }

    // Pre-extraction safe: validate known view methods only when they are present.
    if (global.AppViews) {
      ['render', 'renderAccount', 'renderAdmin', 'renderProfileQr', 'renderLobbyQrs', 'renderHome', 'renderHostBossSelect', 'renderHostSuccess', 'renderQueues', 'renderVip'].forEach(function (name) {
        if (Object.prototype.hasOwnProperty.call(global.AppViews, name)) {
          assertRequiredView(name);
        }
      });
    }
  }

  function qs(id) { return document.getElementById(id); }

  var queueActionUtils = global.QueueActionUtils || {
    shouldShowLeaveQueueButton: function (status) {
      return status === 'queued' || status === 'invited' || status === 'confirmed';
    }
  };

  /* ── Feature D: session-scoped form persistence ── */
  var formPersist = {
    key: function (formId, fieldId) { return AppConstants.FORM_PERSIST_PREFIX + formId + ':' + fieldId; },
    save: function (formId, fieldId, value) {
      try { sessionStorage.setItem(this.key(formId, fieldId), value); } catch (e) {}
    },
    load: function (formId, fieldId) {
      try { return sessionStorage.getItem(this.key(formId, fieldId)); } catch (e) { return null; }
    },
    clear: function (formId) {
      try {
        Object.keys(sessionStorage)
          .filter(function (k) { return k.indexOf(AppConstants.FORM_PERSIST_PREFIX + formId + ':') === 0; })
          .forEach(function (k) { sessionStorage.removeItem(k); });
      } catch (e) {}
    },
    clearAll: function () {
      try {
        Object.keys(sessionStorage)
          .filter(function (k) { return k.indexOf(AppConstants.FORM_PERSIST_PREFIX) === 0; })
          .forEach(function (k) { sessionStorage.removeItem(k); });
      } catch (e) {}
    }
  };

  function setMessage(text, kind) {
    if (!text) return;
    var type = kind === "ok" ? "success" : (kind === "error" ? "error" : "info");
    showToast(text, type);
  }

  /* ── Reusable Toast ─────────────────────────────────────────── */
  function showToast(message, type, duration) {
    var container = document.getElementById("toastContainer");
    if (!container) return;
    var kind = type || "info";
    var ms = typeof duration === "number" ? duration : 5000;
    var iconName = kind === "success" ? "checkCircle" : kind === "error" ? "xCircle" : "alert";
    var el = document.createElement("div");
    el.className = "toast toast-" + kind;
    el.innerHTML = AppHtml.icon(iconName, 18, 18) + " " + AppHtml.escapeHtml(message);
    container.appendChild(el);
    var timer = setTimeout(function () { dismissToast(el); }, ms);
    el.addEventListener("click", function () { clearTimeout(timer); dismissToast(el); });
  }
  function dismissToast(el) {
    if (!el || !el.parentNode) return;
    el.classList.add("toast-out");
    el.addEventListener("animationend", function () { el.remove(); });
  }

  function setLoading(isLoading) {
    store.setState({ loading: !!isLoading });
    var bar = document.getElementById("pageLoader");
    if (!bar) return;
    if (isLoading) {
      if (bar._hideTimer) { clearTimeout(bar._hideTimer); bar._hideTimer = null; }
      bar.style.transition = "none";
      bar.style.width = "0%";
      bar.style.opacity = "1";
      bar.offsetWidth; // force reflow so transition applies
      bar.style.transition = "width 8s cubic-bezier(0.05, 0.5, 0.1, 1)";
      bar.style.width = "75%";
    } else {
      bar.style.transition = "width 0.15s ease";
      bar.style.width = "100%";
      bar._hideTimer = setTimeout(function () {
        bar.style.transition = "opacity 0.3s ease";
        bar.style.opacity = "0";
        setTimeout(function () {
          bar.style.transition = "none";
          bar.style.width = "0%";
        }, 320);
        bar._hideTimer = null;
      }, 150);
    }
  }

  function updateRenderedHtml(el, html) {
    if (!el) return false;
    if (el.__renderedHtml === html) return false;
    el.__renderedHtml = html;
    el.innerHTML = html;
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
     PUSH NOTIFICATIONS — helpers
     ═══════════════════════════════════════════════════════════════ */
  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function subscribeToPushNotifications() {
    var token = store.getState().config.token;
    if (!token) return Promise.reject(new Error('Not authenticated'));
    return fetch('/api/vapid-key', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(res) {
      if (!res.ok) throw new Error('Failed to fetch VAPID key');
      return res.json();
    }).then(function(data) {
      var applicationServerKey = urlBase64ToUint8Array(data.key);
      return navigator.serviceWorker.ready.then(function(reg) {
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey
        });
      });
    }).then(function(subscription) {
      var keys = subscription.toJSON ? subscription.toJSON().keys : subscription.keys;
      return fetch('/api/rest/v1/rpc/upsert_push_subscription', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          app_mode: navigator.standalone ? 'pwa' : 'browser'
        })
      }).then(function(res) {
        if (!res.ok) throw new Error('Failed to save subscription');
      SessionAudit.track('notif', 'notif.subscription_created', null, false);
    });
  }

  function switchView(view) {
    formPersist.save('app', 'view', view);
    var _prevView = store.getState().view;
    store.setState({ view: view, hostSuccess: false });
    SessionAudit.track('nav', 'nav.view_switch', { from: _prevView, to: view }, false);
    render(store.getState());
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    // Re-trigger entrance animation (needed for static-HTML views like home/host)
    var section = document.getElementById(view + 'View');
    if (section) {
      var titleWrap = section.querySelector('.view-title-wrap');
      if (titleWrap) {
        titleWrap.style.animation = 'none';
        titleWrap.offsetHeight; // force reflow
        titleWrap.style.animation = '';
      }
    }
  }

  function isAuthed() {
    var cfg = store.getState().config;
    return !!(cfg && cfg.token && cfg.userId);
  }

  function getApi() {
    return global.SupabaseApi.createApiClient({
      token: store.getState().config.token
    });
  }

  function ensureAuth() {
    if (isAuthed()) return true;
    showToast("Please sign in to continue.", "info");
    switchView("account");
    return false;
  }

  /* ═══════════════════════════════════════════════════════════════
     REALTIME — lifecycle
     ═══════════════════════════════════════════════════════════════ */
  async function initRealtimeMode(api) {
    try {
      var config = await api.getRealtimeConfig();
      SessionAudit.track('realtime_debug', 'realtime.config_fetched', {
        url: config.url || null,
        anonKey_prefix: config.anonKey ? config.anonKey.slice(0, 10) : null
      }, false);
      var result = await api.claimRealtimeSlot();
      SessionAudit.track('realtime_debug', 'realtime.slot_claimed', { granted: !!result.granted }, false);
      if (result.granted) {
        var userId = store.getState().config.userId;
        global.AppRealtime.connect(
          config.url,
          config.anonKey,
          function () { return store.getState().config.token; },
          userId
        );
        store.setState({ realtimeMode: 'realtime', realtimeRetrying: false });
        SessionAudit.track('realtime', 'realtime.connected', {}, false);
        // Keep slot count fresh: main poll is throttled to IDLE_MS in realtime mode,
        // so other users claiming/releasing slots would otherwise take up to 20s to reflect.
        _slotStatsPollTimer = setInterval(function () {
          api.getRealtimeSlotStats().then(function (stats) {
            store.setState({ realtimeSlotStats: stats, lastRefreshedAt: new Date() });
            renderFooter(store.getState());
          }).catch(function () {});
        }, 5000);
        // Heartbeat: refresh granted_at every 1.5 min so the backend TTL (3 min) never
        // evicts this active session. Also proves liveness to get_realtime_slot_stats cleanup.
        // Guard: if realtimeMode was cleared (e.g. sign-out without teardown in old tab),
        // the interval self-terminates so a stale JWT can't keep a phantom session alive.
        _heartbeatTimer = setInterval(function () {
          if (store.getState().realtimeMode !== 'realtime') {
            clearInterval(_heartbeatTimer);
            _heartbeatTimer = null;
            return;
          }
          api.claimRealtimeSlot().catch(function () {});
        }, 90 * 1000);
      }
    } catch (e) {
      console.warn('[Realtime] init failed, staying in polling mode', e);
      SessionAudit.track('realtime_debug', 'realtime.init_failed', { error: e && e.message }, false);
    }
  }

  async function teardownRealtimeMode(api) {
    if (_slotStatsPollTimer) {
      clearInterval(_slotStatsPollTimer);
      _slotStatsPollTimer = null;
    }
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
    if (_realtimeRetryTimer) {
      clearTimeout(_realtimeRetryTimer);
      _realtimeRetryTimer = null;
    }
    global.AppRealtime.disconnect();
    try { await api.releaseRealtimeSlot(); } catch (e) { /* best-effort */ }
    store.setState({ realtimeMode: 'polling', realtimeRetrying: false });
    SessionAudit.track('realtime', 'realtime.disconnected', {}, false);
  }

  // Called by AppRealtime IIFE → window.App.handleRealtimeEvent() on WS change event.
  // Debounce has already fired in the IIFE by the time this is called.
  function handleRealtimeEvent() {
    if (_refreshInFlight) return;
    SessionAudit.track('realtime', 'realtime.push_received', {}, false);
    refreshData();
  }

  // Called by AppRealtime on CHANNEL_ERROR, TIMED_OUT, or own realtime_sessions DELETE.
  // Schedules a backoff retry (20 s, capped at 3 attempts) for transient service blips.
  // Intentional evictions (realtime_sessions DELETE) also come through here but are capped
  // the same way — the slot RPC will simply return granted=false if the slot was legitimately
  // revoked, so retries are harmless.
  // Demotion guard: multiple channels can fire simultaneously on a WS drop. Only the first
  // caller proceeds; the rest are suppressed and logged for diagnostics.
  var _demotionInFlight = false;
  function handleRealtimeDemotion(sourceChannel, sourceStatus) {
    if (_demotionInFlight) {
      SessionAudit.track('realtime_debug', 'realtime.demotion_suppressed', {
        channel: sourceChannel || null, status: sourceStatus || null, reason: 'already_in_teardown'
      }, false);
      return;
    }
    _demotionInFlight = true;
    SessionAudit.track('realtime_debug', 'realtime.demotion_triggered', {
      channel: sourceChannel || null, status: sourceStatus || null, retryCount: _realtimeRetryCount
    }, false);
    var api = getApi();
    teardownRealtimeMode(api).then(function () {
      _demotionInFlight = false;
      if (_realtimeRetryCount >= 3) {
        SessionAudit.track('realtime', 'realtime.retry_exhausted', { attempts: _realtimeRetryCount }, false);
        return;
      }
      _realtimeRetryCount++;
      var delay = 30000; // 30 s — clears the full Supabase Realtime restart window (10–30 s)
      store.setState({ realtimeRetrying: true });
      SessionAudit.track('realtime', 'realtime.retry_scheduled', { attempt: _realtimeRetryCount, delay_ms: delay }, false);
      _realtimeRetryTimer = setTimeout(function () {
        _realtimeRetryTimer = null;
        if (!isAuthed() || store.getState().realtimeMode === 'realtime') {
          store.setState({ realtimeRetrying: false });
          return;
        }
        initRealtimeMode(api).then(function () {
          if (store.getState().realtimeMode === 'realtime') {
            _realtimeRetryCount = 0; // reset on success
          } else {
            store.setState({ realtimeRetrying: false }); // retry ran but slot not granted
          }
        });
      }, delay);
    });
  }

  // Export realtime callbacks for AppRealtime IIFE (realtimeClient.js)
  window.App = window.App || {};
  window.App.handleRealtimeEvent = handleRealtimeEvent;
  window.App.handleRealtimeDemotion = handleRealtimeDemotion;

  function handleSessionExpiry() {
    SessionAudit.track('error', 'error.api_401', { triggered_from: 'handleSessionExpiry' }, true);
    SessionAudit.track('session', 'session.closed', { reason: 'session_expiry' }, false);
    SessionAudit.closeSession('session_expiry');
    _realtimeRetryCount = 0;
    teardownRealtimeMode(getApi());
    global.AppConfig.clearSession();
    formPersist.clearAll();
    profileEditMode = false;
    closeDrawer();
    store.setState({
      config: Object.assign({}, store.getState().config, { token: "", userId: "" }),
      view: "account",
      queues: [],
      conflicts: [],
      hosts: [],
      isVip: false,
      isAdmin: false,
      authMode: "signin",
      pendingConfirmation: null,
      profile: null,
      snapshots: {},
      openLobbyQrs: {},
      lobbyInfoOpen: {},
      adminBosses: [],
      adminEditingId: null,
      syncCursor: null,
      managingLobby: null,
      lobbyQueues: [],
      realtimeMode: 'polling',
      realtimeRetrying: false
    });
    showToast("Session expired. Please sign in again.", "error");
  }

  function normalizeSyncCursor(cursor) {
    cursor = cursor || {};
    return {
      myQueuesVersion: cursor.myQueuesVersion || null,
      hostedRaidsVersion: cursor.hostedRaidsVersion || null,
      managingLobbyVersion: cursor.managingLobbyVersion || null
    };
  }

  function syncCursorChanged(prevCursor, nextCursor) {
    var prev = normalizeSyncCursor(prevCursor);
    var next = normalizeSyncCursor(nextCursor);
    return prev.myQueuesVersion !== next.myQueuesVersion
      || prev.hostedRaidsVersion !== next.hostedRaidsVersion
      || prev.managingLobbyVersion !== next.managingLobbyVersion;
  }

  function getQueueSyncCursor(api, managingRaidId) {
    if (!isAuthed()) return Promise.resolve(null);
    return api.getQueueSyncState(managingRaidId || null).then(normalizeSyncCursor);
  }

  function captureQueueSyncCursor(api, managingRaidId) {
    if (!isAuthed()) {
      store.setState({ syncCursor: null });
      return Promise.resolve(null);
    }
    return getQueueSyncCursor(api, managingRaidId).then(function (cursor) {
      store.setState({ syncCursor: cursor });
      return cursor;
    });
  }

  function getSyncPollInterval(state) {
    // realtimeMode === 'realtime' && !managingLobby → POLL.IDLE_MS (see QueueFSM.getSyncHeat)
    return QueueFSM.getPollInterval(QueueFSM.getSyncHeat(state));
  }

  function getMaintenanceInterval(state) {
    return QueueFSM.getMaintenanceInterval(QueueFSM.getMaintenanceHeat(state));
  }

  function runQueueMaintenance(api, state) {
    var hosts = state.hosts || [];
    if (!hosts.length) return Promise.resolve();
    var tasks = hosts.map(function (h) {
      return api.expireStaleInvites(h.id).catch(function () {})
        .then(function () { return api.checkHostInactivity(h.id).catch(function () {}); })
        .then(function () { return api.touchHostActivity(h.id).catch(function () {}); });
    });
    return Promise.all(tasks).then(function () {});
  }

  function buildBossesFromRaids(raids) {
    var bossMap = {};
    (raids || []).forEach(function (r) {
      var rb = Array.isArray(r.raid_bosses) ? r.raid_bosses[0] : r.raid_bosses;
      if (!rb || !rb.id) return;
      if (!bossMap[rb.id]) {
        bossMap[rb.id] = { id: rb.id, name: rb.name, tier: rb.tier, pokemon_id: rb.pokemon_id, image_url: rb.image_url, types: rb.types || [], active_hosts: 0, queue_length: 0 };
      }
      bossMap[rb.id].active_hosts += 1;
    });
    return Object.keys(bossMap).map(function (id) { return bossMap[id]; });
  }

  function applyHostCapacityState(isVip) {
    var config = store.getState().appConfig || {};
    var freeCap = config.host_capacity_free || 5;
    var vipCap = config.host_capacity_vip || 10;
    var cap = isVip ? vipCap : freeCap;
    var range = qs("hostSpots");
    var maxLabel = qs("hostSpotsMax");
    var nudge = qs("hostVipNudge");
    var vipCapLabel = qs("hostVipCapLabel");
    if (range) {
      range.max = String(cap);
      if (parseInt(range.value, 10) > cap) range.value = String(cap);
      var valueDisplay = qs("hostSpotsValue");
      if (valueDisplay) valueDisplay.textContent = range.value;
    }
    if (maxLabel) maxLabel.textContent = cap + " Players";
    if (nudge) nudge.classList.toggle("hidden", !!isVip);
    if (vipCapLabel) vipCapLabel.textContent = String(vipCap);
  }

  /* ═══════════════════════════════════════════════════════════════
     Render orchestration
     ═══════════════════════════════════════════════════════════════ */
  function renderAccountView(state) {
    global.AppViews.renderAccount(state, {
      qs: qs,
      updateRenderedHtml: updateRenderedHtml,
      viewTitleHtml: AppHtml.viewTitleHtml,
      isAuthed: isAuthed,
      icon: AppHtml.icon,
      escapeHtml: AppHtml.escapeHtml,
      buildFriendCodeDeepLink: AppHtml.buildFriendCodeDeepLink,
      formatFriendCode: AppHtml.formatFriendCode,
      profileEditMode: profileEditMode,
      formPersist: formPersist
    });

    // Keep QR rendering side effects outside the account view module.
    postRenderAccountEffects();
  }

  function postRenderAccountEffects() {
    var container = qs("profileQrContainer");
    if (!container) return;
    var prof = store.getState().profile || {};
    var link = AppHtml.buildFriendCodeDeepLink(prof.friend_code);
    renderQrSvg(container, link, 5);
  }

  function renderQrSvg(container, link, moduleSize) {
    if (!container || !link || typeof qrcode === "undefined") return;
    container.innerHTML = "";
    try {
      var qr = qrcode(0, "M");
      qr.addData(link);
      qr.make();
      container.innerHTML = qr.createSvgTag(moduleSize || 5, 0);
    } catch (e) { /* ignore render failures */ }
  }

  function postRenderQueueEffects() {
    var nodes = document.querySelectorAll('.lobby-qr-canvas[data-friend-code]');
    nodes.forEach(function (node) {
      renderQrSvg(node, AppHtml.buildFriendCodeDeepLink(node.getAttribute('data-friend-code')), 3);
    });

    bindDirectManageLobbyActions();
  }

  function openManageLobby(manageLobby, api) {
    if (!manageLobby) return Promise.resolve();
    if (!ensureAuth()) return Promise.resolve();
    SessionAudit.track('host', 'host.manage_lobby_open', { raid_id: manageLobby }, true);

    var client = api || getApi();
    setLoading(true);
    return client.listRaidQueue(manageLobby).then(function (rows) {
      store.setState({ managingLobby: manageLobby, lobbyQueues: rows || [], openLobbyQrs: {}, lobbyInfoOpen: {} });
      render(store.getState());
      // Fetch snapshot so host sees the pill row
      return client.getQueueSnapshot(manageLobby).then(function (snap) {
        if (Array.isArray(snap) && snap.length > 0) {
          var prev = store.getState().snapshots || {};
          var next = Object.assign({}, prev);
          next[manageLobby] = snap;
          store.setState({ snapshots: next });
          render(store.getState());
        }
      }).catch(function () {});
    }).then(function () {
      return captureQueueSyncCursor(client, manageLobby);
    }).catch(function (err) {
      if (err && err.status === 401) { handleSessionExpiry(); return; }
      setMessage("Failed to load lobby: " + err.message, "error");
    }).finally(function () { setLoading(false); });
  }

  function bindDirectManageLobbyActions() {
    var wrap = qs("queuesContent");
    if (!wrap) return;

    var buttons = wrap.querySelectorAll("[data-manage-lobby]");
    buttons.forEach(function (btn) {
      if (btn.__manageLobbyBound) return;
      btn.__manageLobbyBound = true;

      var activate = function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        var lobbyId = btn.getAttribute("data-manage-lobby");
        if (!lobbyId) return;
        openManageLobby(lobbyId, getApi());
      };

      btn.addEventListener("click", activate);
      btn.addEventListener("pointerup", function (e) {
        if (e.pointerType === "mouse") return;
        activate(e);
      });
    });
  }

  function renderHomeView(state) {
    global.AppViews.renderHome(state, {
      qs: qs,
      updateRenderedHtml: updateRenderedHtml,
      getBossDisplayImage: AppHtml.getBossDisplayImage
    });
  }

  function renderHostBossSelectView(state) {
    global.AppViews.renderHostBossSelect(state, {
      qs: qs,
      formPersist: formPersist
    });
  }

  function renderHostSuccessView(state) {
    global.AppViews.renderHostSuccess(state, {
      qs: qs
    });
  }

  function renderHostCancelConfirmView(state) {
    global.AppViews.renderCancelConfirmModal(state, {
      qs: qs
    });
  }

  function renderQueuesView(state) {
    var wrap = qs("queuesContent");
    if (!wrap) return;

    var html = global.AppViews.renderQueues(state, {
      icon: AppHtml.icon,
      personSvg: AppHtml.personSvg,
      escapeHtml: AppHtml.escapeHtml,
      viewTitleHtml: AppHtml.viewTitleHtml,
      getBossDisplayImage: AppHtml.getBossDisplayImage,
      renderTrainerMeta: AppHtml.renderTrainerMeta,
      getTrainerDisplayName: AppHtml.getTrainerDisplayName,
      formatFriendCode: AppHtml.formatFriendCode,
      shouldShowLeaveQueueButton: queueActionUtils.shouldShowLeaveQueueButton,
      QueueFSM: global.QueueFSM,
      isTerminalRaidStatus: function (status) {
        return !!(global.RaidPredicates && typeof global.RaidPredicates.isTerminal === 'function' && global.RaidPredicates.isTerminal(status));
      }
    });

    updateRenderedHtml(wrap, html);
    postRenderQueueEffects();
  }

  function renderVipView(state) {
    global.AppViews.renderVip(state, {
      qs: qs,
      updateRenderedHtml: updateRenderedHtml
    });
  }

  function renderAdminView(state) {
    global.AppViews.renderAdmin(state, {
      qs: qs,
      updateRenderedHtml: updateRenderedHtml,
      viewTitleHtml: AppHtml.viewTitleHtml,
      icon: AppHtml.icon,
      escapeHtml: AppHtml.escapeHtml,
      renderTierStars: AppHtml.renderTierStars
    });
  }

  function renderNav(state) {
    var activeView = state.view || 'home';
    var queueCount = (state.queues || []).length;
    var visibleViews = ['home', 'host', 'queues', 'vip', 'account', 'admin'];

    visibleViews.forEach(function (viewName) {
      var viewSection = qs(viewName + 'View');
      if (viewSection) {
        viewSection.classList.toggle('active', viewName === activeView);
      }
    });

    document.querySelectorAll('[data-view]').forEach(function (node) {
      var isActive = node.getAttribute('data-view') === activeView;
      if (node.classList.contains('nav-link') || node.classList.contains('drawer-link')) {
        node.classList.toggle('active', isActive);
      }
    });

    var vipNavLink = qs('vipNavLink');
    if (vipNavLink) {
      vipNavLink.classList.toggle('vip-subscribed', !!state.isVip);
      vipNavLink.classList.toggle('highlight', !state.isVip);
    }

    var adminLink = qs('drawerAdminLink');
    if (adminLink) {
      adminLink.classList.toggle('hidden', !state.isAdmin);
    }

    var queuesNavIcon = qs('queuesNavIcon');
    if (queuesNavIcon) {
      var badge = queuesNavIcon.querySelector('.queue-badge');
      if (queueCount > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'queue-badge';
          queuesNavIcon.appendChild(badge);
        }
        badge.textContent = queueCount > 9 ? '9+' : String(queueCount);
      } else if (badge) {
        badge.remove();
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER — master
     ═══════════════════════════════════════════════════════════════ */
  function render(state) {
    renderNav(state);
    renderAccountView(state);
    renderHostBossSelectView(state);
    renderHostSuccessView(state);
    renderHostCancelConfirmView(state);
    renderHomeView(state);
    renderQueuesView(state);
    renderVipView(state);
    renderAdminView(state);
    renderFooter(state);
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER — Sync footer
     ═══════════════════════════════════════════════════════════════ */
  function formatRelativeTime(date) {
    if (!date) return "";
    var secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 5) return "just now";
    if (secs < 60) return secs + "s ago";
    var mins = Math.floor(secs / 60);
    if (mins < 60) return mins + "m ago";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderFooter(state) {
    var el = qs("syncFooter");
    if (!el) return;
    if (!state.lastRefreshedAt) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    var timeStr = formatRelativeTime(state.lastRefreshedAt);
    el.innerHTML =
      '<div class="sync-footer-inner">' +
      '  <span class="sync-text">' + AppHtml.icon("check", 14) + ' Synced ' + AppHtml.escapeHtml(timeStr) + '</span>' +
      '  <button class="sync-btn" id="syncRefreshBtn" type="button">' + AppHtml.icon("clock", 14) + ' Refresh</button>' +
      '</div>';
  }

  function rethrowIfExpired(err) {
    if (err && err.status === 401) throw err;
    return [];
  }

  function attachQueueHostProfiles(api, queues) {
    var list = Array.isArray(queues) ? queues : [];
    var raidIds = [];

    list.forEach(function (q) {
      if (!q || !q.raid_id || raidIds.indexOf(q.raid_id) >= 0) return;
      raidIds.push(q.raid_id);
    });

    if (!raidIds.length) return Promise.resolve(list);

    return Promise.all(raidIds.map(function (raidId) {
      return api.getRaidHostProfile(raidId).then(function (rows) {
        return {
          raidId: raidId,
          profile: Array.isArray(rows) && rows.length > 0 ? rows[0] : null
        };
      }).catch(function (err) {
        if (err && err.status === 401) throw err;
        return { raidId: raidId, profile: null };
      });
    })).then(function (results) {
      var profileMap = {};
      results.forEach(function (result) {
        profileMap[result.raidId] = result.profile;
      });
      return list.map(function (q) {
        var nextQueue = Object.assign({}, q);
        nextQueue.host_profile = profileMap[q.raid_id] || null;
        return nextQueue;
      });
    });
  }

  function pickProfileRow(rows) {
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  function loadProfileWithFallback(api, userId) {
    return api.getMyProfile(userId).then(function (rows) {
      var profile = pickProfileRow(rows);
      if (profile) return profile;

      return api.ensureMyProfile(userId).then(function (createdRows) {
        var created = pickProfileRow(createdRows);
        if (created) return created;
        return api.getMyProfile(userId).then(pickProfileRow);
      });
    }).catch(function (err) {
      if (err && err.status === 401) throw err;
      return null;
    });
  }

  function _trackApiError(err, context) {
    try {
      SessionAudit.track('error', 'error.api_error', {
        message: err && err.message, status: err && err.status, source: context
      }, false);
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════════
     DATA — refresh
     ═══════════════════════════════════════════════════════════════ */
  var _refreshInFlight = false;
  var _slotStatsPollTimer = null;
  var _heartbeatTimer = null;
  var _hiddenAt = null;             // timestamp when tab became hidden
  var _recoveryInFlight = false;    // guard: prevent double-recovery (visibilitychange + pageshow)
  var _recoveryWatchdog = null;     // safety: reset _recoveryInFlight if teardown hangs (no-network)
  var _realtimeRetryTimer = null;   // backoff retry after transient CHANNEL_ERROR / TIMED_OUT
  var _realtimeRetryCount = 0;      // attempts since last successful connection (cap: 3)
  var STALE_THRESHOLD_MS = 30000;   // ms hidden before WS is considered dead; matches iOS Safari kill window

  function refreshData() {
    _refreshInFlight = true;
    var state = store.getState();
    var api = getApi();
    setLoading(true);

    var raidsPromise = api.listActiveRaids().catch(rethrowIfExpired);
    var raidBossesPromise = api.listRaidBosses().catch(rethrowIfExpired);
    var queuePromise = Promise.resolve([]);
    var hostPromise = Promise.resolve([]);
    var vipPromise = Promise.resolve(false);
    var profilePromise = Promise.resolve(null);
    var adminCheckPromise = Promise.resolve(false);
    var accountStatsPromise = Promise.resolve(null);
    var slotStatsPromise = Promise.resolve(null);
    var appConfigPromise = api.getAppConfig().then(function (rows) {
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }).catch(function () { return null; });

    if (state.config.userId && state.config.token) {
      queuePromise = api.listMyQueues(state.config.userId).catch(rethrowIfExpired);
      hostPromise = api.listMyHostedRaids(state.config.userId).catch(rethrowIfExpired);
      vipPromise = api.getVipStatus(state.config.userId).then(function (rows) {
        return Array.isArray(rows) && rows.length > 0;
      }).catch(function (err) {
        if (err && err.status === 401) throw err;
        return false;
      });
      profilePromise = loadProfileWithFallback(api, state.config.userId);
      adminCheckPromise = api.checkIsAdmin(state.config.userId).catch(function () { return false; });
      accountStatsPromise = api.getMyAccountStats().catch(function () { return null; });
      slotStatsPromise = api.getRealtimeSlotStats().catch(function () { return null; });
    }

    return Promise.all([raidsPromise, raidBossesPromise, queuePromise, hostPromise, vipPromise, profilePromise, adminCheckPromise, accountStatsPromise, appConfigPromise, slotStatsPromise])
      .then(function (res) {
        var raids = res[0] || [], raidBosses = res[1] || [];
        var hosts = res[3] || [];
        var isVip = !!res[4];
        var profile = res[5] || null;
        var isAdmin = !!res[6];
        var accountStats = res[7] || null;
        var appConfig = res[8] || null;
        var slotStats = res[9] || null;

        if (profile && accountStats && !accountStats.member_since && profile.created_at) {
          accountStats = Object.assign({}, accountStats, { member_since: profile.created_at });
        }

        return attachQueueHostProfiles(api, res[2] || []).then(function (queues) {
          function buildRefreshPayload(nextQueues) {
            var conflicts = global.ConflictUtils.detectQueueConflicts(nextQueues);

            var bossesPromise = api.listBossQueueStats().then(function (bosses) {
              return { raids:raids, raidBosses:raidBosses, queues:nextQueues, hosts:hosts,
                       conflicts:conflicts, isVip:isVip, isAdmin:isAdmin, profile:profile, accountStats:accountStats, appConfig:appConfig, realtimeSlotStats:slotStats, bosses: Array.isArray(bosses) ? bosses : [] };
            }).catch(function (err) {
              if (err && err.status === 401) throw err;
              return { raids:raids, raidBosses:raidBosses, queues:nextQueues, hosts:hosts,
                       conflicts:conflicts, isVip:isVip, isAdmin:isAdmin, profile:profile, accountStats:accountStats, appConfig:appConfig, realtimeSlotStats:slotStats, bosses: buildBossesFromRaids(raids) };
            });

            if (!isAdmin) return bossesPromise;

            return bossesPromise.then(function (payload) {
              return api.adminListAllBosses().then(function (adminBosses) {
                payload.adminBosses = Array.isArray(adminBosses) ? adminBosses : [];
                return payload;
              }).catch(function () { payload.adminBosses = []; return payload; });
            });
          }

          return buildRefreshPayload(queues);
        });
      })
      .then(function (payload) {
        payload.lastRefreshedAt = new Date();
        var prevQueues = store.getState().queues || [];
        store.setState(payload);
        // Instantly update the sync footer after every refresh
        renderFooter(store.getState());
        SessionAudit.track('data', 'data.refresh_ok', null, false);

        // Auto-open lobby management panel when host has an active lobby
        var currentState = store.getState();
        var currentManaging = currentState.managingLobby;
        var suppressAutoOpenLobby = !!currentState.suppressAutoOpenLobby;
        var firstHost = payload.hosts && payload.hosts.length > 0 ? payload.hosts[0] : null;
        if (!suppressAutoOpenLobby && !currentManaging && firstHost) {
          store.setState({ managingLobby: firstHost.id });
          SessionAudit.track('host', 'host.manage_lobby_auto_open', { raid_id: firstHost.id }, true);
        } else if (currentManaging && payload.hosts && !payload.hosts.find(function (h) { return h.id === currentManaging; })) {
          // Lobby was closed/cancelled — clear managing state
          store.setState({ managingLobby: null, lobbyQueues: [] });
          SessionAudit.track('host', 'host.manage_lobby_auto_close', { raid_id: currentManaging }, true);
        }
        if (suppressAutoOpenLobby) {
          store.setState({ suppressAutoOpenLobby: false });
        }

        // Auto-reinvite toast detection
        (payload.queues || []).forEach(function (q) {
          var prevQ = prevQueues.find(function (p) { return p.id === q.id; });
          if (!prevQ) return;

          // Auto-reinvite toast
          if (q.status === 'invited' && (q.invite_attempts || 0) > 0 && q.invited_at !== prevQ.invited_at) { // TODO: Phase 5 - use QueueFSM
            showToast("You've been automatically re-invited — you still have a spot! (Attempt " + (q.invite_attempts || 0) + " / 3)", 'info');
          }

          // Cap-hit toast
          if (prevQ.status === 'invited' && q.status === 'queued' && (q.invite_attempts || 0) >= 3) { // TODO: Phase 5 - use QueueFSM
            showToast("Invite window expired — you're back in queue at your original position.", 'warning');
          }

          // Lobby full toast
          if (prevQ.status === 'invited' && q.status === 'queued' && (q.invite_attempts || 0) < 3) { // TODO: Phase 5 - use QueueFSM
            showToast("The lobby is full — you've been returned to the queue.", 'info');
          }
        });

        // Keep teammate/lobby rosters synced for every visible active queue.
        var snapshotIds = {};
        (payload.queues || []).forEach(function (q) {
          var raidId = (Array.isArray(q.raids) ? (q.raids[0] && q.raids[0].id) : (q.raids && q.raids.id)) || q.raid_id;
          if (raidId) snapshotIds[raidId] = true;
        });
        // Include host lobby in snapshot — use updated store state
        var autoManagedId = store.getState().managingLobby;
        if (autoManagedId) {
          snapshotIds[autoManagedId] = true;
        }
        var raidIds = Object.keys(snapshotIds);
        if (raidIds.length > 0 && payload.profile !== undefined) {
          var snapshotMap = {};
          var snapshotPromises = raidIds.map(function (raidId) {
            return api.getQueueSnapshot(raidId).then(function (rows) {
              if (Array.isArray(rows)) snapshotMap[raidId] = rows;
            }).catch(function () {});
          });
          Promise.all(snapshotPromises).then(function () {
            if (Object.keys(snapshotMap).length > 0) {
              store.setState({ snapshots: snapshotMap });
            }
          });
        }

        var managingLobbyId = store.getState().managingLobby;
        if (managingLobbyId) {
          api.listRaidQueue(managingLobbyId).then(function (rows) {
            if (store.getState().managingLobby === managingLobbyId) {
              store.setState({ lobbyQueues: rows || [] });
            }
          }).catch(function (err) {
            if (err && err.status === 401) { handleSessionExpiry(); return; }
          });
        }

        return captureQueueSyncCursor(api, store.getState().managingLobby);
      })
      .catch(function (err) {
        if (err && err.status === 401) {
          handleSessionExpiry();
        } else {
          SessionAudit.track('data', 'data.refresh_error', { message: err && err.message }, false);
          _trackApiError(err, 'refreshData');
          setMessage("Refresh failed: " + err.message, "error");
        }
      })
      .finally(function () {
        setLoading(false);
        _refreshInFlight = false;
      });
  }

  /* ═══════════════════════════════════════════════════════════════
     INIT — forms & actions
     ═══════════════════════════════════════════════════════════════ */
  function initAccountActions() {
    var wrap = qs("accountContent");

    wrap.addEventListener("click", function (e) {
      // Edit profile button → enter edit mode
      if (e.target.closest("#editProfileBtn")) {
        profileEditMode = true;
        formPersist.save('app', 'profileEditMode', 'true');
        renderAccountView(store.getState());
        postRenderAccountEffects();
        return;
      }

      // Cancel profile edit → exit edit mode
      if (e.target.closest("#cancelProfileBtn")) {
        profileEditMode = false;
        formPersist.save('app', 'profileEditMode', 'false');
        formPersist.clear('profileForm');
        SessionAudit.track('account', 'account.profile_cancel', null, false);
        renderAccountView(store.getState());
        postRenderAccountEffects();
        return;
      }

      // Enable background notifications
      if (e.target.closest('#enableNotifsBtn')) {
        Notification.requestPermission().then(function(permission) {
          SessionAudit.track('notif', permission === 'granted' ? 'notif.permission_granted' : 'notif.permission_denied', null, false);
          renderAccountView(store.getState());
          if (permission !== 'granted') return;
          subscribeToPushNotifications().then(function() {
            showToast('Background notifications enabled!', 'success');
          }).catch(function(err) {
            console.warn('[Push] Subscribe failed:', err);
            showToast('Could not enable notifications. Please try again.', 'error');
          });
        });
        return;
      }

      // Tab switch — no re-render, just DOM toggle
      var tab = e.target.closest("[data-auth-tab]");
      if (tab) {
        var mode = tab.getAttribute("data-auth-tab");
        store.setState({ authMode: mode });
        // Update tabs
        wrap.querySelectorAll(".auth-tab").forEach(function (t) {
          t.classList.toggle("active", t.getAttribute("data-auth-tab") === mode);
        });
        // Update form data-mode (drives confirm field visibility via CSS)
        var form = qs("authForm");
        if (form) form.setAttribute("data-mode", mode);
        // Update button text + autocomplete
        var submitBtn = qs("authSubmitBtn");
        if (submitBtn) submitBtn.textContent = mode === "signup" ? "Create Account" : "Sign In";
        var pwdInput = qs("authPassword");
        if (pwdInput) pwdInput.setAttribute("autocomplete", mode === "signup" ? "new-password" : "current-password");
        // Update subtitle
        var subtitle = wrap.querySelector(".view-subtitle");
        if (subtitle) subtitle.textContent = mode === "signup"
          ? "Create an account to start joining raids."
          : "Sign in to join raids and track your queues.";
        // Clear confirm field when switching back to sign-in
        if (mode === "signin") { var c = qs("authConfirm"); if (c) c.value = ""; }
        return;
      }

      // Sign out
      var target = e.target.closest("#signOutBtn");
      if (target) {
        SessionAudit.track('session', 'session.closed', { reason: 'sign_out' }, true);
        // Leave active queues on sign-out (fire-and-forget).
        // Capture api now — token is still valid, store still populated.
        // 'raiding' excluded: player is in Pokémon GO, web UI Leave button also excludes it.
        var _signOutApi = getApi();
        (store.getState().queues || []).forEach(function (q) {
          if (q.status === 'queued' || q.status === 'invited'
              || q.status === 'confirmed') {
            _signOutApi.leaveQueue(q.id, 'Signed out').catch(function () {});
          }
        });
        if (ROLLBACK_SWITCHES.signOutCancelsHostedRaids) {
          (store.getState().hosts || []).forEach(function (h) {
            if (h.status === 'open' || h.status === 'lobby' || h.status === 'raiding') {
              _signOutApi.cancelRaid(h.id).catch(function () {});
            }
          });
        }
        SessionAudit.closeSession('sign_out');

        // Tear down realtime BEFORE clearing the token — releaseRealtimeSlot needs a valid JWT.
        // Capture api now while the token is still in the store.
        _realtimeRetryCount = 0;
        teardownRealtimeMode(getApi());
        global.AppConfig.clearSession();
        formPersist.clearAll();
        profileEditMode = false;
        closeDrawer();
        store.setState({
          config: Object.assign({}, store.getState().config, { token: "", userId: "" }),
          view: "account",
          queues: [], conflicts: [], hosts: [], isVip: false, isAdmin: false, authMode: "signin", pendingConfirmation: null, profile: null, snapshots: {}, openLobbyQrs: {}, lobbyInfoOpen: {}, adminBosses: [], adminEditingId: null, syncCursor: null, managingLobby: null, lobbyQueues: [], realtimeMode: 'polling', realtimeRetrying: false
        });
        setTimeout(function () { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, 0);
        showToast("You've been signed out.", "info");
        return;
      }

      // Copy deep link
      var copyBtn = e.target.closest("[data-copy-deeplink]");
      if (copyBtn) {
        var url = copyBtn.getAttribute("data-copy-deeplink");
        if (url && navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            showToast("Copied!", "success", 2000);
          });
        }
        return;
      }

      // Copy support info
      var supportCopy = e.target.closest("[data-copy-value]");
      if (supportCopy) {
        var val = supportCopy.getAttribute("data-copy-value");
        if (val && navigator.clipboard) {
          navigator.clipboard.writeText(val).then(function () {
            showToast("Copied!", "success", 2000);
          });
        }
        return;
      }
    });

    // Friend code auto-format: spaces every 4 digits as user types
    wrap.addEventListener("input", function (e) {
      var fcInput = e.target.closest("#profileFriendCode");
      if (fcInput) {
        var digits = fcInput.value.replace(/\D/g, "").substring(0, AppConstants.FRIEND_CODE_LENGTH);
        var groups = digits.match(new RegExp('.{1,' + AppConstants.FRIEND_CODE_BLOCK + '}', 'g'));
        fcInput.value = groups ? groups.join(" ") : digits;
        formPersist.save('profileForm', 'profileFriendCode', fcInput.value);
        return;
      }

      var profileInput = e.target.closest('#profileIGN, #profileLevel');
      if (profileInput) {
        formPersist.save('profileForm', profileInput.id, profileInput.value);
        return;
      }

      var profileSelect = e.target.closest('#profileTeam');
      if (profileSelect) {
        formPersist.save('profileForm', 'profileTeam', profileSelect.value);
        var preview = document.getElementById('teamPreview');
        if (preview) {
          preview.className = 'team-select-preview' + (profileSelect.value ? ' team-' + profileSelect.value : '');
        }
        profileSelect.className = 'form-select' + (profileSelect.value ? ' team-' + profileSelect.value : '');
        return;
      }

      var authEmailInput = e.target.closest('#authEmail');
      if (authEmailInput) {
        formPersist.save('authForm', 'authEmail', authEmailInput.value);
      }
    });

    wrap.addEventListener("submit", function (e) {
      // Profile form
      var profileForm = e.target.closest("#profileForm");
      if (profileForm) {
        e.preventDefault();
        if (!ensureAuth()) return;
        var ignVal = (qs("profileIGN").value || "").trim();
        var fcVal = (qs("profileFriendCode").value || "").replace(/\D/g, "");
        var teamVal = qs("profileTeam") ? qs("profileTeam").value : "";
        var levelVal = qs("profileLevel") ? parseInt(qs("profileLevel").value, 10) : null;
        if (fcVal && fcVal.length !== AppConstants.FRIEND_CODE_LENGTH) {
          showToast("Friend code must be exactly " + AppConstants.FRIEND_CODE_LENGTH + " digits", "error");
          return;
        }
        if (levelVal !== null && (isNaN(levelVal) || levelVal < 1 || levelVal > 50)) levelVal = null;
        setLoading(true);
        var api = getApi();
        var payload = { in_game_name: ignVal, friend_code: fcVal || null, team: teamVal || null, trainer_level: levelVal };
        api.updateMyProfile(store.getState().config.userId, payload)
          .then(function (rows) {
            var updated = Array.isArray(rows) && rows.length > 0 ? rows[0] : payload;
            profileEditMode = false;
            formPersist.save('app', 'profileEditMode', 'false');
            formPersist.clear('profileForm');
            store.setState({ profile: Object.assign({}, store.getState().profile || {}, updated) });
            render(store.getState());
            SessionAudit.track('account', 'account.profile_update', null, false);
            showToast("Profile saved!", "success");
          })
          .catch(function (err) {
            if (err && err.status === 401) { handleSessionExpiry(); return; }
            showToast("Save failed: " + err.message, "error");
          })
          .finally(function () { setLoading(false); });
        return;
      }

      // Auth form
      var form = e.target.closest("#authForm");
      if (!form) return;
      e.preventDefault();
      var mode = form.getAttribute("data-mode") || "signin";
      var email = qs("authEmail").value.trim();
      var password = qs("authPassword").value;
      if (!email || !password) { setMessage("Email and password are required", "error"); return; }
      if (mode === "signup") {
        var confirm = qs("authConfirm") ? qs("authConfirm").value : "";
        if (!confirm) { setMessage("Please confirm your password", "error"); return; }
        if (password !== confirm) { setMessage("Passwords do not match", "error"); return; }
        if (password.length < 6) { setMessage("Password must be at least 6 characters", "error"); return; }
      }
      setLoading(true);
      var api = getApi();
      console.log('[Auth] ' + mode + ' attempt for:', email);
      var action = mode === "signup" ? api.signUp(email, password) : api.signIn(email, password);
      Promise.resolve(action).then(function (res) {
        console.log('[Auth] Response — access_token:', !!(res && res.access_token), '| id:', res && res.id, '| confirmation_sent_at:', res && res.confirmation_sent_at);
        // Supabase sign-up with email confirmation ON returns user without access_token
        if (mode === "signup" && res && !res.access_token && !res.session && (res.id || res.email || res.confirmation_sent_at)) {
          console.log('[Auth] Confirmation email sent — confirmation_sent_at:', res.confirmation_sent_at, '| user id:', res.id);
          showToast("Check your inbox to confirm your email, then sign in.", "success", 12000);
          store.setState({ pendingConfirmation: email });
          // Switch to sign-in tab
          var tabSignIn = wrap.querySelector('[data-auth-tab="signin"]');
          if (tabSignIn) tabSignIn.click();
          return;
        }
        var token = res && (res.access_token || (res.session && res.session.access_token));
        var user = res && (res.user || (res.session && res.session.user));
        if (!token || !user || !user.id) throw new Error("Unexpected response — no session returned. Please try again.");
        console.log('[Auth] Signed in — userId:', user.id);
        var cfg = Object.assign({}, store.getState().config, { token: token, userId: user.id });
        global.AppConfig.saveSession({ token: token, userId: user.id });
        formPersist.clear('authForm');
        store.setState({ config: cfg, authMode: "signin", pendingConfirmation: null });
        showToast(mode === "signup" ? "Account created! Welcome aboard." : "You're signed in. Welcome back!", "success");
        switchView("home");
        refreshData().then(function () {
          if (store.getState().realtimeMode === 'polling') initRealtimeMode(getApi());
        });
        SessionAudit.resumeOrOpen(getApi, store.getState.bind(store)).then(function () {
          SessionAudit.track('session', 'session.opened', { auth_mode: store.getState().authMode }, true);
        });
        // Deferred audit config apply — wait for appConfig to arrive from first refreshData()
        var _auditConfigApplied = false;
        var _unsubAuditConfig = store.subscribe(function (state) {
          if (_auditConfigApplied || !state.appConfig || !state.appConfig.audit_config) return;
          _auditConfigApplied = true;
          SessionAudit.applyConfig(state.appConfig.audit_config);
          if (_unsubAuditConfig) _unsubAuditConfig();
        });
      }).catch(function (err) {
        console.error('[Auth] ' + mode + ' failed:', err.message, err);
        setMessage((mode === "signup" ? "Sign up failed: " : "Sign in failed: ") + err.message, "error");
      }).finally(function () { setLoading(false); });
    });
  }

  function initHomeActions() {
    qs("bossSearch").addEventListener("input", function (e) {
      store.setState({ searchTerm: e.target.value || "" });
      renderHomeView(store.getState());
    });

    qs("activeRaids").addEventListener("click", function (e) {
      var target = e.target.closest("[data-boss-toggle]") || e.target.closest("[data-join-boss]") || e.target.closest("[data-join-vip]") || e.target.closest("[data-join-vip-direct]");
      if (!target) return;

      var vipDirect = target.getAttribute('data-join-vip-direct');
      if (vipDirect) {
        if (!ensureAuth()) return;
        var directApi = getApi();
        setLoading(true);
        directApi.joinBossQueue(vipDirect, 'Joined VIP queue')
          .then(function () {
            SessionAudit.track('queue', 'queue.join_boss', { boss_id: vipDirect, is_vip: true, join_type: 'vip_direct' }, true);
            showToast('You\'ve joined the VIP priority queue!', 'success');
            return refreshData().then(function () { switchView('queues'); });
          })
          .catch(function (err) {
            if (err && err.status === 401) { handleSessionExpiry(); return; }
            setMessage('Join failed: ' + err.message, 'error');
          })
          .finally(function () { setLoading(false); });
        return;
      }

      var bossToggle = target.getAttribute("data-boss-toggle");
      if (bossToggle) {
        var area = qs("join-" + bossToggle);
        if (!area) return;
        var state = store.getState();
        var opts = '<div class="join-options">';
        opts += '<button class="btn-join-std" data-join-boss="' + AppHtml.escapeHtml(bossToggle) + '">Join Standard Queue</button>';
        if (state.isVip) {
          opts += '<button class="btn-join-vip" data-join-vip="' + AppHtml.escapeHtml(bossToggle) + '">' + AppHtml.icon("crown", 16) + ' Join VIP Priority Queue</button>';
        } else {
          opts += '<p class="vip-hint">Subscribe to VIP for priority queuing</p>';
        }
        opts += '</div>';
        area.innerHTML = opts;
        return;
      }

      var joinBoss = target.getAttribute("data-join-boss") || target.getAttribute("data-join-vip");
      if (!joinBoss) return;
      if (!ensureAuth()) return;

      var useVip = !!target.getAttribute("data-join-vip");
      var api = getApi();
      setLoading(true);
      api.joinBossQueue(joinBoss, useVip ? "Joined VIP queue" : "Joined queue")
        .then(function () {
          showToast("You've joined the queue!", "success");
          SessionAudit.track('queue', 'queue.join_boss', { boss_id: joinBoss, is_vip: useVip }, true);
          return refreshData().then(function () {
            switchView("queues");
          });
        })
        .catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          _trackApiError(err, 'initQueueActions');
          setMessage("Join failed: " + err.message, "error");
        })
        .finally(function () { setLoading(false); });
    });
  }

  function initModalOverlay() {
    var overlay = qs('modalOverlay');
    if (!overlay) return;

    overlay.addEventListener('click', function (e) {
      var cancelNo = e.target.closest('[data-cancel-raid-no]');
      if (cancelNo) {
        store.setState({ hostCancelConfirm: null });
        render(store.getState());
        return;
      }

      var cancelYes = e.target.closest('[data-cancel-raid-yes]');
      if (cancelYes) {
        var raidId = cancelYes.getAttribute('data-cancel-raid-yes');
        store.setState({ hostCancelConfirm: null });
        render(store.getState());
        if (!raidId) return;
        var api = getApi();
        setLoading(true);
        SessionAudit.track('host', 'host.cancel_raid', { raid_id: raidId }, true);
        api.cancelRaid(raidId).then(function () {
          showToast('Raid cancelled.', 'success');
          store.setState({ managingLobby: null, lobbyQueues: [], openLobbyQrs: {}, lobbyInfoOpen: {}, suppressAutoOpenLobby: true });
          switchView('queues');
          return refreshData();
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          showToast('Cancel raid failed: ' + err.message, 'error');
          return refreshData().catch(function () {});
        }).finally(function () { setLoading(false); });
        return;
      }

      // Clicking the backdrop (overlay itself, not the card) dismisses
      if (e.target === overlay) {
        store.setState({ hostCancelConfirm: null });
        render(store.getState());
      }
    });
  }

  function initHostForm() {
    var range = qs("hostSpots");
    var value = qs("hostSpotsValue");
    var friendCode = qs("hostFriendCode");
    var submitBtn = qs("hostSubmitBtn");
    var bossSelect = qs('hostBossSelect');

    range.addEventListener("input", function () {
      value.textContent = range.value;
      formPersist.save('hostForm', 'hostSpots', range.value);
    });

    function updateSubmitState() {
      var code = (friendCode.value || "").replace(/[^0-9]/g, "");
      submitBtn.disabled = code.length < AppConstants.FRIEND_CODE_LENGTH;
    }
    friendCode.addEventListener("input", function () {
      friendCode.value = friendCode.value.replace(/[^0-9 ]/g, "");
      formPersist.save('hostForm', 'hostFriendCode', friendCode.value);
      updateSubmitState();
    });
    if (bossSelect) {
      bossSelect.addEventListener('change', function () {
        formPersist.save('hostForm', 'hostBossSelect', this.value);
      });
    }
    var hostContent = qs('hostContent');
    if (hostContent) {
      hostContent.addEventListener('click', function (e) {
        // Handle dismiss button on the success card
        var dismissBtn = e.target.closest('[data-dismiss-host-success]');
        if (dismissBtn) {
          e.preventDefault();
          if (hostSuccessTimer) { clearTimeout(hostSuccessTimer); hostSuccessTimer = null; }
          store.setState({ hostSuccess: false });
          render(store.getState());
          return;
        }

        // Handle any [data-view] link/button (including the My Queues link)
        var navTarget = e.target.closest('[data-view]');
        if (!navTarget) return;
        e.preventDefault();
        if (store.getState().hostSuccess) {
          if (hostSuccessTimer) { clearTimeout(hostSuccessTimer); hostSuccessTimer = null; }
          store.setState({ hostSuccess: false });
        }
        switchView(navTarget.getAttribute('data-view'));
      });
    }
    updateSubmitState();
    applyHostCapacityState(store.getState().isVip);

    // Auto-fill friend code from profile if field is empty
    store.subscribe(function (state) {
      var prof = state.profile;
      if (prof && prof.friend_code && !friendCode.value) {
        friendCode.value = prof.friend_code;
        updateSubmitState();
      }
      applyHostCapacityState(state.isVip);
    });

    var savedFc = formPersist.load('hostForm', 'hostFriendCode');
    var savedSpots = formPersist.load('hostForm', 'hostSpots');
    var savedBoss = formPersist.load('hostForm', 'hostBossSelect');
    if (savedFc && !friendCode.value) {
      friendCode.value = savedFc;
      updateSubmitState();
    }
    if (savedSpots && range) {
      range.value = savedSpots;
      value.textContent = savedSpots;
    }
    if (savedBoss && bossSelect && bossSelect.querySelector('[value="' + savedBoss + '"]')) {
      bossSelect.value = savedBoss;
    }

    qs("hostForm").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!ensureAuth()) return;
      if (submitBtn.disabled) return;
      var bossId = qs("hostBossSelect").value;
      var code = friendCode.value.replace(/[^0-9 ]/g, "").trim();
      var spots = parseInt(range.value, 10);
      if (!bossId) { setMessage("Pick a raid boss first", "error"); return; }
      if (code.replace(/ /g, "").length < 12) { setMessage("Trainer code must be 12 digits", "error"); return; }

      submitBtn.disabled = true;
      setLoading(true);
      var now = new Date();
      var end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      getApi().createRaid({
        hostUserId: store.getState().config.userId,
        raidBossId: bossId, friendCode: code,
        locationName: "Remote Raid",
        startTime: now.toISOString(), endTime: end.toISOString(),
        capacity: spots
      }).then(function () {
        SessionAudit.track('host', 'host.create_raid', { boss_id: bossId, capacity: spots }, true);
        formPersist.clear('hostForm');
        submitBtn.disabled = false;
        store.setState({ hostSuccess: true });
        render(store.getState());
        if (hostSuccessTimer) {
          clearTimeout(hostSuccessTimer);
        }
        hostSuccessTimer = setTimeout(function () {
          var current = store.getState();
          if (current.hostSuccess) {
            store.setState({ hostSuccess: false });
            render(store.getState());
            SessionAudit.track('host', 'host.success_auto_dismissed', {}, false);
          }
          hostSuccessTimer = null;
        }, 10000);
        return refreshData();
      }).catch(function (err) {
        if (err && err.status === 401) { handleSessionExpiry(); return; }
        _trackApiError(err, 'initHostForm');
        setMessage("Host failed: " + err.message, "error");
        submitBtn.disabled = false;
      }).finally(function () { setLoading(false); });
    });
  }

  function initQueueActions() {
    qs("queuesContent").addEventListener("click", function (e) {
      var origin = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
      if (!origin || typeof origin.closest !== "function") return;
      var target = origin.closest("[data-leave]") || origin.closest("[data-keep]") || origin.closest("[data-view]") || origin.closest("[data-friend-sent]") || origin.closest("[data-finish-raiding]") || origin.closest("[data-manage-lobby]") || origin.closest("[data-close-lobby]") || origin.closest("[data-start-raid]") || origin.closest("[data-host-finish]") || origin.closest("[data-copy-fc]") || origin.closest("[data-toggle-lobby-qr]") || origin.closest("[data-toggle-all-lobby-qrs]") || origin.closest("[data-toggle-lobby-info]") || origin.closest("[data-rejoin-boss]") || origin.closest("[data-delete-queue]") || origin.closest("[data-delete-lobby]") || origin.closest("[data-dismiss-host-success]");
      if (!target) return;

      // Handle "Find Raids" / "Host Raid" nav buttons in empty state
      var nav = target.getAttribute("data-view");
      if (nav) { switchView(nav); return; }

      // Copy friend code — no auth required
      var copyFc = target.getAttribute("data-copy-fc");
      if (copyFc) {
        navigator.clipboard.writeText(copyFc).then(function () {
          showToast("Friend code copied!", "success");
        }).catch(function () {
          showToast("Copy failed", "error");
        });
        return;
      }

      if (!ensureAuth()) return;
      var api = getApi();

      var toggleAllLobbyQrs = target && target.getAttribute("data-toggle-all-lobby-qrs");
      if (toggleAllLobbyQrs) {
        var lqAll = store.getState().lobbyQueues || [];
        var eligibleIds = lqAll.filter(function (e) { return !!e.friend_code; }).map(function (e) { return e.id; });
        var currentOpen = store.getState().openLobbyQrs || {};
        var anyOpen = eligibleIds.some(function (id) { return currentOpen[id]; });
        var nextQrs = {};
        if (!anyOpen) {
          eligibleIds.forEach(function (id) { nextQrs[id] = true; });
        }
        store.setState({ openLobbyQrs: nextQrs });
        render(store.getState());
        return;
      }

      var toggleLobbyQr = target.getAttribute("data-toggle-lobby-qr");
      if (toggleLobbyQr) {
        var openLobbyQrs = Object.assign({}, store.getState().openLobbyQrs || {});
        openLobbyQrs[toggleLobbyQr] = !openLobbyQrs[toggleLobbyQr];
        if (!openLobbyQrs[toggleLobbyQr]) delete openLobbyQrs[toggleLobbyQr];
        store.setState({ openLobbyQrs: openLobbyQrs });
        render(store.getState());
        return;
      }

      var toggleLobbyInfo = target.getAttribute("data-toggle-lobby-info");
      if (toggleLobbyInfo) {
        var currentInfo = Object.assign({}, store.getState().lobbyInfoOpen || {});
        currentInfo[toggleLobbyInfo] = !currentInfo[toggleLobbyInfo];
        if (!currentInfo[toggleLobbyInfo]) delete currentInfo[toggleLobbyInfo];
        store.setState({ lobbyInfoOpen: currentInfo });
        render(store.getState());
        return;
      }

      // Host lobby: manage / close / start / finish
      var manageLobby = target.getAttribute("data-manage-lobby");
      if (manageLobby) {
        openManageLobby(manageLobby, api);
        return;
      }

      var closeLobby = target.getAttribute("data-close-lobby");
      if (closeLobby) {
        var nextCursor = normalizeSyncCursor(store.getState().syncCursor);
        nextCursor.managingLobbyVersion = null;
        store.setState({ managingLobby: null, lobbyQueues: [], openLobbyQrs: {}, lobbyInfoOpen: {}, syncCursor: nextCursor });
        SessionAudit.track('host', 'host.manage_lobby_close', { raid_id: closeLobby }, false);
        render(store.getState());
        return;
      }

      var startRaid = target.getAttribute("data-start-raid");
      if (startRaid) {
        setLoading(true);
        SessionAudit.track('host', 'host.start_raid', { raid_id: startRaid }, true);
        api.startRaid(startRaid).then(function () {
          showToast("Raid started! Go catch 'em!", "success");
          return api.listRaidQueue(startRaid);
        }).then(function (rows) {
          store.setState({ lobbyQueues: rows || [] });
          return refreshData();
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          setMessage("Start raid failed: " + err.message, "error");
          return refreshData().catch(function () {});
        }).finally(function () { setLoading(false); });
        return;
      }

      var hostFinish = target.getAttribute("data-host-finish");
      if (hostFinish) {
        setLoading(true);
        SessionAudit.track('host', 'host.finish_raid', { raid_id: hostFinish }, true);
        api.hostFinishRaiding(hostFinish).then(function () {
          showToast("Marked as done!", "success");
          return api.listRaidQueue(hostFinish);
        }).then(function (rows) {
          store.setState({ lobbyQueues: rows || [] });
          render(store.getState());
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          setMessage("Finish failed: " + err.message, "error");
          return refreshData().catch(function () {});
        }).finally(function () { setLoading(false); });
        return;
      }

      var deleteLobby = target.getAttribute("data-delete-lobby");
      if (deleteLobby) {
        switchView('queues');
        store.setState({ hostCancelConfirm: deleteLobby });
        render(store.getState());
        return;
      }

      // Done-state actions
      var rejoinBossId = target.getAttribute("data-rejoin-boss");
      var cleanupQueueId = target.getAttribute("data-cleanup-queue");
      var deleteQueueId = target.getAttribute("data-delete-queue");

      if (rejoinBossId) {
        setLoading(true);
        SessionAudit.track('queue', 'queue.rejoin_boss', { boss_id: rejoinBossId }, true);
        var cleanupFirst = cleanupQueueId
          ? api.deleteQueueEntry(cleanupQueueId).catch(function () {})
          : Promise.resolve();
        cleanupFirst.then(function () {
          return api.joinBossQueue(rejoinBossId, "Rejoined from web app");
        }).then(function () {
          showToast("Joined the queue!", "success");
          return refreshData().then(function () { switchView("queues"); });
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          setMessage("Requeue failed: " + err.message, "error");
          return refreshData().catch(function () {});
        }).finally(function () { setLoading(false); });
        return;
      }

      if (deleteQueueId) {
        setLoading(true);
        SessionAudit.track('queue', 'queue.delete_done', { queue_id: deleteQueueId }, false);
        api.deleteQueueEntry(deleteQueueId).then(function () {
          return refreshData();
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          setMessage("Delete failed: " + err.message, "error");
        }).finally(function () { setLoading(false); });
        return;
      }

      // Joiner actions
      var leaveId = target.getAttribute("data-leave");
      var keepId = target.getAttribute("data-keep");
      var friendSentId = target.getAttribute("data-friend-sent");
      var finishRaidingId = target.getAttribute("data-finish-raiding");
      setLoading(true);

      if (finishRaidingId) {
        SessionAudit.track('queue', 'queue.finish', { queue_id: finishRaidingId }, true);
        api.finishRaiding(finishRaidingId).then(function () {
          showToast("Raid complete! GG", "success");
          return refreshData();
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          setMessage("Finish raiding failed: " + err.message, "error");
          return refreshData().catch(function () {});
        }).finally(function () { setLoading(false); });
        return;
      }

      if (friendSentId) {
        SessionAudit.track('queue', 'queue.confirm_invite', { queue_id: friendSentId }, true);
        api.confirmInvite(friendSentId).then(function () {
          showToast("Friend request marked as sent. Waiting for the host to start.", "success");
          return refreshData();
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          setMessage("Confirm failed: " + err.message, "error");
          return refreshData().catch(function () {});
        }).finally(function () { setLoading(false); });
        return;
      }

      if (leaveId) {
        var _leaveQ = (store.getState().queues || []).find(function (q) { return q.id === leaveId; });
        SessionAudit.track('queue', 'queue.leave', {
          queue_id: leaveId, status: _leaveQ && _leaveQ.status, raid_id: _leaveQ && _leaveQ.raid_id
        }, true);
        api.leaveQueue(leaveId, "Left queue").then(function () {
          setMessage("Queue left", "ok"); return refreshData();
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          setMessage("Leave failed: " + err.message, "error");
        }).finally(function () { setLoading(false); });
        return;
      }

      if (keepId) {
        var conflict = store.getState().conflicts.find(function (c) {
          return c.leftQueueId === keepId || c.rightQueueId === keepId;
        });
        if (!conflict) { setLoading(false); return; }
        var toLeave = conflict.leftQueueId === keepId ? conflict.rightQueueId : conflict.leftQueueId;
        SessionAudit.track('queue', 'queue.keep', { kept: keepId, leaving: toLeave }, true);
        api.leaveQueue(toLeave, "Left due to conflict").then(function () {
          setMessage("Conflict resolved", "ok"); return refreshData();
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          setMessage("Conflict action failed: " + err.message, "error");
        }).finally(function () { setLoading(false); });
      }
    });
  }

  function initVipActions() {
    qs("vipContent").addEventListener("click", function (e) {
      var target = e.target.closest("#vipUpgradeBtn") || e.target.closest("#vipDowngradeBtn");
      if (!target) return;
      if (!ensureAuth()) return;
      var state = store.getState();
      var api = getApi();
      setLoading(true);
      var action = target.id === "vipUpgradeBtn"
        ? api.activateVip(state.config.userId)
        : api.deactivateVip(state.config.userId);
      Promise.resolve(action).then(function () {
        if (target.id === 'vipUpgradeBtn') {
          SessionAudit.track('account', 'account.vip_activate', null, true);
        } else {
          SessionAudit.track('account', 'account.vip_deactivate', null, true);
        }
        setMessage(target.id === "vipUpgradeBtn" ? "VIP activated" : "VIP cancelled", "ok");
        return refreshData();
      }).catch(function (err) {
        if (err && err.status === 401) { handleSessionExpiry(); return; }
        setMessage("VIP update failed: " + err.message, "error");
      }).finally(function () { setLoading(false); });
    });
  }

  function initAdminActions() {
    var wrap = qs("adminContent");
    if (!wrap) return;

    wrap.addEventListener("click", function (e) {
      // Admin tab switching
      var tabBtn = e.target.closest('[data-admin-tab]');
      if (tabBtn) {
        store.setState({ adminTab: tabBtn.dataset.adminTab });
        return;
      }

      // Save realtime slots (App Settings card)
      if (e.target.id === 'saveRealtimeSlotsBtn') {
        var input = document.getElementById('realtimeSlotsInput');
        var slots = parseInt(input ? input.value : '', 10);
        if (isNaN(slots) || slots < 0) {
          showToast('Realtime slots must be 0 or greater.', 'error');
          return;
        }
        var api = getApi();
        api.adminUpdateRealtimeSlots(slots)
          .then(function () { showToast('Realtime slots updated.', 'success'); return refreshData(); })
          .catch(function (e) { showToast('Failed to update: ' + (e.message || 'Unknown error'), 'error'); });
        return;
      }

      // Save audit config (Audit tab)
      if (e.target.id === 'saveAuditConfigBtn') {
        var auditEnabled = document.getElementById('auditEnabledToggle');
        var auditFlush = document.getElementById('auditFlushMs');
        var auditBuffer = document.getElementById('auditBufferMax');
        var flushVal = parseInt(auditFlush ? auditFlush.value : '', 10);
        var bufVal = parseInt(auditBuffer ? auditBuffer.value : '', 10);
        if (isNaN(flushVal) || flushVal < 1000) { showToast('Flush interval must be at least 1000 ms.', 'error'); return; }
        if (isNaN(bufVal) || bufVal < 1) { showToast('Buffer max must be at least 1.', 'error'); return; }
        var catCheckboxes = wrap.querySelectorAll('[name^="audit_cat_"]');
        var categories = {};
        catCheckboxes.forEach(function (cb) {
          categories[cb.value] = cb.checked;
        });
        // session and error are always on
        categories.session = true;
        categories.error = true;
        var newConfig = {
          enabled: auditEnabled ? auditEnabled.checked : true,
          flush_interval_ms: flushVal,
          buffer_max: bufVal,
          categories: categories
        };
        var api = getApi();
        api.adminUpdateAuditConfig(newConfig)
          .then(function () { showToast('Audit config saved.', 'success'); return refreshData(); })
          .catch(function (e) { showToast('Failed to save audit config: ' + (e.message || 'Unknown error'), 'error'); });
        return;
      }
      // Toggle add form
      var toggleBtn = e.target.closest(".admin-toggle-add");
      if (toggleBtn) {
        var current = store.getState().adminShowAddForm;
        store.setState({ adminShowAddForm: !current, adminEditingId: null });
        render(store.getState());
        return;
      }
      // Close add form
      var closeBtn = e.target.closest(".admin-close-add");
      if (closeBtn) {
        store.setState({ adminShowAddForm: false });
        render(store.getState());
        return;
      }
      // Cancel button inside form
      var cancelFormBtn = e.target.closest(".admin-form-cancel");
      if (cancelFormBtn) {
        var form = cancelFormBtn.closest(".admin-boss-form");
        var mode = form ? form.getAttribute("data-mode") : "";
        if (mode === "edit") {
          store.setState({ adminEditingId: null });
        } else {
          store.setState({ adminShowAddForm: false });
        }
        render(store.getState());
        return;
      }
      // Edit button
      var editBtn = e.target.closest(".admin-edit-boss");
      if (editBtn) {
        var bossId = editBtn.getAttribute("data-boss-id");
        store.setState({ adminEditingId: bossId, adminShowAddForm: false });
        render(store.getState());
        return;
      }
      // Cancel edit (X button on card)
      var cancelBtn = e.target.closest(".admin-cancel-edit");
      if (cancelBtn) {
        store.setState({ adminEditingId: null });
        render(store.getState());
        return;
      }

      // Purge audit trail for a single user
      if (e.target.closest('#purgeUserAuditBtn')) {
        var email = (qs('purgeAuditEmail').value || '').trim().toLowerCase();
        if (!email) return;
        if (!confirm('Delete all audit trail records for ' + email + '? This cannot be undone.')) return;
        var purgeUserBtn = qs('purgeUserAuditBtn');
        var purgeUserOrig = purgeUserBtn.textContent;
        purgeUserBtn.disabled = true;
        purgeUserBtn.textContent = 'Purging...';
        var api = getApi();
        api.adminPurgeAuditTrailByEmail(email)
          .then(function (result) {
            showToast('Purged ' + result.sessions_deleted + ' sessions for ' + email, 'success');
            var accountStats = store.getState().accountStats;
            if (accountStats && accountStats.email && accountStats.email.toLowerCase() === email) {
              showToast('Your current session audit will restart on next sign-in.', 'info');
            }
          })
          .catch(function (err) {
            showToast(err.message || 'Purge failed', 'error');
          })
          .finally(function () {
            purgeUserBtn.disabled = false;
            purgeUserBtn.textContent = purgeUserOrig;
          });
        return;
      }

      // Purge entire audit trail for all users
      if (e.target.closest('#purgeAllAuditBtn')) {
        if (!confirm('Delete the ENTIRE audit trail for ALL users? This cannot be undone.')) return;
        var purgeAllBtn = qs('purgeAllAuditBtn');
        var purgeAllOrig = purgeAllBtn.textContent;
        purgeAllBtn.disabled = true;
        purgeAllBtn.textContent = 'Purging...';
        var api = getApi();
        api.adminPurgeAllAuditTrail()
          .then(function (result) {
            showToast('Purged ' + result.sessions_deleted + ' sessions (all users)', 'success');
            showToast('Your current session audit will restart on next sign-in.', 'info');
          })
          .catch(function (err) {
            showToast(err.message || 'Purge failed', 'error');
          })
          .finally(function () {
            purgeAllBtn.disabled = false;
            purgeAllBtn.textContent = purgeAllOrig;
          });
        return;
      }
    });

    wrap.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'purgeAuditEmail') {
        var purgeBtn = qs('purgeUserAuditBtn');
        if (purgeBtn) {
          purgeBtn.disabled = (e.target.value || '').trim() === '';
        }
      }
    });

    wrap.addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target.closest(".admin-boss-form");
      if (!form) return;

      var mode = form.getAttribute("data-mode");
      var bossId = form.getAttribute("data-boss-id");
      var state = store.getState();
      var api = getApi();

      var name = (form.querySelector("[name=name]").value || "").trim();
      if (!name) { showToast("Name is required.", "error"); return; }

      var tierVal = form.querySelector("[name=tier]").value;
      var pokemonIdVal = form.querySelector("[name=pokemon_id]").value;
      var cpVal = form.querySelector("[name=cp]").value;
      var typesRaw = (form.querySelector("[name=types]").value || "").trim();
      var imageUrl = (form.querySelector("[name=image_url]").value || "").trim();
      var fromDate = (form.querySelector("[name=available_from_date]").value || "").trim();
      var fromTime = (form.querySelector("[name=available_from_time]").value || "").trim();
      var untilDate = (form.querySelector("[name=available_until_date]").value || "").trim();
      var untilTime = (form.querySelector("[name=available_until_time]").value || "").trim();
      var availableFrom = fromDate ? fromDate + "T" + (fromTime || "00:00") : "";
      var availableUntil = untilDate ? untilDate + "T" + (untilTime || "00:00") : "";
      var isVisible = form.querySelector("[name=is_visible]").checked;

      var types = typesRaw ? typesRaw.split(",").map(function (t) { return t.trim(); }).filter(Boolean) : [];

      var data = {
        name: name,
        tier: tierVal ? parseInt(tierVal, 10) : null,
        pokemonId: pokemonIdVal ? parseInt(pokemonIdVal, 10) : null,
        cp: cpVal ? parseInt(cpVal, 10) : null,
        imageUrl: imageUrl || null,
        types: types,
        availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
        isVisible: isVisible
      };

      setLoading(true);
      var action = mode === "edit"
        ? api.adminUpdateBoss(bossId, data)
        : api.adminCreateBoss(data);

      Promise.resolve(action).then(function () {
        if (mode === 'edit') {
          SessionAudit.track('admin', 'admin.boss_update', { boss_id: bossId }, false);
        } else {
          SessionAudit.track('admin', 'admin.boss_create', { name: name }, false);
        }
        showToast(mode === "edit" ? "Boss updated." : "Boss added.", "success");
        store.setState({ adminEditingId: null, adminShowAddForm: false });
        return refreshData();
      }).catch(function (err) {
        if (err && err.status === 401) { handleSessionExpiry(); return; }
        showToast("Failed: " + err.message, "error");
      }).finally(function () { setLoading(false); });
    });
  }

  function openDrawer() {
    var overlay = qs("drawerOverlay");
    var drawer = qs("drawer");
    if (overlay) overlay.classList.add("open");
    if (drawer) { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); }
  }

  function closeDrawer() {
    var overlay = qs("drawerOverlay");
    var drawer = qs("drawer");
    if (overlay) overlay.classList.remove("open");
    if (drawer) { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); }
  }

  function initNavigation() {
    // Navbar links (bottom bar — only the non-drawer views)
    qs("navLinks").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-view]");
      if (!btn) return;
      switchView(btn.getAttribute("data-view"));
    });

    // Hamburger: event delegation — any element with data-open-drawer opens the drawer
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-open-drawer]")) { openDrawer(); }
    });

    // Drawer close button
    var closeBtn = qs("drawerCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", function () { closeDrawer(); });

    // Drawer overlay click closes drawer
    var overlay = qs("drawerOverlay");
    if (overlay) overlay.addEventListener("click", function () { closeDrawer(); });

    // Drawer nav links
    var drawerNav = qs("drawerNav");
    if (drawerNav) drawerNav.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-view]");
      if (!btn) return;
      closeDrawer();
      switchView(btn.getAttribute("data-view"));
    });

    // Logo click
    var logo = document.querySelector(".navbar-logo");
    if (logo) logo.addEventListener("click", function () { switchView("home"); });
  }

  /* ═══════════════════════════════════════════════════════════════
     AUTH CALLBACK — handle email confirmation redirect
     ═══════════════════════════════════════════════════════════════ */
  function handleAuthCallback() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    console.log('[AuthCallback] URL hash detected — processing email confirmation');
    var params = {};
    hash.substring(1).split("&").forEach(function (pair) {
      var parts = pair.split("=");
      if (parts.length === 2) params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    });
    var token = params.access_token;
    var type = params.type;
    console.log('[AuthCallback] Parsed params — type:', type, '| token present:', !!token);
    if (!token) {
      console.log('[AuthCallback] No access_token in hash — skipping');
      return;
    }
    // Clear the hash from the URL
    history.replaceState(null, "", window.location.pathname + window.location.search);
    console.log('[AuthCallback] Cleared hash from URL');

    // Decode the JWT to get user id
    try {
      var payload = JSON.parse(atob(token.split(".")[1]));
      var userId = payload.sub;
      console.log('[AuthCallback] JWT decoded — userId:', userId, '| exp:', new Date(payload.exp * 1000).toISOString());
      if (!userId) throw new Error("No user ID in token");
      global.AppConfig.saveSession({ token: token, userId: userId });
      var cfg = Object.assign({}, store.getState().config, { token: token, userId: userId });
      store.setState({ config: cfg, authMode: "signin", pendingConfirmation: null });
      console.log('[AuthCallback] Session saved — auto sign-in complete');
      showToast("Email confirmed — you're signed in!", "success");
      switchView("home");
      refreshData().then(function () {
        if (store.getState().realtimeMode === 'polling') initRealtimeMode(getApi());
      });
    } catch (err) {
      console.error('[AuthCallback] Token decode failed:', err.message);
      showToast("Confirmation link invalid or expired. Please sign in.", "error");
      switchView("account");
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════ */
  function safeInit(name, fn) {
    try { fn(); } catch (err) { console.error('[RaidSync] ' + name + ' failed:', err); }
  }

  function init() {
    assertGlobals();

    store.subscribe(function (state) {
      try { render(state); } catch (err) { console.error('[RaidSync] render failed:', err); }
    });
    safeInit('initAccountActions', initAccountActions);
    safeInit('initNavigation', initNavigation);
    safeInit('initHomeActions', initHomeActions);
    safeInit('initHostForm', initHostForm);
    safeInit('initModalOverlay', initModalOverlay);
    safeInit('initQueueActions', initQueueActions);
    safeInit('initVipActions', initVipActions);
    safeInit('initAdminActions', initAdminActions);

    // Handle email confirmation callback (Supabase redirects with hash params)
    var hadAuthCallback = !!window.location.hash;
    handleAuthCallback();

    var restorableViews = ['home', 'host', 'queues', 'vip', 'account'];
    if (isAuthed() && !hadAuthCallback) {
      var savedView = formPersist.load('app', 'view');
      if (savedView && restorableViews.indexOf(savedView) >= 0) {
        store.setState({ view: savedView });
      }
      profileEditMode = formPersist.load('app', 'profileEditMode') === 'true';
    }

    // Handle notification click deep-link (?notify=queues)
    var notifyParam = new URLSearchParams(location.search).get('notify');
    if (notifyParam === 'queues' && isAuthed()) {
      SessionAudit.track('notif', 'notif.clicked', { target: 'queues' }, false);
      store.setState({ view: 'queues' });
      history.replaceState(null, '', location.pathname);
    }

    // Auto-redirect unauthenticated visitors to Account screen on page load
    if (!isAuthed()) {
      store.setState({ view: "account" });
    }

    // Sync footer: refresh button + auto-update relative time
    qs("syncFooter").addEventListener("click", function (e) {
      if (e.target.closest("#syncRefreshBtn")) {
        refreshData().then(function () {
          if (isAuthed() && store.getState().realtimeMode === 'polling') initRealtimeMode(getApi());
        });
      }
    });
    // Tick the "Synced Xs ago" text every 5 s without triggering a full re-render.
    // In realtime mode the main poll backs off to IDLE_MS, so the footer would otherwise
    // go stale between actual data refreshes.
    setInterval(function () { renderFooter(store.getState()); }, 5000);

    // Re-check realtime eligibility when the page is restored from bfcache (back/forward nav).
    // DOMContentLoaded / init() do NOT re-run in that case, so the old WS is dead and
    // the store may still have realtimeMode:'realtime' (stale) or 'polling' (never upgraded).
    // _recoveryInFlight guards against double-execution when visibilitychange fires first.
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return; // not a bfcache restore — normal load handled by init()
      // Anonymous browsers have no realtime slot to recover, but still refresh data on
      // bfcache restore — the snapshot could be arbitrarily old from the previous visit.
      if (!isAuthed()) return;
      if (_recoveryInFlight) return; // visibilitychange already started recovery
      _recoveryInFlight = true;
      SessionAudit.track('lifecycle', 'lifecycle.recovery_start', { trigger: 'bfcache' }, true);
      if (_recoveryWatchdog) clearTimeout(_recoveryWatchdog);
      _recoveryWatchdog = setTimeout(function () { _recoveryInFlight = false; _recoveryWatchdog = null; }, 10000);
      var api = getApi();
      var currentMode = store.getState().realtimeMode;
      if (currentMode === 'realtime') {
        // WS is dead after bfcache restore — tear down cleanly then re-init
        teardownRealtimeMode(api).then(function () {
          return refreshData();
        }).then(function () {
          if (isAuthed() && store.getState().realtimeMode === 'polling') return initRealtimeMode(api);
        }).then(function () {
          SessionAudit.track('lifecycle', 'lifecycle.recovery_complete', { mode: store.getState().realtimeMode }, true);
        }).catch(function () {}).then(function () {
          clearTimeout(_recoveryWatchdog);
          _recoveryWatchdog = null;
          _recoveryInFlight = false;
        });
      } else {
        // Was in polling mode — try to upgrade now that we have fresh context
        refreshData().then(function () {
          if (isAuthed() && store.getState().realtimeMode === 'polling') return initRealtimeMode(api);
        }).then(function () {
          SessionAudit.track('lifecycle', 'lifecycle.recovery_complete', { mode: store.getState().realtimeMode }, true);
        }).catch(function () {}).then(function () {
          clearTimeout(_recoveryWatchdog);
          _recoveryWatchdog = null;
          _recoveryInFlight = false;
        });
      }
    });

    // Recover realtime mode when user returns from another app (app-switch / screen lock).
    // On mobile the OS kills the WebSocket after ~30 s of inactivity. visibilitychange fires
    // on app-switch; pageshow fires on bfcache restore — they are separate recovery paths.
    // _hiddenAt tracks hidden duration; _recoveryInFlight prevents double-execution when
    // bfcache restore triggers both events (visibilitychange first, then pageshow).
    // _recoveryWatchdog guarantees flag reset even if teardown hangs on a dead network.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        _hiddenAt = Date.now();
        SessionAudit.track('lifecycle', 'lifecycle.visibility_hidden', {}, false);
        return;
      }
      // Became visible
      if (!isAuthed()) { _hiddenAt = null; return; }
      var elapsed = _hiddenAt != null ? (Date.now() - _hiddenAt) : 0;
      _hiddenAt = null;
      SessionAudit.track('lifecycle', 'lifecycle.visibility_visible', { elapsed_ms: elapsed }, false);
      if (elapsed < STALE_THRESHOLD_MS) return; // short switch — WS is likely still alive
      if (_recoveryInFlight) return;            // pageshow already handling this restore
      _recoveryInFlight = true;
      SessionAudit.track('lifecycle', 'lifecycle.recovery_start', { trigger: 'visibility_change', elapsed_ms: elapsed }, true);
      if (_recoveryWatchdog) clearTimeout(_recoveryWatchdog);
      _recoveryWatchdog = setTimeout(function () { _recoveryInFlight = false; _recoveryWatchdog = null; }, 10000);
      var api = getApi();
      var mode = store.getState().realtimeMode;
      var recover = (mode === 'realtime')
        ? teardownRealtimeMode(api).then(function () { return refreshData(); })
        : refreshData();
      recover.then(function () {
        if (isAuthed() && store.getState().realtimeMode === 'polling') {
          return initRealtimeMode(api);
        }
      }).then(function () {
        SessionAudit.track('lifecycle', 'lifecycle.recovery_complete', { mode: store.getState().realtimeMode }, true);
      }).catch(function () {}).then(function () {
        clearTimeout(_recoveryWatchdog);
        _recoveryWatchdog = null;
        _recoveryInFlight = false;
      });
    });

    // Release realtime slot on page unload (fire-and-forget, keepalive ensures completion)
    window.addEventListener('beforeunload', function () {
      var s = store.getState();
      if (ROLLBACK_SWITCHES.beforeUnloadClosesAuditSession && s.config && s.config.token) {
        SessionAudit.track('session', 'session.closed', { reason: 'page_close' }, false);
        SessionAudit.closeSessionKeepalive('page_close');
      }
      if (s.realtimeMode === 'realtime' && s.config && s.config.token) {
        fetch('/api/rest/v1/rpc/release_realtime_slot', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + s.config.token,
            'Content-Type': 'application/json',
          },
          body: '{}',
          keepalive: true,
        });
      }
    });

    // Lightweight sync polling: check version stamps often, refresh full state only when needed.
    var pollTimer = null;
    var lastMaintenanceAt = 0;
    var _lastPollTier = null; // track poll tier for audit change detection
    function scheduleNextPoll() {
      if (pollTimer) clearTimeout(pollTimer);
      var interval = getSyncPollInterval(store.getState());
      var _currentTier = interval === AppConstants.POLL.HOT_MS ? 'hot'
                       : interval === AppConstants.POLL.WARM_MS ? 'warm' : 'idle';
      if (_currentTier !== _lastPollTier) {
        SessionAudit.track('data', 'data.poll_tier_change',
          { from: _lastPollTier, to: _currentTier, interval_ms: interval }, false);
        _lastPollTier = _currentTier;
      }

      pollTimer = setTimeout(function () {
        var s = store.getState();
        if (!isAuthed()) {
          // Unauthenticated browsers still need periodic refreshes so boss card counters
          // (queue_length, active_hosts) stay current. Skip maintenance and cursor checks —
          // those require auth — but run a full refreshData() to re-fetch boss_queue_stats.
          refreshData().catch(function () {}).then(function () { scheduleNextPoll(); });
          return;
        }
        var api = getApi();

        var maintenanceInterval = getMaintenanceInterval(s);
        var needsMaintenance = !lastMaintenanceAt || (Date.now() - lastMaintenanceAt) >= maintenanceInterval;
        var maintenancePromise = needsMaintenance
          ? runQueueMaintenance(api, s).then(function () { lastMaintenanceAt = Date.now(); })
          : Promise.resolve();

        maintenancePromise.then(function () {
          return getQueueSyncCursor(api, store.getState().managingLobby);
        }).then(function (nextCursor) {
          if (syncCursorChanged(store.getState().syncCursor, nextCursor)) {
            if (_refreshInFlight) {
              // A refresh is already in-flight. Skip this tick; reschedule at normal interval.
              scheduleNextPoll();
              return;
            }
            return refreshData();
          }
          SessionAudit.track('data', 'data.poll_tick_no_change', {}, false);
          store.setState({ syncCursor: nextCursor });
        }).then(function () {
          updateCountdowns();
          scheduleNextPoll();
        }).catch(function (err) {
          if (err && err.status === 401) {
            handleSessionExpiry();
            return;
          }
          scheduleNextPoll();
        });
      }, interval);
    }

    function updateCountdowns() {
      var inviteWindowSeconds = (store.getState().appConfig || {}).invite_window_seconds || 60;
      var els = document.querySelectorAll(".countdown[data-invited]");
      els.forEach(function (el) {
        var invitedAt = el.getAttribute("data-invited");
        if (!invitedAt) return;
        var elapsed = Math.floor((Date.now() - new Date(invitedAt).getTime()) / 1000);
        var secsLeft = Math.max(0, inviteWindowSeconds - elapsed);
        el.textContent = secsLeft + "s";
      });

      // Tick host inactivity countdown spans
      var inactEls = document.querySelectorAll(".countdown[data-inactivity-start]");
      inactEls.forEach(function (el) {
        var startAt = el.getAttribute("data-inactivity-start");
        var timeout = parseInt(el.getAttribute("data-inactivity-timeout"), 10);
        if (!startAt || !timeout) return;
        var elapsed = Math.floor((Date.now() - new Date(startAt).getTime()) / 1000);
        el.textContent = Math.max(0, timeout - elapsed) + "s";
      });
    }

    // Tick countdowns every second (lightweight, no network)
    setInterval(updateCountdowns, 1000);

    SessionAudit.track('lifecycle', 'lifecycle.page_load', null, false);

    // Register Service Worker for background push notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function(err) {
        console.warn('[SW] Registration failed:', err);
      });
      // Handle messages from the Service Worker (e.g. notification tap on an existing window)
      navigator.serviceWorker.addEventListener('message', function(event) {
        if (!event.data) return;
        if (event.data.type === 'NOTIF_CLICK') {
          SessionAudit.track('notif', 'notif.clicked', { target: 'queues' }, false);
          if (isAuthed()) {
            store.setState({ view: 'queues' });
            render(store.getState());
          }
        }
      });
    }

    // Start the adaptive poll cycle after initial data load
    refreshData().then(function () {
      if (isAuthed()) {
        initRealtimeMode(getApi());
      }
      if (isAuthed()) {
        SessionAudit.resumeOrOpen(getApi, store.getState.bind(store));
      }
      scheduleNextPoll();
    });
    render(store.getState());
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
