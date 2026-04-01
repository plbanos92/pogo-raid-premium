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

  function renderAuditConfigPanel(state, deps) {
    var escapeHtml = deps.escapeHtml || function (v) { return String(v || ''); };
    var icon = deps.icon || function () { return ''; };
    var cfg = (state.appConfig && state.appConfig.audit_config) || {};
    var enabled = cfg.enabled !== false;
    var flushMs = cfg.flush_interval_ms || 5000;
    var bufMax = cfg.buffer_max || 50;
    var cats = cfg.categories || {};

    var allCategories = [
      { key: 'session',   label: 'Session',    locked: true },
      { key: 'error',     label: 'Error',      locked: true },
      { key: 'ui',        label: 'UI Clicks',  hint: 'High volume' },
      { key: 'nav',       label: 'Navigation', hint: 'High volume' },
      { key: 'data',      label: 'Data',       hint: 'High volume' },
      { key: 'queue',     label: 'Queue' },
      { key: 'host',      label: 'Host' },
      { key: 'lifecycle', label: 'Lifecycle' },
      { key: 'realtime',  label: 'Realtime' },
      { key: 'account',   label: 'Account' },
      { key: 'admin',     label: 'Admin' }
    ];

    var catItems = allCategories.map(function (c) {
      var checked = c.locked || cats[c.key] !== false;
      var disabled = c.locked ? ' disabled' : '';
      var hintHtml = c.locked
        ? ' <span class="audit-cat-hint audit-cat-hint--locked">always on</span>'
        : c.hint
          ? ' <span class="audit-cat-hint audit-cat-hint--warn">' + escapeHtml(c.hint) + '</span>'
          : '';
      return '<div class="audit-cat-item">' +
        '<input type="checkbox" id="audit_cat_' + c.key + '" name="audit_cat_' + c.key + '" value="' + c.key + '"' + (checked ? ' checked' : '') + disabled + '>' +
        '<label for="audit_cat_' + c.key + '">' + escapeHtml(c.label) + hintHtml + '</label>' +
        '</div>';
    }).join('\n');

    return [
      '<div class="card" id="auditConfigCard">',
      '  <div class="card-header">',
      '    <h2 class="card-header-title">' + icon('shield', 16) + ' Audit Configuration</h2>',
      '  </div>',
      '  <div class="card-body">',
      '    <div class="audit-master-toggle">',
      '      <input type="checkbox" id="auditEnabledToggle"' + (enabled ? ' checked' : '') + '>',
      '      <label for="auditEnabledToggle">Session auditing ' + (enabled ? 'enabled' : 'disabled') + '</label>',
      '    </div>',
      '    <div class="audit-tuning-row">',
      '      <div class="audit-tuning-item">',
      '        <label for="auditFlushMs">Flush interval (ms)</label>',
      '        <input class="form-input" id="auditFlushMs" type="number" min="1000" max="60000" value="' + escapeHtml(String(flushMs)) + '">',
      '      </div>',
      '      <div class="audit-tuning-item">',
      '        <label for="auditBufferMax">Buffer max</label>',
      '        <input class="form-input" id="auditBufferMax" type="number" min="1" max="500" value="' + escapeHtml(String(bufMax)) + '">',
      '      </div>',
      '    </div>',
      '    <div style="margin-bottom:0.5rem">',
      '      <label class="form-group-label">Event categories</label>',
      '    </div>',
      '    <div class="audit-cat-grid">',
      catItems,
      '    </div>',
      '    <button class="btn-primary" id="saveAuditConfigBtn" type="button">Save Configuration</button>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function renderAuditPurgePanel(deps) {
    var icon = (deps && deps.icon) || function () { return ''; };
    return [
      '<div class="danger-zone" id="auditPurgeCard">',
      '  <div class="danger-zone-header">' + icon('alert', 16) + ' Danger Zone</div>',
      '  <div class="danger-zone-body">',
      '    <div class="danger-zone-section">',
      '      <div class="danger-zone-label">Purge by user</div>',
      '      <div class="danger-zone-hint">Delete all audit sessions and events for a single user by email.</div>',
      '      <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">',
      '        <input class="form-input" id="purgeAuditEmail" type="email" placeholder="user@example.com" style="flex:1;min-width:0">',
      '        <button class="btn-danger" id="purgeUserAuditBtn" type="button" disabled>Purge User</button>',
      '      </div>',
      '    </div>',
      '    <hr class="danger-zone-divider">',
      '    <div class="danger-zone-section">',
      '      <div class="danger-zone-label">Purge all users</div>',
      '      <div class="danger-zone-hint">Permanently delete the entire audit trail for every user. This cannot be undone.</div>',
      '      <button class="btn-danger" id="purgeAllAuditBtn" type="button">Purge ALL Audit Trail</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
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

    var realtimeSlots = state.appConfig ? (typeof state.appConfig.realtime_slots === 'number' ? state.appConfig.realtime_slots : '') : '';
    var activeTab = state.adminTab || 'bosses';

    updateRenderedHtml(el, [
      '<div class="view-header">',
      viewTitleHtml('shield', 'Admin'),
      '</div>',
      '<div class="admin-tab-bar">',
      '  <button class="admin-tab' + (activeTab === 'bosses' ? ' active' : '') + '" data-admin-tab="bosses">Bosses</button>',
      '  <button class="admin-tab' + (activeTab === 'settings' ? ' active' : '') + '" data-admin-tab="settings">App Settings</button>',
      '  <button class="admin-tab' + (activeTab === 'audit' ? ' active' : '') + '" data-admin-tab="audit">Audit</button>',
      '</div>',
      '<div class="admin-tab-panel' + (activeTab === 'bosses' ? ' active' : '') + '">',
      '  <button class="btn-primary admin-toggle-add" id="adminToggleAdd" type="button">' + icon('plus', 16) + ' Add Boss</button>',
      addFormHtml,
      '  <div id="adminBossList">' + listHtml + '</div>',
      '</div>',
      '<div class="admin-tab-panel' + (activeTab === 'settings' ? ' active' : '') + '">',
      '  <div class="admin-settings-card card">',
      '    <div class="card-header">',
      '      <h2 class="card-header-title">' + icon('zap', 16) + ' App Settings</h2>',
      '    </div>',
      '    <div class="card-body">',
      '      <div class="form-group">',
      '        <label class="form-group-label" for="realtimeSlotsInput">Realtime Slots</label>',
      '        <p class="form-group-hint">Capacity ceiling for concurrent realtime WebSocket sessions. Set to 0 to disable realtime for all users.</p>',
      '        <div class="form-row form-row--inline">',
      '          <input class="form-input" id="realtimeSlotsInput" type="number" min="0" max="9999" value="' + escapeHtml(String(realtimeSlots)) + '" placeholder="150" style="max-width:120px">',
      '          <button class="btn-primary" id="saveRealtimeSlotsBtn" type="button">Save</button>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>',
      '<div class="admin-tab-panel' + (activeTab === 'audit' ? ' active' : '') + '" id="admin-panel-audit">',
      renderAuditConfigPanel(state, { escapeHtml: escapeHtml, icon: icon }),
      renderAuditPurgePanel({ icon: icon }),
      '</div>'
    ].join("\n"));
  };
})(window);
