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
    appConfig: null
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
    var profileEditMode = false;

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

  function switchView(view) {
    formPersist.save('app', 'view', view);
    store.setState({ view: view, hostSuccess: false });
    render(store.getState());
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

  function handleSessionExpiry() {
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
      lobbyQueues: []
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
    var queues = state.queues || [];
    var hasHotQueue = queues.some(function (q) {
      return q.status === AppConstants.STATUS.INVITED || q.status === AppConstants.STATUS.RAIDING;
    });
    if (state.managingLobby || hasHotQueue) return AppConstants.POLL.HOT_MS;
    if (queues.length > 0 || (state.hosts || []).length > 0) return AppConstants.POLL.WARM_MS;
    return AppConstants.POLL.IDLE_MS;
  }

  function getMaintenanceInterval(state) {
    var queues = state.queues || [];
    var hasHotQueue = queues.some(function (q) {
      return q.status === AppConstants.STATUS.INVITED || q.status === AppConstants.STATUS.RAIDING;
    });
    if (state.managingLobby || hasHotQueue) return AppConstants.MAINTENANCE.HOT_MS;
    if (queues.length > 0 || (state.hosts || []).length > 0) return AppConstants.MAINTENANCE.WARM_MS;
    return AppConstants.MAINTENANCE.IDLE_MS;
  }

  function runQueueMaintenance(api, state) {
    var hosts = state.hosts || [];
    if (!hosts.length) return Promise.resolve();
    var tasks = hosts.map(function (h) {
      return api.expireStaleInvites(h.id).catch(function () {})
        .then(function () { return api.checkHostInactivity(h.id).catch(function () {}); });
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
    if (state.hostSuccess) {
      renderHostSuccessView(state);
    }
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

  /* ═══════════════════════════════════════════════════════════════
     DATA — refresh
     ═══════════════════════════════════════════════════════════════ */
  function refreshData() {
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
    }

    return Promise.all([raidsPromise, raidBossesPromise, queuePromise, hostPromise, vipPromise, profilePromise, adminCheckPromise, accountStatsPromise, appConfigPromise])
      .then(function (res) {
        var raids = res[0] || [], raidBosses = res[1] || [];
        var hosts = res[3] || [];
        var isVip = !!res[4];
        var profile = res[5] || null;
        var isAdmin = !!res[6];
        var accountStats = res[7] || null;
        var appConfig = res[8] || null;

        if (profile && accountStats && !accountStats.member_since && profile.created_at) {
          accountStats = Object.assign({}, accountStats, { member_since: profile.created_at });
        }

        return attachQueueHostProfiles(api, res[2] || []).then(function (queues) {
          function buildRefreshPayload(nextQueues) {
            var conflicts = global.ConflictUtils.detectQueueConflicts(nextQueues);

            var bossesPromise = api.listBossQueueStats().then(function (bosses) {
              return { raids:raids, raidBosses:raidBosses, queues:nextQueues, hosts:hosts,
                       conflicts:conflicts, isVip:isVip, isAdmin:isAdmin, profile:profile, accountStats:accountStats, appConfig:appConfig, bosses: Array.isArray(bosses) ? bosses : [] };
            }).catch(function (err) {
              if (err && err.status === 401) throw err;
              return { raids:raids, raidBosses:raidBosses, queues:nextQueues, hosts:hosts,
                       conflicts:conflicts, isVip:isVip, isAdmin:isAdmin, profile:profile, accountStats:accountStats, appConfig:appConfig, bosses: buildBossesFromRaids(raids) };
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
        store.setState(payload);

        // Keep teammate/lobby rosters synced for every visible active queue.
        var snapshotIds = {};
        (payload.queues || []).forEach(function (q) {
          var raidId = (Array.isArray(q.raids) ? (q.raids[0] && q.raids[0].id) : (q.raids && q.raids.id)) || q.raid_id;
          if (raidId) snapshotIds[raidId] = true;
        });
        if (state.managingLobby) {
          snapshotIds[state.managingLobby] = true;
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
          setMessage("Refresh failed: " + err.message, "error");
        }
      })
      .finally(function () { setLoading(false); });
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
        renderAccountView(store.getState());
        postRenderAccountEffects();
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
        global.AppConfig.clearSession();
        formPersist.clearAll();
        profileEditMode = false;
        closeDrawer();
        store.setState({
          config: Object.assign({}, store.getState().config, { token: "", userId: "" }),
          view: "account",
          queues: [], conflicts: [], hosts: [], isVip: false, isAdmin: false, authMode: "signin", pendingConfirmation: null, profile: null, snapshots: {}, openLobbyQrs: {}, lobbyInfoOpen: {}, adminBosses: [], adminEditingId: null, syncCursor: null
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
        refreshData();
      }).catch(function (err) {
        console.error('[Auth] ' + mode + ' failed:', err.message, err);
        setMessage((mode === "signup" ? "Sign up failed: " : "Sign in failed: ") + err.message, "error");
      }).finally(function () { setLoading(false); });
    });
  }

  function findFallbackRaidIdByBossId(bossId) {
    var raids = store.getState().raids || [];
    var userId = ((store.getState().config || {}).userId) || "";
    var target = raids.find(function (r) {
      return r.raid_boss_id === bossId && r.host_user_id !== userId;
    });
    return target ? target.id : "";
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
          .catch(function (err) {
            if (err && err.status === 401) throw err;
            var fallback = findFallbackRaidIdByBossId(vipDirect);
            if (!fallback) throw err;
            return directApi.joinRaidQueue(fallback, 'Joined VIP queue');
          })
          .then(function () {
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
        .catch(function (err) {
          if (err && err.status === 401) throw err;
          var fallback = findFallbackRaidIdByBossId(joinBoss);
          if (!fallback) throw err;
          return api.joinRaidQueue(fallback, useVip ? "Joined VIP queue" : "Joined queue");
        })
        .then(function () {
          showToast("You've joined the queue!", "success");
          return refreshData().then(function () {
            switchView("queues");
          });
        })
        .catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          setMessage("Join failed: " + err.message, "error");
        })
        .finally(function () { setLoading(false); });
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
        var navTarget = e.target.closest('[data-view]');
        if (!navTarget) return;
        e.preventDefault();
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
        formPersist.clear('hostForm');
        store.setState({ hostSuccess: true });
        render(store.getState());
        return refreshData();
      }).then(function () {
        setTimeout(function () { switchView("queues"); }, 2000);
      }).catch(function (err) {
        if (err && err.status === 401) { handleSessionExpiry(); return; }
        setMessage("Host failed: " + err.message, "error");
        submitBtn.disabled = false;
      }).finally(function () { setLoading(false); });
    });
  }

  function initQueueActions() {
    qs("queuesContent").addEventListener("click", function (e) {
      var origin = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
      if (!origin || typeof origin.closest !== "function") return;
      var target = origin.closest("[data-leave]") || origin.closest("[data-keep]") || origin.closest("[data-view]") || origin.closest("[data-friend-sent]") || origin.closest("[data-finish-raiding]") || origin.closest("[data-manage-lobby]") || origin.closest("[data-close-lobby]") || origin.closest("[data-start-raid]") || origin.closest("[data-host-finish]") || origin.closest("[data-copy-fc]") || origin.closest("[data-toggle-lobby-qr]") || origin.closest("[data-toggle-all-lobby-qrs]") || origin.closest("[data-toggle-lobby-info]") || origin.closest("[data-rejoin-boss]") || origin.closest("[data-delete-queue]") || origin.closest("[data-delete-lobby]");
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
        render(store.getState());
        return;
      }

      var startRaid = target.getAttribute("data-start-raid");
      if (startRaid) {
        setLoading(true);
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
        if (!window.confirm("Cancel this raid?\n\nPlayers still waiting will be moved to another lobby if one is available.")) return;
        setLoading(true);
        api.cancelRaid(deleteLobby).then(function () {
          showToast("Raid cancelled.", "success");
          store.setState({ managingLobby: null, lobbyQueues: [], openLobbyQrs: {}, lobbyInfoOpen: {} });
          return refreshData();
        }).catch(function (err) {
          if (err && err.status === 401) { handleSessionExpiry(); return; }
          showToast("Cancel raid failed: " + err.message, "error");
          return refreshData().catch(function () {});
        }).finally(function () { setLoading(false); });
        return;
      }

      // Done-state actions
      var rejoinBossId = target.getAttribute("data-rejoin-boss");
      var cleanupQueueId = target.getAttribute("data-cleanup-queue");
      var deleteQueueId = target.getAttribute("data-delete-queue");

      if (rejoinBossId) {
        setLoading(true);
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

    // "More" hamburger button opens drawer
    var menuBtn = qs("drawerMenuBtn");
    if (menuBtn) menuBtn.addEventListener("click", function () { openDrawer(); });

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
      refreshData();
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

    // Auto-redirect unauthenticated visitors to Account screen on page load
    if (!isAuthed()) {
      store.setState({ view: "account" });
    }

    // Sync footer: refresh button + auto-update relative time
    qs("syncFooter").addEventListener("click", function (e) {
      if (e.target.closest("#syncRefreshBtn")) refreshData();
    });

    // Lightweight sync polling: check version stamps often, refresh full state only when needed.
    var pollTimer = null;
    var lastMaintenanceAt = 0;
    function scheduleNextPoll() {
      if (pollTimer) clearTimeout(pollTimer);
      var interval = getSyncPollInterval(store.getState());

      pollTimer = setTimeout(function () {
        var s = store.getState();
        if (!isAuthed()) {
          scheduleNextPoll();
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
            return refreshData();
          }
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

    // Start the adaptive poll cycle after initial data load
    refreshData().then(function () {
      scheduleNextPoll();
    });
    render(store.getState());
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
