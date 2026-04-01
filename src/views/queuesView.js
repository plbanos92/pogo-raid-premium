(function (global) {
  var AppViews = global.AppViews = global.AppViews || {};
  var AppHtml = global.AppHtml || {};

  function defaultConflictMap(conflicts) {
    var rows = Array.isArray(conflicts) ? conflicts : [];
    var map = {};
    rows.forEach(function (c) {
      if (!c) return;
      if (c.leftQueueId) map[c.leftQueueId] = true;
      if (c.rightQueueId) map[c.rightQueueId] = true;
    });
    return map;
  }

  function buildLobbyQrMarkup(lobbyQueue, deps, qrOpen) {
    var friendCode = (lobbyQueue && lobbyQueue.friend_code) || '';
    if (!friendCode) {
      return '<div class="lobby-fc lobby-fc-empty"><em>Friend code not set</em></div>';
    }

    var escapeHtml = deps.escapeHtml;
    var formatFriendCode = deps.formatFriendCode;
    var icon = deps.icon;
    var id = (lobbyQueue && lobbyQueue.id) || '';
    var name = deps.getTrainerDisplayName(lobbyQueue);

    var html = [];
    html.push('<div class="lobby-fc"><span class="code-inline">' + escapeHtml(formatFriendCode(friendCode)) + '</span> <button class="copy-fc-btn" data-copy-fc="' + escapeHtml(friendCode) + '" title="Copy">' + icon('clipboard', 14) + '</button> <button class="copy-fc-btn' + (qrOpen ? ' active' : '') + '" data-toggle-lobby-qr="' + escapeHtml(id) + '" title="' + (qrOpen ? 'Hide QR' : 'Show QR') + '">' + icon('qrCode', 14) + '</button></div>');
    if (qrOpen) {
      html.push('<div class="lobby-qr-preview"><div class="lobby-qr-canvas" data-friend-code="' + escapeHtml(friendCode) + '"></div><p>Scan to add ' + escapeHtml(name) + '</p></div>');
    }
    return html.join('');
  }

  function renderTeammateRoster(snapshotData, status, deps) {
    if (status === 'queued') return '';

    var icon = deps.icon;
    var escapeHtml = deps.escapeHtml;
    var getTrainerDisplayName = deps.getTrainerDisplayName;
    var renderTrainerMeta = deps.renderTrainerMeta;

    var validStatuses = ['queued', 'invited', 'confirmed', 'raiding', 'done'];
    var meEntry = (snapshotData || []).find(function (entry) {
      return entry.is_me && validStatuses.indexOf(entry.status) >= 0;
    });
    var teammates = (snapshotData || []).filter(function (entry) {
      return !entry.is_me && validStatuses.indexOf(entry.status) >= 0;
    });
    var html = [];

    html.push('<div class="queue-teammates">');
    html.push('  <div class="queue-teammates-header">' + icon('users', 16) + ' Your Team</div>');

    if (!meEntry && !teammates.length) {
      html.push('  <p class="queue-teammates-empty">No teammates are visible in this lobby yet.</p>');
      html.push('</div>');
      return html.join('\n');
    }

    html.push('  <div class="queue-teammate-list">');

    if (meEntry) {
      var meStatusClass = meEntry.status === 'confirmed' ? 'status-confirmed' :
        meEntry.status === 'invited' ? 'status-invited' :
        meEntry.status === 'raiding' ? 'status-raiding' :
        meEntry.status === 'done' ? 'status-done' : 'status-queued';
      var meStatusLabel = meEntry.status === 'confirmed' ? icon('check', 12) + ' Friend Request Sent' :
        meEntry.status === 'invited' ? 'Invited' :
        meEntry.status === 'raiding' ? '<span class="pulse-dot-sm"></span> Raiding' :
        meEntry.status === 'done' ? icon('check', 12) + ' Done' : 'Queued';
      html.push('    <div class="queue-teammate-entry is-me">');
      html.push('      <div class="lobby-avatar is-me">You</div>');
      html.push('      <div class="queue-teammate-info">');
      html.push('        <div class="queue-teammate-top">');
      html.push('          <div class="lobby-entry-name">You</div>');
      html.push('          <span class="status-pill ' + meStatusClass + '">' + meStatusLabel + '</span>');
      html.push('        </div>');
      html.push(renderTrainerMeta(meEntry.team, meEntry.trainer_level, 'trainer-meta-row'));
      html.push('      </div>');
      html.push('    </div>');
    }

    teammates.forEach(function (entry) {
      var name = getTrainerDisplayName(entry);
      var statusClass = entry.status === 'confirmed' ? 'status-confirmed' :
        entry.status === 'invited' ? 'status-invited' :
        entry.status === 'raiding' ? 'status-raiding' :
        entry.status === 'done' ? 'status-done' : 'status-queued';
      var statusLabel = entry.status === 'confirmed' ? icon('check', 12) + ' Friend Request Sent' :
        entry.status === 'invited' ? 'Invited' :
        entry.status === 'raiding' ? '<span class="pulse-dot-sm"></span> Raiding' :
        entry.status === 'done' ? icon('check', 12) + ' Done' : 'Queued';

      html.push('    <div class="queue-teammate-entry">');
      html.push('      <div class="lobby-avatar">' + escapeHtml(name.charAt(0).toUpperCase()) + '</div>');
      html.push('      <div class="queue-teammate-info">');
      html.push('        <div class="queue-teammate-top">');
      html.push('          <div class="lobby-entry-name">' + escapeHtml(name) + '</div>');
      html.push('          <span class="status-pill ' + statusClass + '">' + statusLabel + '</span>');
      html.push('        </div>');
      html.push(renderTrainerMeta(entry.team, entry.trainer_level, 'trainer-meta-row'));
      html.push('      </div>');
      html.push('    </div>');
    });
    html.push('  </div>');
    html.push('</div>');
    return html.join('\n');
  }

  function renderPeopleLine(context, deps) {
    var icon = deps.icon;
    var personSvg = deps.personSvg;

    var q = context.queue;
    var queueLen = context.queueLength;
    var myPos = q.position || 1;
    var snapshotData = context.snapshotData;
    var isVipLive = context.isVipLive;

    var snapPosMap = {};
    if (snapshotData) {
      snapshotData.forEach(function (sn) {
        if (!sn.is_me && sn.position) snapPosMap[sn.position] = sn;
      });
    }

    var aheadEntries = [];
    var aheadVisible = [];
    var aheadVisibleMap = {};
    var behindEntries = [];
    var behindVisible = [];
    var hiddenAhead = 0;
    var hiddenBehind = 0;
    var minVisibleAhead = 8;

    for (var aheadPos = myPos - 1; aheadPos >= 1; aheadPos--) {
      var aheadSnap = snapPosMap[aheadPos];
      aheadEntries.push({
        position: aheadPos,
        isVip: aheadSnap ? !!aheadSnap.is_vip : false
      });
    }

    for (var behindPos = queueLen; behindPos > myPos; behindPos--) {
      var behindSnap = snapPosMap[behindPos];
      behindEntries.push({
        position: behindPos,
        isVip: behindSnap ? !!behindSnap.is_vip : false
      });
    }

    if ((aheadEntries.length + behindEntries.length) <= 10) {
      aheadVisible = aheadEntries.slice();
      behindVisible = behindEntries.slice();
    } else {
      hiddenBehind = behindEntries.length;
    }

    if (aheadEntries.length <= 10 && behindVisible.length === 0) {
      aheadVisible = aheadEntries.slice();
    } else if (behindVisible.length === 0) {
      aheadEntries.slice(0, minVisibleAhead).forEach(function (entry) {
        aheadVisibleMap[entry.position] = true;
      });
      aheadEntries.forEach(function (entry) {
        if (entry.isVip) aheadVisibleMap[entry.position] = true;
      });
      aheadVisible = aheadEntries.filter(function (entry) {
        return !!aheadVisibleMap[entry.position];
      });
      hiddenAhead = Math.max(0, aheadEntries.length - aheadVisible.length);
    }

    var html = [];
    html.push('<div class="queue-people-line">');

    behindVisible.forEach(function (entry) {
      html.push('<div class="qp-slot ' + (entry.isVip ? 'qp-vip-ahead' : 'qp-free-ahead') + '">');
      if (entry.isVip) html.push('<span class="qp-crown-sm">' + icon('crown', 12) + '</span>');
      html.push('<div class="qp-icon">' + personSvg(24) + '</div>');
      html.push('<span class="qp-lbl">Player</span>');
      html.push('</div>');
    });

    if (hiddenBehind > 0) {
      html.push('<div class="qp-behind">+' + hiddenBehind + '</div>');
    }

    html.push('<div class="qp-slot ' + (isVipLive ? 'qp-me-vip' : 'qp-me-free') + '">');
    if (isVipLive) html.push('<span class="qp-crown-sm">' + icon('crown', 12) + '</span>');
    html.push('<div class="qp-icon">' + personSvg(24) + '</div>');
    html.push('<span class="qp-lbl">You</span>');
    html.push('</div>');

    aheadVisible.forEach(function (entry) {
      html.push('<div class="qp-slot ' + (entry.isVip ? 'qp-vip-ahead' : 'qp-free-ahead') + '">');
      if (entry.isVip) html.push('<span class="qp-crown-sm">' + icon('crown', 12) + '</span>');
      html.push('<div class="qp-icon">' + personSvg(24) + '</div>');
      html.push('<span class="qp-lbl">Player</span>');
      html.push('</div>');
    });

    if (hiddenAhead > 0) {
      html.push('<div class="qp-gap">+' + hiddenAhead + '</div>');
    }

    html.push('<div class="qp-slot qp-host">');
    html.push('<div class="qp-icon">' + personSvg(24) + '</div>');
    html.push('<span class="qp-lbl">Host</span>');
    html.push('</div>');
    html.push('</div>');

    return html.join('');
  }

  AppViews.renderQueues = function renderQueues(state, deps) {
    state = state || {};
    deps = deps || {};

    var icon = deps.icon || function (name, w, h) { return AppHtml.icon(name, w, h); };
    var personSvg = deps.personSvg || function (sz) { return AppHtml.personSvg(sz); };
    var escapeHtml = deps.escapeHtml || function (value) { return AppHtml.escapeHtml(value); };
    var viewTitleHtml = deps.viewTitleHtml || function (iconKey, text, opts) { return AppHtml.viewTitleHtml(iconKey, text, opts); };
    var getBossDisplayImage = deps.getBossDisplayImage || function (boss) { return AppHtml.getBossDisplayImage(boss); };
    var renderTrainerMeta = deps.renderTrainerMeta || function (team, level, className) { return AppHtml.renderTrainerMeta(team, level, className); };
    var getTrainerDisplayName = deps.getTrainerDisplayName || function (entry) { return AppHtml.getTrainerDisplayName(entry); };
    var formatFriendCode = deps.formatFriendCode || function (fc) { return AppHtml.formatFriendCode(fc); };
    var conflictMap = deps.conflictMap || defaultConflictMap;
    var shouldShowLeaveQueueButton = deps.shouldShowLeaveQueueButton || function (status) {
      return status === 'queued' || status === 'invited' || status === 'confirmed';
    };
    var isTerminalRaidStatus = deps.isTerminalRaidStatus || function (status) {
      var pred = global.RaidPredicates;
      return !!(pred && typeof pred.isTerminal === 'function' && pred.isTerminal(status));
    };

    var queues = Array.isArray(state.queues) ? state.queues : [];
    var hosts = Array.isArray(state.hosts) ? state.hosts : [];
    var lobbyQueues = Array.isArray(state.lobbyQueues) ? state.lobbyQueues : [];
    var hasContent = queues.length > 0 || hosts.length > 0;

    if (!hasContent) {
      return [
        '<div class="queues-empty">',
        '  <div class="queues-empty-icon">' + icon('users', 40) + '</div>',
        '  <h2>You aren\'t in any queues</h2>',
        '  <p>Join a queue to find a raid group, or host one yourself to invite others.</p>',
        '  <div class="queues-actions">',
        '    <button class="btn-primary" data-view="home" type="button">Find Raids</button>',
        '    <button class="btn-secondary" data-view="host" type="button">Host Raid</button>',
        '  </div>',
        '</div>'
      ].join('\n');
    }

    var html = [];

    html.push('<div style="margin-bottom:2rem">');
    html.push(viewTitleHtml('list', 'My Queues'));
    html.push('  <p class="view-subtitle">Manage your current queues and hosted lobbies.</p>');
    html.push('</div>');

    if (state.managingLobby && !hosts.find(function (h) { return h.id === state.managingLobby; })) {
      html.push([
        '<section style="margin-bottom:2rem">',
        '  <div class="alert-warning">',
        '    ' + icon('xCircle', 18) + ' <div><strong>Raid has ended</strong><p>This raid was completed or cancelled. Your lobby has been closed.</p></div>',
        '  </div>',
        '</section>'
      ].join('\n'));
    }

    if (hosts.length > 0) {
      var isHostVipLive = !!state.isVip;
      var isHostVipRetrying = isHostVipLive && !!state.realtimeRetrying;
      var hostPillMode = (state.realtimeMode === 'realtime' || isHostVipRetrying) ? 'realtime' : 'polling';
      var hostSyncPill = '<span class="sync-pill sync-pill--' + hostPillMode + '">' +
        (hostPillMode === 'realtime'
          ? ('<span class="live-icon-wrap' + (isHostVipLive ? ' live-icon-vip' : '') + '">' +
              icon('zap', 12) +
              (isHostVipLive && !isHostVipRetrying ? '<span class="live-gold-aura"></span>' : '') +
            '</span> Live' +
            '<span class="slot-stats-label">' +
            (state.realtimeMode === 'realtime' && global.RealtimeUtils ? global.RealtimeUtils.formatRealtimeSlotStats(state.realtimeSlotStats) : '') +
            '</span>')
          : icon('clock', 12) + ' Polling') +
        '</span>';

      html.push('<section style="margin-bottom:2rem">');
      html.push('  <h2 class="section-title">Hosted Lobbies <span class="section-count teal">' + hosts.length + ' Active</span>' + hostSyncPill + '</h2>');
      html.push('  <div class="hosts-list">');

      hosts.forEach(function (h) {
        var rb = Array.isArray(h.raid_bosses) ? h.raid_bosses[0] : h.raid_bosses;
        var bossName = (rb && rb.name) || 'Unknown';
        var lq = lobbyQueues;
        var isRaidingPhase = lq.some(function (e) { return e.status === 'raiding' || e.status === 'done'; });
        var hostDone = !!h.host_finished_at;
        var prof = state.profile || {};
        var hostName = prof.in_game_name || prof.display_name || 'Host';
        var hostTeam = prof.team || '';
        var hostLevel = prof.trainer_level || '';

        if (isRaidingPhase) {
          var raidingCount = lq.filter(function (e) { return e.status === 'raiding'; }).length;
          var participants = lq.filter(function (e) { return e.status === 'raiding' || e.status === 'done'; });
          var rp = [];

          rp.push('<div class="lobby-panel">');
          rp.push('  <div class="lobby-panel-header">');
          rp.push('    <h3>' + escapeHtml(bossName) + ' — Raiding</h3>');
          rp.push('  </div>');
          rp.push('  <div class="raid-in-progress-banner">' + icon('zap', 16) + ' Raid in progress!</div>');
          rp.push('  <div class="lobby-queue-list">');

          participants.forEach(function (entry) {
            var name = getTrainerDisplayName(entry);
            var initial = name.charAt(0).toUpperCase();
            var participantStatusPill = entry.status === 'raiding'
              ? '<span class="status-pill status-raiding"><span class="pulse-dot-sm"></span> Raiding</span>'
              : '<span class="status-pill status-done">' + icon('check', 12) + ' Done</span>';
            var qrOpen = !!((state.openLobbyQrs || {})[entry.id]);

            rp.push('    <div class="lobby-queue-entry">');
            rp.push('      <div class="lobby-avatar">' + escapeHtml(initial) + '</div>');
            rp.push('      <div class="lobby-entry-info">');
            rp.push('        <div class="lobby-entry-top">');
            rp.push('          <div class="lobby-entry-name">' + escapeHtml(name) + '</div>');
            rp.push('          ' + participantStatusPill);
            rp.push('        </div>');
            rp.push(renderTrainerMeta(entry.team, entry.trainer_level, 'lobby-entry-meta'));
            rp.push(buildLobbyQrMarkup(entry, {
              escapeHtml: escapeHtml,
              formatFriendCode: formatFriendCode,
              icon: icon,
              getTrainerDisplayName: getTrainerDisplayName
            }, qrOpen));
            rp.push('      </div>');
            rp.push('    </div>');
          });

          rp.push('  </div>');

          if (!hostDone) {
            rp.push('  <button class="btn-start-raid" data-host-finish="' + escapeHtml(h.id) + '" type="button">' + icon('check', 16) + ' Finish Raiding</button>');
            rp.push('  <button class="btn-delete-lobby" data-delete-lobby="' + escapeHtml(h.id) + '" type="button">' + icon('trash', 14) + ' Cancel Raid</button>');
          } else {
            rp.push('  <div class="host-done-msg">' + icon('checkCircle', 16) + ' You finished raiding');
            if (raidingCount > 0) {
              rp.push(' — waiting for ' + raidingCount + ' player' + (raidingCount > 1 ? 's' : '') + ' to finish…');
            }
            rp.push('</div>');
          }

          rp.push('</div>');
          html.push(rp.join('\n'));
          return;
        }

        var confirmedCount = lq.filter(function (e) { return e.status === 'confirmed'; }).length;
        var cap = parseInt(h.capacity, 10) || 5;
        var slotDots = '';
        for (var si = 0; si < cap; si++) {
          slotDots += '<span class="lobby-slot' + (si < confirmedCount ? ' filled' : '') + '"></span>';
        }
        var inactSecs = h.last_host_action_at ? Math.floor((Date.now() - new Date(h.last_host_action_at).getTime()) / 1000) : 0;
        var hostInactivitySeconds = (state.appConfig || {}).host_inactivity_seconds || 100;
        var infoOpen = !!(state.lobbyInfoOpen || {})[h.id];
        var lp = [];

        lp.push('<div class="lobby-panel">');
        lp.push('  <div class="lobby-panel-header">');
        lp.push('    <div class="lobby-panel-title-group">');
        lp.push('      <h3 class="lobby-panel-title">' + escapeHtml(bossName) + '</h3>');
        lp.push('      <div class="lobby-slots-wrap">');
        lp.push('        <span class="lobby-id-tag">Lobby #' + escapeHtml(String(h.id).slice(0, 8).toUpperCase()) + '</span>');
        lp.push('        <div class="lobby-slots">' + slotDots + '</div>');
        lp.push('        <span class="lobby-slots-count">' + confirmedCount + ' / ' + cap + ' confirmed</span>');
        lp.push('      </div>');
        lp.push('    </div>');
        lp.push('    <button class="lobby-info-btn" type="button" data-toggle-lobby-info="' + escapeHtml(h.id) + '" aria-label="Queue info" aria-expanded="' + infoOpen + '" aria-controls="lobby-info-' + escapeHtml(h.id) + '" title="Queue info">' + icon('info', 16) + '</button>');
        lp.push('  </div>');

        lp.push('  <div class="lobby-host-strip">');
        lp.push('    <img class="lobby-host-img-sm" src="' + escapeHtml(getBossDisplayImage(rb || { name: bossName })) + '" alt="' + escapeHtml(bossName) + '">');
        lp.push('    <div class="lobby-host-info">');
        lp.push('      <span class="lobby-host-name">' + icon('user', 13) + ' ' + escapeHtml(hostName) + '</span>');
        lp.push(renderTrainerMeta(hostTeam, hostLevel, 'trainer-meta-row'));
        lp.push('      <p class="lobby-fc-line">Code: <span class="code-inline">' + escapeHtml(h.friend_code || 'Not set') + '</span></p>');
        lp.push('    </div>');
        lp.push('  </div>');

        if (infoOpen) {
          lp.push('  <p class="lobby-auto-fill-note" id="lobby-info-' + escapeHtml(h.id) + '">Players are added to this lobby automatically from the queue. Start once enough players have confirmed.</p>');
        }

        var lqWithFc = lq.filter(function (entry) {
          return !!entry.friend_code && entry.status !== 'done' && entry.status !== 'cancelled' && entry.status !== 'left';
        });
        if (lqWithFc.length > 0) {
          var anyQrOpen = lqWithFc.some(function (entry) { return !!(state.openLobbyQrs || {})[entry.id]; });
          lp.push('  <div class="lobby-actions">');
          lp.push('    <button class="lobby-action-btn" style="background:var(--slate-100);color:var(--slate-700)" data-toggle-all-lobby-qrs="1" type="button">' + icon('qrCode', 14) + ' ' + (anyQrOpen ? 'Hide all QRs' : 'Show all QRs') + '</button>');
          lp.push('  </div>');
        }

        if (inactSecs > 0 && confirmedCount >= 1) {
          var remaining = Math.max(0, hostInactivitySeconds - inactSecs);
          lp.push('  <div class="alert-warning">' + icon('alert', 16) + ' <div><strong>Inactivity warning</strong><p>Lobby will close in <span class="countdown" data-inactivity-start="' + escapeHtml(h.last_host_action_at || '') + '" data-inactivity-timeout="' + hostInactivitySeconds + '">' + remaining + 's</span> if you don’t act.</p></div></div>');
        }

        lp.push('  <div class="lobby-queue-list">');
        lq.forEach(function (entry) {
          if (entry.status === 'done' || entry.status === 'cancelled' || entry.status === 'left') return;
          var name = getTrainerDisplayName(entry);
          var initial = name.charAt(0).toUpperCase();
          var qrOpen = !!((state.openLobbyQrs || {})[entry.id]);
          var statusPill = '';

          if (entry.status === 'queued') {
            statusPill = '<span class="status-pill status-queued">In Lobby</span>';
          } else if (entry.status === 'invited') {
            statusPill = '<span class="status-pill status-invited">Invited</span>';
          } else if (entry.status === 'confirmed') {
            statusPill = '<span class="status-pill status-confirmed">' + icon('check', 12) + ' Friend Request Sent</span>';
          }

          lp.push('    <div class="lobby-queue-entry">');
          lp.push('      <div class="lobby-avatar">' + escapeHtml(initial) + '</div>');
          lp.push('      <div class="lobby-entry-info">');
          lp.push('        <div class="lobby-entry-top">');
          lp.push('          <div class="lobby-entry-name">' + escapeHtml(name) + '</div>');
          if (statusPill) lp.push('          ' + statusPill);
          lp.push('        </div>');
          lp.push(renderTrainerMeta(entry.team, entry.trainer_level, 'lobby-entry-meta'));
          lp.push(buildLobbyQrMarkup(entry, {
            escapeHtml: escapeHtml,
            formatFriendCode: formatFriendCode,
            icon: icon,
            getTrainerDisplayName: getTrainerDisplayName
          }, qrOpen));
          lp.push('      </div>');
          lp.push('    </div>');
        });
        lp.push('  </div>');

        var hostSnapshot = (state.snapshots && state.snapshots[h.id]) || null;
        if (hostSnapshot && hostSnapshot.length > 0) {
          lp.push('  <div class="queue-line" style="margin-top:0.75rem">');
          var hsHasVip = hostSnapshot.some(function (s) { return s.is_vip; });
          var hsHasNonVip = hostSnapshot.some(function (s) { return !s.is_vip; });
          if (hsHasVip && hsHasNonVip) {
            lp.push('    <div class="queue-vip-divider">VIP</div>');
          }
          hostSnapshot.forEach(function (s) {
            var statusColor = s.status === 'confirmed' ? ' style="background:var(--teal-100);color:var(--teal-700);border-color:var(--teal-400)"' :
              (s.status === 'invited' ? ' style="background:var(--amber-50);color:var(--amber-700);border-color:var(--amber-300)"' : '');
            var pillClass = 'queue-pill' + (s.is_vip ? ' vip' : '');
            lp.push('    <span class="' + pillClass + '"' + statusColor + '>' + (s.is_vip ? icon('crown', 10) : '') + escapeHtml(s.display_name || 'Player') + '</span>');
          });
          lp.push('  </div>');
        }

        if (confirmedCount > 0) {
          lp.push('  <button class="btn-start-raid" data-start-raid="' + escapeHtml(h.id) + '" type="button">' + icon('users', 16) + ' Friend request sent to everyone</button>');
        }

        lp.push('  <button class="btn-delete-lobby" data-delete-lobby="' + escapeHtml(h.id) + '" type="button">' + icon('trash', 14) + ' Cancel Raid</button>');

        lp.push('</div>');
        html.push(lp.join('\n'));
      });

      html.push('  </div>');
      html.push('</section>');
    }

    if (queues.length > 0) {
      var cmap = conflictMap(state.conflicts || []);
      html.push('<section>');
      var isVipLive = !!state.isVip;
      var isVipRetrying = isVipLive && !!state.realtimeRetrying;
      var pillMode = (state.realtimeMode === 'realtime' || isVipRetrying) ? 'realtime' : 'polling';
      html.push(
        '  <h2 class="section-title">Your Queues <span class="section-count indigo">' + queues.length + ' Active</span>' +
        '<span class="sync-pill sync-pill--' + pillMode + '">' +
        (pillMode === 'realtime'
          ? (
              '<span class="live-icon-wrap' + (isVipLive ? ' live-icon-vip' : '') + '">' +
                icon('zap', 12) +
                (isVipLive && !isVipRetrying ? '<span class="live-gold-aura"></span>' : '') +
              '</span> Live <span class="slot-stats-label">' +
              (state.realtimeMode === 'realtime' && global.RealtimeUtils ? global.RealtimeUtils.formatRealtimeSlotStats(state.realtimeSlotStats) : '') +
              '</span>'
            )
          : icon('clock', 12) + ' Polling') +
        '</span>' +
        '</h2>'
      );
      html.push('  <div class="queue-cards">');

      queues.forEach(function (q) {
        var raid = Array.isArray(q.raids) ? q.raids[0] : q.raids;
        var rb = raid && raid.raid_bosses ? (Array.isArray(raid.raid_bosses) ? raid.raid_bosses[0] : raid.raid_bosses) : null;

        // Boss-level entries (no raid assigned yet): look up boss from state
        if (!rb && q.boss_id) {
          var raidBosses = Array.isArray(state.raidBosses) ? state.raidBosses : [];
          rb = raidBosses.find(function (b) { return b.id === q.boss_id; }) || null;
        }

        var bossName = (rb && rb.name) || 'Unknown';
        var imgSrc = getBossDisplayImage(rb || { name: bossName });
        var isVipLive = !!state.isVip;
        var isVipQ = isVipLive;
        var joinedTime = q.joined_at ? new Date(q.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        var hasConflict = !!cmap[q.id];
        var hostProfile = q.host_profile || null;
        var hostFriendCode = (raid && raid.friend_code) || (hostProfile && hostProfile.friend_code) || '';
        var raidId = (raid && raid.id) || q.raid_id;
        var snapshotData = (state.snapshots && state.snapshots[raidId]) || null;

        var c = [];
        c.push('<div class="queue-card' + (q.status === 'invited' ? ' queue-card-invited' : '') + (q.status === 'confirmed' ? ' queue-card-confirmed' : '') + (q.status === 'raiding' ? ' queue-card-raiding' : '') + (q.status === 'done' ? ' queue-card-done' : '') + '">');

        // Boss-level entry (waiting for a host)
        if (!q.raid_id) {
          c.push('<div class="queue-card-header">');
          c.push('  <img src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(bossName) + '">');
          c.push('  <div class="queue-card-hinfo">');
          c.push('    <h3>' + escapeHtml(bossName) + '</h3>');
          if (joinedTime) c.push('    <p>Joined ' + escapeHtml(joinedTime) + '</p>');
          c.push('  </div>');
          if (isVipQ) {
            c.push('  <div class="queue-card-icons">');
            c.push('    <div class="vip-crown-badge" aria-label="VIP">' +
              icon('crown', 20) +
              '<span class="vip-crown-sparkle vip-crown-sparkle-1"></span>' +
              '<span class="vip-crown-sparkle vip-crown-sparkle-2"></span>' +
              '<span class="vip-crown-sparkle vip-crown-sparkle-3"></span>' +
            '</div>');
            c.push('  </div>');
          }
          c.push('</div>');
          c.push('<div class="alert-info">' + icon('clock', 18) + ' <div><strong>Waiting for a host</strong><p>You\'ll be automatically matched when someone hosts this raid.</p></div></div>');
          c.push('<button class="btn-leave-queue-full" data-leave="' + escapeHtml(q.id) + '" type="button">' + icon('xCircle', 18) + ' Leave Queue</button>');
          c.push('</div>');
          html.push(c.join('\n'));
          return;
        }

        if (q.status === 'invited') {
          var inviteWindowSeconds = (state.appConfig || {}).invite_window_seconds || 60;
          var secsLeft = inviteWindowSeconds;
          if (q.invited_at) {
            var elapsed = Math.floor((Date.now() - new Date(q.invited_at).getTime()) / 1000);
            secsLeft = Math.max(0, inviteWindowSeconds - elapsed);
          }
          c.push('<div class="alert-warning">');
          c.push('  ' + icon('alert', 18));
          c.push('  <div>');
          c.push('    <strong>You\'re Invited!</strong>');
          if ((q.invite_attempts || 0) > 0) {
            c.push('    <p>Attempt ' + (q.invite_attempts || 0) + ' / 3 — <span class="countdown" data-invited="' + escapeHtml(q.invited_at || '') + '">' + secsLeft + 's</span> remaining.</p>');
          } else {
            c.push('    <p>Add the host and tap the button below. <span class="countdown" data-invited="' + escapeHtml(q.invited_at || '') + '">' + secsLeft + 's</span> remaining.</p>');
          }
          c.push('  </div>');
          c.push('</div>');
        } else if (q.status === 'confirmed') {
          c.push('<div class="alert-success">');
          c.push('  ' + icon('checkCircle', 18));
          c.push('  <div>');
          c.push('    <strong>Friend Request Sent!</strong>');
          c.push('    <p>The host can see that you\'re ready. Keep Pokémon GO open and wait for the raid to start.</p>');
          c.push('  </div>');
          c.push('</div>');
        } else if (q.status === 'raiding') {
          c.push('<div class="raid-in-progress-banner">' + icon('zap', 16) + ' Raid in progress!</div>');
        } else if (q.status === 'done') {
          c.push('<div class="raid-done-banner">' + icon('checkCircle', 16) + ' Raid complete! GG</div>');
        }

        var showLobbyIcon = (q.status === 'queued' && !!hostFriendCode);
        var showGetReadyIcon = (q.status === 'queued' && (q.position || 999) < 10);
        var showVipHeaderCrown = !!state.isVip;
        var lobbyBubbleKey = q.id + '-lobby';
        var readyBubbleKey = q.id + '-ready';
        var lobbyBubbleOpen = !!(state.lobbyInfoOpen || {})[lobbyBubbleKey];
        var readyBubbleOpen = !!(state.lobbyInfoOpen || {})[readyBubbleKey];

        c.push('<div class="queue-card-header">');
        c.push('  <img src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(bossName) + '">');
        c.push('  <div class="queue-card-hinfo">');
        c.push('    <h3>' + escapeHtml(bossName) + '</h3>');
        if (joinedTime) c.push('    <p>Joined ' + escapeHtml(joinedTime) + '</p>');
        c.push('  </div>');
        if (showVipHeaderCrown || showLobbyIcon || showGetReadyIcon) {
          c.push('  <div class="queue-card-icons">');
          if (showVipHeaderCrown) {
            c.push('    <div class="vip-crown-badge" aria-label="VIP">' +
              icon('crown', 20) +
              '<span class="vip-crown-sparkle vip-crown-sparkle-1"></span>' +
              '<span class="vip-crown-sparkle vip-crown-sparkle-2"></span>' +
              '<span class="vip-crown-sparkle vip-crown-sparkle-3"></span>' +
            '</div>');
          }
          if (showLobbyIcon) {
            c.push('    <button class="queue-info-btn" data-toggle-lobby-info="' + escapeHtml(lobbyBubbleKey) + '" aria-label="You\'re in the lobby">' + icon('users', 16) + '</button>');
          }
          if (showGetReadyIcon) {
            c.push('    <button class="queue-info-btn queue-info-btn-ready" data-toggle-lobby-info="' + escapeHtml(readyBubbleKey) + '" aria-label="Get Ready">' + icon('alert', 16) + '</button>');
          }
          c.push('  </div>');
        }
        c.push('</div>');

        if (lobbyBubbleOpen) {
          c.push('<div class="queue-info-bubble">');
          c.push('  <div class="queue-info-title">' + icon('users', 16) + ' You’re in the lobby</div>');
          c.push('  <div class="queue-info-desc">Add the host now, then tap the button below when your friend request is sent.</div>');
          c.push('</div>');
        }
        if (readyBubbleOpen) {
          c.push('<div class="queue-info-bubble queue-info-bubble-ready">');
          c.push('  <div class="queue-info-title">' + icon('alert', 16) + ' Get Ready!</div>');
          c.push('  <div class="queue-info-desc">You are near the front. Make sure Pokémon GO is open and your friend code is correct.</div>');
          c.push('</div>');
        }

        var showHostBlock = (q.status === 'queued' || q.status === 'invited' || q.status === 'confirmed' || q.status === 'raiding')
          && (hostFriendCode || (hostProfile && (hostProfile.in_game_name || hostProfile.display_name || hostProfile.team || hostProfile.trainer_level)));

        if (showHostBlock) {
          var hostQrKey = 'host-' + q.id;
          var hostQrOpen = !!((state.openLobbyQrs || {})[hostQrKey]);
          c.push('<div class="friend-code-block">');
          if (hostProfile && (hostProfile.in_game_name || hostProfile.display_name || hostProfile.team || hostProfile.trainer_level)) {
            c.push('  <div class="friend-code-host-meta">');
            c.push('    <div class="friend-code-host-name">' + icon('user', 14) + '<span>Host: ' + escapeHtml(getTrainerDisplayName(hostProfile)) + '</span></div>');
            c.push(renderTrainerMeta(hostProfile.team, hostProfile.trainer_level, 'friend-code-host-badges'));
            c.push('  </div>');
          }
          if (hostFriendCode) {
            var hostFcFormatted = formatFriendCode(hostFriendCode);
            c.push('  <div class="friend-code-value">' + escapeHtml(hostFcFormatted) + '</div>');
            c.push('  <div class="friend-code-actions">');
            c.push('    <button class="copy-fc-btn" data-copy-fc="' + escapeHtml(hostFriendCode) + '" title="Copy friend code">' + icon('clipboard', 16) + '</button>');
            c.push('    <button class="copy-fc-btn' + (hostQrOpen ? ' active' : '') + '" data-toggle-lobby-qr="' + escapeHtml(hostQrKey) + '" title="' + (hostQrOpen ? 'Hide QR' : 'Show QR') + '">' + icon('qrCode', 16) + '</button>');
            c.push('  </div>');
            if (hostQrOpen) {
              c.push('  <div class="lobby-qr-preview"><div class="lobby-qr-canvas" data-friend-code="' + escapeHtml(hostFriendCode) + '"></div><p>Scan to add the host</p></div>');
            }
          }
          c.push('</div>');
        }

        if (q.status === 'queued') {
          var queueLen = 50;
          var boss = (state.bosses || []).find(function (b) { return rb && b.id === rb.id; });
          if (boss) queueLen = boss.queue_length || 50;
          var activeHosts = boss ? (boss.active_hosts || 1) : 1;
          var etaMins = Math.max(1, Math.floor((q.position || 1) / (activeHosts * 5 || 1)));

          var vipsAhead = 0;
          if (snapshotData) {
            snapshotData.forEach(function (p) {
              if (p.is_vip && !p.is_me && p.position < (q.position || 999)) vipsAhead++;
            });
          }

          c.push('<div class="queue-stats">');
          c.push('  <div class="queue-pos-block">');
          c.push('    <div class="queue-pos-primary' + (isVipQ ? ' vip' : '') + '">#' + (q.position || '—') + ' in queue</div>');
          if (isVipQ) {
            c.push('    <div class="queue-pos-secondary">' + icon('crown', 12) + ' VIP priority</div>');
          } else if (vipsAhead > 0) {
            c.push('    <div class="queue-pos-secondary">' + vipsAhead + ' VIP' + (vipsAhead > 1 ? 's' : '') + ' ahead</div>');
          }
          c.push('  </div>');
          c.push('  <div style="text-align:right"><div class="queue-eta-label">' + icon('clock', 14) + ' Est. Wait</div><div class="queue-eta-value">~' + etaMins + ' mins</div></div>');
          c.push('</div>');

          c.push(renderPeopleLine({
            queue: q,
            queueLength: queueLen,
            snapshotData: snapshotData,
            isVipLive: isVipLive
          }, {
            icon: icon,
            personSvg: personSvg
          }));

          if (!isVipLive && vipsAhead > 0) {
            c.push('<div class="queue-fomo">' + vipsAhead + ' VIP member' + (vipsAhead > 1 ? 's are' : ' is') + ' ahead of you → <a data-view="vip">Go VIP</a></div>');
          }
        }

        c.push(renderTeammateRoster(snapshotData, q.status, {
          icon: icon,
          escapeHtml: escapeHtml,
          getTrainerDisplayName: getTrainerDisplayName,
          renderTrainerMeta: renderTrainerMeta
        }));

        if ((q.status === 'queued' && hostFriendCode) || q.status === 'invited' || q.status === 'confirmed') {
          c.push('<div class="queue-action-row">');
          if (q.status === 'confirmed') {
            c.push('<button class="btn-confirm-invite btn-confirm-sent" type="button" disabled>' + icon('check', 16) + ' Friend Request Sent</button>');
          } else {
            c.push('<button class="btn-primary btn-confirm-invite" data-friend-sent="' + escapeHtml(q.id) + '" type="button">' + icon('check', 16) + ' Friend Request Sent</button>');
          }
          c.push('</div>');
        }

        if (shouldShowLeaveQueueButton(q.status)) {
          c.push('<button class="btn-leave-queue-full" data-leave="' + escapeHtml(q.id) + '" type="button">' + icon('xCircle', 18) + ' Leave Queue</button>');
        }

        if (q.status === 'raiding') {
          c.push('<button class="btn-start-raid" data-finish-raiding="' + escapeHtml(q.id) + '" type="button">' + icon('checkCircle', 16) + ' Finish Raiding</button>');
        }

        if (q.status === 'done') {
          c.push('<div class="queue-action-row">');
          if (rb && rb.id) {
            c.push('<button class="btn-primary" style="flex:1" data-rejoin-boss="' + escapeHtml(String(rb.id)) + '" data-cleanup-queue="' + escapeHtml(q.id) + '" type="button">' + icon('refreshCw', 16) + ' Raid this pokemon again</button>');
          }
          c.push('<button class="btn-leave-queue" data-delete-queue="' + escapeHtml(q.id) + '" type="button" title="Remove from list">' + icon('xCircle', 18) + '</button>');
          c.push('</div>');
        }

        if (hasConflict) {
          c.push('<div class="conflict-alert">Time conflict detected with another invited/confirmed queue.</div>');
          c.push('<div style="display:flex;gap:0.5rem;margin-top:0.5rem">');
          c.push('  <button class="btn-primary" style="flex:1;font-size:0.8125rem;padding:0.5rem" data-keep="' + escapeHtml(q.id) + '">Keep this</button>');
          c.push('</div>');
        }

        if (raid && isTerminalRaidStatus(raid.status)) {
          var terminalLabel = raid.status === 'completed' ? 'This raid has been completed.' : 'This raid was cancelled.';
          c.push('<div class="alert-warning" style="margin-top:0.5rem">' + icon('xCircle', 16) + ' ' + escapeHtml(terminalLabel) + '</div>');
        }

        c.push('</div>');
        html.push(c.join('\n'));
      });

      html.push('  </div>');
      html.push('</section>');
    }

    return html.join('\n');
  };
})(window);
