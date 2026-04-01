// HomeView with filter modal/dropdown for boss tier/type
(function (global) {
  var AppViews = global.AppViews = global.AppViews || {};
  var AppHtml = global.AppHtml || {};

  function icon(name, w, h) {
    return AppHtml.icon(name, w, h);
  }

  function escapeHtml(value) {
    return AppHtml.escapeHtml(value);
  }

  function formatTier(tier) {
    return AppHtml.formatTier(tier);
  }

  // --- Filter state (in-memory, not persisted) ---
  var filterState = {
    open: false,
    tier: null,
    type: null
  };

  // --- Helper: get unique tiers/types from bosses ---
  function getUniqueTiers(bosses) {
    var set = {};
    (bosses || []).forEach(function(b){ if(b.tier) set[b.tier]=1; });
    return Object.keys(set).sort();
  }
  function getUniqueTypes(bosses) {
    var set = {};
    (bosses || []).forEach(function(b){ (b.types||[]).forEach(function(t){ set[t]=1; }); });
    return Object.keys(set).sort();
  }

  // --- Main render ---
  AppViews.renderHome = function renderHome(state, deps) {
    deps = deps || {};
    state = state || {};

    var qs = deps.qs || function (id) { return document.getElementById(id); };
    var updateRenderedHtml = deps.updateRenderedHtml || function (el, html) {
      if (el) el.innerHTML = html;
      return true;
    };
    var getBossDisplayImage = deps.getBossDisplayImage || function (boss) {
      return AppHtml.getBossDisplayImage(boss);
    };

    var wrap = qs("activeRaids");
    if (!wrap) return;

    var bosses = Array.isArray(state.bosses) ? state.bosses : [];
    var raids = Array.isArray(state.raids) ? state.raids : [];
    var queues = Array.isArray(state.queues) ? state.queues : [];
    var userId = ((state.config || {}).userId) || "";

    var search = (state.searchTerm || "").toLowerCase();
    var filtered = bosses.filter(function (boss) {
      var matchesSearch = !search || (boss.name || "").toLowerCase().indexOf(search) >= 0;
      var matchesTier = !filterState.tier || boss.tier === filterState.tier;
      var matchesType = !filterState.type || (boss.types||[]).indexOf(filterState.type) >= 0;
      return matchesSearch && matchesTier && matchesType;
    });


    // --- Filter modal/dropdown markup ---
    var allTiers = getUniqueTiers(bosses);
    var allTypes = getUniqueTypes(bosses);
    var filterModal =
      '<div id="filterModal" class="filter-modal' + (filterState.open ? '' : ' hidden') + '">' +
        '<div class="filter-modal-backdrop"></div>' +
        '<div class="filter-modal-content">' +
          '<h2 class="filter-modal-title">Filter Raid Bosses</h2>' +
          '<div class="filter-group"><label>Tier:</label>' +
            '<select id="filterTier"><option value="">All</option>' +
              allTiers.map(function(t){return '<option value="'+t+'"'+(filterState.tier===t?' selected':'')+'>'+t+'</option>';}).join('') +
            '</select>' +
          '</div>' +
          '<div class="filter-group"><label>Type:</label>' +
            '<select id="filterType"><option value="">All</option>' +
              allTypes.map(function(t){return '<option value="'+t+'"'+(filterState.type===t?' selected':'')+'>'+t+'</option>';}).join('') +
            '</select>' +
          '</div>' +
          '<div class="filter-modal-actions">' +
            '<button id="filterApplyBtn" class="btn-primary">Apply</button>' +
            '<button id="filterClearBtn" class="btn-secondary">Clear</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (!filtered.length) {
      updateRenderedHtml(wrap, filterModal + '<p class="boss-grid-empty">No active raid bosses found.</p>');
      bindFilterEvents();
      return;
    }

    // Build sync pill for top right
    var syncPillMode = (state.realtimeMode === 'realtime' || state.realtimeRetrying) ? 'realtime' : 'polling';
    var isVipLive = !!state.isVip;
    var isVipRetrying = isVipLive && !!state.realtimeRetrying;
    var syncPill = '<span class="sync-pill sync-pill--' + syncPillMode + ' top-pill">' +
      (syncPillMode === 'realtime'
        ? ('<span class="live-icon-wrap' + (isVipLive ? ' live-icon-vip' : '') + '">' +
              icon('zap', 12) +
              (isVipLive && !isVipRetrying ? '<span class="live-gold-aura"></span>' : '') +
            '</span> Live' +
            (syncPillMode === 'realtime' && global.RealtimeUtils && state.realtimeSlotStats
              ? '<span class="slot-stats-label">' + global.RealtimeUtils.formatRealtimeSlotStats(state.realtimeSlotStats) + '</span>'
              : ''))
        : icon('clock', 12) + ' Polling') +
      '</span>';

    // Insert pill at top right of boss grid area
    var bossGridHeader = '<div class="boss-grid-header"><div></div><div class="boss-sync-pill-top-wrap">' + syncPill + '</div></div>';

    updateRenderedHtml(wrap, filterModal + bossGridHeader + filtered.map(function (boss) {
      var types = Array.isArray(boss.types) ? boss.types : [];
      var bossRaids = raids.filter(function (raid) {
        return raid.raid_boss_id === boss.id;
      });
      var hasOwnHostedRaid = bossRaids.some(function (raid) {
        return raid.host_user_id === userId;
      });
      var hasJoinableRaid = bossRaids.some(function (raid) {
        return raid.host_user_id !== userId;
      });
      var myQueued = queues.some(function (queue) {
        if (queue.boss_id === boss.id) return true;
        var raid = Array.isArray(queue.raids) ? queue.raids[0] : queue.raids;
        return raid && raid.raid_boss_id === boss.id;
      });

      var joinHtml;
      if (myQueued) {
        joinHtml =
          '<button class="btn-queued" disabled>' +
          '  <div class="pulse-dot"></div> Already in Queue' +
          '</button>';
      } else if (hasOwnHostedRaid && !hasJoinableRaid) {
        joinHtml =
          '<button class="btn-queued" disabled>' +
          '  <div class="pulse-dot"></div> You\'re Hosting This Raid' +
          '</button>';
      } else if (state.isVip) {
        joinHtml =
          '<button class="btn-join-vip" data-join-vip-direct="' + escapeHtml(boss.id) + '">' +
          icon('crown', 14) + ' Join VIP Queue' +
          '</button>';
      } else {
        joinHtml =
          '<button class="btn-join" data-boss-toggle="' + escapeHtml(boss.id) + '">Join Queue</button>';
      }


      return [
        '<article class="boss-card">',
        '  <div class="boss-top">',
        '    <div class="boss-img-wrap">',
        '      <img src="' + escapeHtml(getBossDisplayImage(boss)) + '" alt="' + escapeHtml(boss.name) + '">',
        '    </div>',
        '    <div class="boss-info">',
        '      <div class="boss-tags">',
        '        <span class="tag-tier">' + escapeHtml(formatTier(boss.tier)) + '</span>',
                 types.map(function (type) {
                   var slug = type.toLowerCase();
                   return '<span class="tag-type"><img src="/assets/type-icons/' + escapeHtml(slug) + '.svg" alt="">' + escapeHtml(type) + '</span>';
                 }).join(""),
        '      </div>',
        '      <h3 class="boss-name">' + escapeHtml(boss.name || "Unknown") + '</h3>',
        '      <p class="boss-cp">CP: ' + (boss.cp != null ? Number(boss.cp).toLocaleString() : "\u2014") + '</p>',
        '    </div>',
        '  </div>',

        '  <div class="stats-row">',
        '    <div class="stat-box queue">',
        '      <div class="stat-icon queue">' + icon("users", 16) + '</div>',
        '      <div><div class="stat-value">' + (boss.queue_length || 0).toLocaleString() + '</div>',
        '        <div class="stat-label">In Queue</div></div>',
        '    </div>',
        '    <div class="stat-box host">',
        '      <div class="stat-icon host">' + icon("swords", 16) + '</div>',
        '      <div><div class="stat-value">' + (boss.active_hosts || 0) + '</div>',
        '        <div class="stat-label">Open Hosts</div></div>',
        '    </div>',
        '  </div>',

        '  <div class="join-area" id="join-' + escapeHtml(boss.id) + '">' + joinHtml + '</div>',
        '</article>'
      ].join("\n");
    }).join("\n"));
    bindFilterEvents();
  };

  // --- Bind filter icon and modal events ---
  function bindFilterEvents() {
    var filterBtn = document.querySelector('.filter-btn');
    if (filterBtn && !filterBtn.__bound) {
      filterBtn.__bound = true;
      filterBtn.addEventListener('click', function(e) {
        e.preventDefault();
        filterState.open = true;
        global.AppViews.renderHome(global.AppStore.getState());
      });
    }
    var modal = document.getElementById('filterModal');
    if (!modal) return;
    var backdrop = modal.querySelector('.filter-modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function() {
        filterState.open = false;
        global.AppViews.renderHome(global.AppStore.getState());
      });
    }
    var tierSel = document.getElementById('filterTier');
    var typeSel = document.getElementById('filterType');
    var applyBtn = document.getElementById('filterApplyBtn');
    var clearBtn = document.getElementById('filterClearBtn');
    if (applyBtn) {
      applyBtn.addEventListener('click', function(e) {
        e.preventDefault();
        filterState.tier = tierSel.value || null;
        filterState.type = typeSel.value || null;
        filterState.open = false;
        global.AppViews.renderHome(global.AppStore.getState());
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function(e) {
        e.preventDefault();
        filterState.tier = null;
        filterState.type = null;
        filterState.open = false;
        global.AppViews.renderHome(global.AppStore.getState());
      });
    }
  }
})(window);
