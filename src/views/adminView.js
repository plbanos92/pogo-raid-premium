(function (global) {
  var AppViews = global.AppViews = global.AppViews || {};

  function getBossStatus(boss) {
    var now = Date.now();
    if (!boss.is_visible) return "hidden";
    var fromMs = boss.available_from ? new Date(boss.available_from).getTime() : null;
    var untilMs = boss.available_until ? new Date(boss.available_until).getTime() : null;
    if (fromMs && fromMs > now) return "scheduled";
    if (untilMs && untilMs <= now) return "expired";
    return "active";
  }

  function renderBossStatusBadge(boss) {
    var status = getBossStatus(boss);
    var labels = { active: "Active", scheduled: "Scheduled", hidden: "Hidden", expired: "Expired" };
    return '<span class="boss-status-badge boss-status-' + status + '">' + (labels[status] || status) + '</span>';
  }

  function fmtDatetimeLocal(isoStr) {
    if (!isoStr) return "";
    return isoStr.substring(0, 16);
  }

  function renderAdminBossForm(boss, deps) {
    var escapeHtml = deps.escapeHtml;
    var fmt = deps.fmtDatetimeLocal;

    var id = boss ? escapeHtml(boss.id) : "";
    var isEdit = !!boss;
    var typesStr = boss && Array.isArray(boss.types) ? boss.types.join(", ") : (boss && boss.types ? boss.types : "");
    var tierOptions = [
      { v: '', label: '—' },
      { v: '1', label: '★ 1-Star' },
      { v: '2', label: '★★ 2-Star' },
      { v: '3', label: '★★★ 3-Star' },
      { v: '4', label: '★★★★ 4-Star' },
      { v: '5', label: '★★★★★ 5-Star' },
      { v: '6', label: 'Mega' }
    ];

    var tierHtml = tierOptions.map(function (o) {
      var sel = boss && String(boss.tier) === o.v ? ' selected' : '';
      return '<option value="' + o.v + '"' + sel + '>' + o.label + '</option>';
    }).join('');

    return [
      '<form class="admin-boss-form" data-boss-id="' + id + '" data-mode="' + (isEdit ? "edit" : "add") + '">',
      '  <div class="form-group">',
      '    <label class="form-group-label">Name <span class="required-star">*</span></label>',
      '    <input class="form-input" name="name" type="text" required maxlength="100" value="' + (boss ? escapeHtml(boss.name) : "") + '" placeholder="e.g. Mega Rayquaza">',
      '  </div>',
      '  <div class="form-row">',
      '    <div class="form-group">',
      '      <label class="form-group-label">Tier <span class="required-star">*</span></label>',
      '      <select class="form-input" name="tier" required>' + tierHtml + '</select>',
      '    </div>',
      '    <div class="form-group">',
      '      <label class="form-group-label">Pokémon ID <span class="required-star">*</span></label>',
      '      <input class="form-input" name="pokemon_id" type="number" min="1" required value="' + (boss && boss.pokemon_id ? escapeHtml(String(boss.pokemon_id)) : "") + '" placeholder="384">',
      '    </div>',
      '    <div class="form-group">',
      '      <label class="form-group-label">CP</label>',
      '      <input class="form-input" name="cp" type="number" min="0" value="' + (boss && boss.cp ? escapeHtml(String(boss.cp)) : "") + '" placeholder="45202">',
      '    </div>',
      '  </div>',
      '  <div class="form-group">',
      '    <label class="form-group-label">Types (comma-separated)</label>',
      '    <input class="form-input" name="types" type="text" value="' + escapeHtml(typesStr) + '" placeholder="Dragon, Flying">',
      '  </div>',
      '  <div class="form-group">',
      '    <label class="form-group-label">Image URL</label>',
      '    <input class="form-input" name="image_url" type="url" value="' + (boss && boss.image_url ? escapeHtml(boss.image_url) : "") + '" placeholder="https://...">',
      '  </div>',
      '  <div class="admin-form-divider"><span>Scheduling</span></div>',
      '  <div class="admin-schedule-row">',
      '    <label class="form-group-label admin-schedule-label">Available From</label>',
      '    <div class="admin-schedule-inputs">',
      '      <input class="form-input" name="available_from_date" type="date" value="' + (boss && boss.available_from ? escapeHtml(fmt(boss.available_from).substring(0, 10)) : "") + '">',
      '      <input class="form-input admin-schedule-time" name="available_from_time" type="time" value="' + (boss && boss.available_from ? escapeHtml(fmt(boss.available_from).substring(11, 16)) : "") + '">',
      '    </div>',
      '  </div>',
      '  <div class="admin-schedule-row">',
      '    <label class="form-group-label admin-schedule-label">Available Until</label>',
      '    <div class="admin-schedule-inputs">',
      '      <input class="form-input" name="available_until_date" type="date" value="' + (boss && boss.available_until ? escapeHtml(fmt(boss.available_until).substring(0, 10)) : "") + '">',
      '      <input class="form-input admin-schedule-time" name="available_until_time" type="time" value="' + (boss && boss.available_until ? escapeHtml(fmt(boss.available_until).substring(11, 16)) : "") + '">',
      '    </div>',
      '  </div>',
      '  <div class="form-group form-checkbox-row">',
      '    <input type="checkbox" name="is_visible" id="' + (isEdit ? "editBossVisible_" + id : "addBossVisible") + '" ' + (!boss || boss.is_visible ? "checked" : "") + '>',
      '    <label class="form-group-label" for="' + (isEdit ? "editBossVisible_" + id : "addBossVisible") + '">Visible</label>',
      '  </div>',
      '  <div class="admin-form-actions">',
      '    <button class="btn-secondary admin-form-cancel" type="button">' + (isEdit ? 'Cancel' : 'Cancel') + '</button>',
      '    <button class="btn-primary" type="submit">' + (isEdit ? "Save Changes" : "Save Boss") + '</button>',
      '  </div>',
      '</form>'
    ].join("\n");
  }

  AppViews.renderAdmin = function renderAdmin(state, deps) {
    deps = deps || {};
    state = state || {};

    var qs = deps.qs || function (id) { return document.getElementById(id); };
    var updateRenderedHtml = deps.updateRenderedHtml || function (el, html) {
      if (el) el.innerHTML = html;
      return true;
    };
    var viewTitleHtml = deps.viewTitleHtml || function () { return ""; };
    var icon = deps.icon || function () { return ""; };
    var escapeHtml = deps.escapeHtml || function (value) { return String(value || ""); };
    var renderTierStars = deps.renderTierStars || function () { return ""; };

    var el = qs("adminContent");
    if (!el) return;
    if (!state.isAdmin) {
      updateRenderedHtml(el, "");
      return;
    }

    var bosses = state.adminBosses || [];
    var editingId = state.adminEditingId;
    var showAdd = state.adminShowAddForm;

    var order = { active: 0, scheduled: 1, expired: 2, hidden: 3 };
    var sorted = bosses.slice().sort(function (a, b) {
      var oa = order[getBossStatus(a)] || 0;
      var ob = order[getBossStatus(b)] || 0;
      if (oa !== ob) return oa - ob;
      if (getBossStatus(a) === 'scheduled' && getBossStatus(b) === 'scheduled') {
        return (a.available_from || '').localeCompare(b.available_from || '');
      }
      if (getBossStatus(a) === 'expired' && getBossStatus(b) === 'expired') {
        return (b.available_until || '').localeCompare(a.available_until || '');
      }
      return (a.name || "").localeCompare(b.name || "");
    });

    var listHtml = sorted.length === 0
      ? '<div class="admin-empty-state"><p>' + icon('clipboard', 32) + '</p><p>No bosses yet — tap <strong>+ Add Boss</strong> to create one.</p></div>'
      : sorted.map(function (boss) {
          var isEditing = editingId === boss.id;
          var statusBadge = renderBossStatusBadge(boss);
          var tierStars = renderTierStars(boss.tier);
          var pidStr = boss.pokemon_id ? 'pokemon_id: ' + escapeHtml(String(boss.pokemon_id)) : '';
          var cpStr = boss.cp ? 'CP: ' + escapeHtml(String(boss.cp)) : '';
          var metaParts = [pidStr, cpStr].filter(Boolean).join('  |  ');
          var fromStr = boss.available_from ? fmtDatetimeLocal(boss.available_from) : '—';
          var untilStr = boss.available_until ? fmtDatetimeLocal(boss.available_until) : '—';
          if (isEditing) {
            return [
              '<div class="admin-boss-card editing" data-boss-id="' + escapeHtml(boss.id) + '">',
              '  <div class="admin-card-header">',
              '    <div class="admin-card-title-row">' + statusBadge + ' <span class="admin-card-label">Editing:</span> <strong>' + escapeHtml(boss.name) + '</strong></div>',
              '    <button class="admin-cancel-edit" data-boss-id="' + escapeHtml(boss.id) + '" title="Cancel">' + icon('xCircle', 18) + '</button>',
              '  </div>',
              '  <div class="admin-card-body">',
              renderAdminBossForm(boss, { escapeHtml: escapeHtml, fmtDatetimeLocal: fmtDatetimeLocal }),
              '  </div>',
              '</div>'
            ].join("\n");
          }
          return [
            '<div class="admin-boss-card" data-boss-id="' + escapeHtml(boss.id) + '">',
            '  <div class="admin-card-header">',
            '    <div class="admin-card-title-row">' + statusBadge + ' <strong>' + escapeHtml(boss.name) + '</strong> ' + tierStars + '</div>',
            '    <button class="admin-edit-boss" data-boss-id="' + escapeHtml(boss.id) + '" title="Edit">' + icon('pencil', 16) + '</button>',
            '  </div>',
            metaParts ? '  <div class="admin-card-meta">' + metaParts + '</div>' : '',
            '  <div class="admin-card-meta">From: ' + escapeHtml(fromStr) + '  &nbsp;→&nbsp;  To: ' + escapeHtml(untilStr) + '</div>',
            '</div>'
          ].join("\n");
        }).join("\n");

    var addFormHtml = showAdd ? [
      '<div class="admin-add-form-wrap">',
      '  <div class="admin-add-form-header">',
      '    <h2 class="admin-add-form-title">Add New Boss</h2>',
      '    <button class="admin-close-add" title="Close">' + icon('xCircle', 18) + '</button>',
      '  </div>',
      renderAdminBossForm(null, { escapeHtml: escapeHtml, fmtDatetimeLocal: fmtDatetimeLocal }),
      '</div>'
    ].join("\n") : '';

    updateRenderedHtml(el, [
      '<div class="view-header">',
      viewTitleHtml('shield', 'Admin: Raid Bosses'),
      '  <button class="btn-primary admin-toggle-add" id="adminToggleAdd" type="button">' + icon('plus', 16) + ' Add Boss</button>',
      '</div>',
      addFormHtml,
      '<div id="adminBossList">' + listHtml + '</div>'
    ].join("\n"));
  };
})(window);
