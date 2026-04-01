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

  AppViews.renderHostBossSelect = function renderHostBossSelect(state, deps) {
    deps = deps || {};
    state = state || {};

    var qs = deps.qs || function (id) { return document.getElementById(id); };
    var formPersist = deps.formPersist || { load: function () { return null; } };

    var select = qs("hostBossSelect");
    if (!select) return;

    var raidBosses = Array.isArray(state.raidBosses) ? state.raidBosses : [];
    var bosses = Array.isArray(state.bosses) ? state.bosses : [];
    var options = raidBosses.length ? raidBosses : bosses;

    if (!options.length) {
      select.innerHTML = '<option value="">No raid bosses available</option>';
      select.disabled = true;
      return;
    }

    select.disabled = false;
    var current = select.value;
    var persisted = formPersist.load('hostForm', 'hostBossSelect');

    select.innerHTML = options.map(function (boss) {
      return '<option value="' + escapeHtml(boss.id) + '">' +
        escapeHtml(boss.name || "Unknown") + ' (Tier ' + escapeHtml(formatTier(boss.tier)) + ')</option>';
    }).join("");

    if (current && options.some(function (boss) { return boss.id === current; })) {
      select.value = current;
    } else if (persisted && options.some(function (boss) { return boss.id === persisted; })) {
      select.value = persisted;
    }
  };

  AppViews.renderHostSuccess = function renderHostSuccess(state, deps) {
    deps = deps || {};
    state = state || {};

    var qs = deps.qs || function (id) { return document.getElementById(id); };
    var slot = qs("hostSuccessSlot");
    if (!slot) return;
    if (!state.hostSuccess) {
      slot.innerHTML = "";
      return;
    }

    slot.innerHTML = [
      '<div class="host-success">',
      '  <button class="host-success-close" type="button" data-dismiss-host-success aria-label="Dismiss">' + icon("x", 16) + '</button>',
      '  <div class="host-success-icon">' + icon("checkCircle", 40) + '</div>',
      '  <h2>Raid Hosted Successfully!</h2>',
      '  <p>Players are now being matched to your lobby. Check your game for incoming friend requests.</p>',
      '  <div class="host-success-actions">',
      '    <a href="#" class="host-success-link" data-view="queues">Go to My Queues</a>',
      '  </div>',
      '</div>'
    ].join("\n");
  };

  AppViews.renderCancelConfirmModal = function renderCancelConfirmModal(state, deps) {
    deps = deps || {};
    state = state || {};

    var qs = deps.qs || function (id) { return document.getElementById(id); };
    var overlay = qs('modalOverlay');
    var card = qs('modalCard');
    if (!overlay || !card) return;

    if (!state.hostCancelConfirm) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      card.innerHTML = '';
      return;
    }

    card.innerHTML = [
      '<div class="modal-icon amber">' + icon('alertTriangle', 22) + '</div>',
      '<h3>Cancel this raid?</h3>',
      '<p>Players still waiting will be moved to another lobby if one is available.</p>',
      '<div class="modal-actions">',
      '  <button class="btn-secondary" type="button" data-cancel-raid-no="1">Keep Raid</button>',
      '  <button class="btn-danger" type="button" data-cancel-raid-yes="' + escapeHtml(state.hostCancelConfirm) + '">Cancel Raid</button>',
      '</div>'
    ].join('\n');

    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');
  };
})(window);
