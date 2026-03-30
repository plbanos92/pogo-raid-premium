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
      return !search || (boss.name || "").toLowerCase().indexOf(search) >= 0;
    });

    if (!filtered.length) {
      updateRenderedHtml(wrap, '<p class="boss-grid-empty">No active raid bosses found.</p>');
      return;
    }

    updateRenderedHtml(wrap, filtered.map(function (boss) {
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
                 types.map(function (type) { return '<span class="tag-type">' + escapeHtml(type) + '</span>'; }).join(""),
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
  };
})(window);
