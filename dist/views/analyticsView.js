/**
 * Analytics admin panel — renders totals, daily breakdown, hourly heatmap,
 * top paths/views/countries/cities/browsers/OS/devices/languages/referrers,
 * and a tail of the most recent hits.
 *
 * Data arrives via api.getAnalyticsSummary(days) returning the jsonb blob
 * produced by public.get_analytics_summary(p_days). That RPC is admin-gated.
 */
(function (global) {
  var AppViews = global.AppViews = global.AppViews || {};

  function esc(s) { return global.AppUtils && global.AppUtils.escapeHtml ? global.AppUtils.escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }

  function fmtInt(n) {
    n = Number(n || 0);
    return n.toLocaleString();
  }

  function fmtPct(part, total) {
    if (!total) return '0%';
    return Math.round((part / total) * 100) + '%';
  }

  function statCard(label, value, sub) {
    return [
      '<div class="analytics-stat-card">',
      '  <div class="analytics-stat-label">' + esc(label) + '</div>',
      '  <div class="analytics-stat-value">' + esc(fmtInt(value)) + '</div>',
      sub ? '  <div class="analytics-stat-sub">' + esc(sub) + '</div>' : '',
      '</div>'
    ].join('');
  }

  function barRow(label, hits, maxHits, sub) {
    var pct = maxHits > 0 ? Math.max(2, Math.round((hits / maxHits) * 100)) : 0;
    return [
      '<div class="analytics-bar-row">',
      '  <div class="analytics-bar-label" title="' + esc(label) + '">' + esc(label) + '</div>',
      '  <div class="analytics-bar-track">',
      '    <div class="analytics-bar-fill" style="width:' + pct + '%"></div>',
      '    <div class="analytics-bar-value">' + esc(fmtInt(hits)) + (sub ? ' <span class="analytics-bar-sub">' + esc(sub) + '</span>' : '') + '</div>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function renderBarList(title, rows, labelField, opts) {
    opts = opts || {};
    if (!rows || !rows.length) {
      return [
        '<div class="analytics-block">',
        '  <h3 class="analytics-block-title">' + esc(title) + '</h3>',
        '  <div class="analytics-empty">No data yet.</div>',
        '</div>'
      ].join('');
    }
    var max = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i].hits > max) max = rows[i].hits;
    var html = ['<div class="analytics-block">',
      '<h3 class="analytics-block-title">' + esc(title) + '</h3>',
      '<div class="analytics-bar-list">'];
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      var label = r[labelField];
      if (opts.fallbackEmpty && (!label || label === '')) label = '(unknown)';
      if (opts.cityFormat && r.country) label = label + ', ' + r.country;
      var sub = r.visitors != null ? fmtInt(r.visitors) + ' visitors' : '';
      html.push(barRow(label || '(unknown)', r.hits, max, sub));
    }
    html.push('</div></div>');
    return html.join('');
  }

  function renderDailyChart(rows) {
    if (!rows || !rows.length) {
      return '<div class="analytics-empty">No hits in this range yet.</div>';
    }
    var max = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i].hits > max) max = rows[i].hits;
    var bars = [];
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      var h = max > 0 ? Math.max(4, Math.round((r.hits / max) * 100)) : 0;
      bars.push(
        '<div class="analytics-day-col" title="' + esc(r.day + ' — ' + fmtInt(r.hits) + ' hits, ' + fmtInt(r.visitors) + ' visitors') + '">' +
          '<div class="analytics-day-bar" style="height:' + h + '%"></div>' +
          '<div class="analytics-day-label">' + esc(r.day.slice(5)) + '</div>' +
        '</div>'
      );
    }
    return '<div class="analytics-day-chart">' + bars.join('') + '</div>';
  }

  function renderHourlyChart(rows) {
    var byHour = new Array(24);
    for (var h = 0; h < 24; h++) byHour[h] = 0;
    if (rows && rows.length) {
      for (var i = 0; i < rows.length; i++) {
        var hr = Number(rows[i].hour);
        if (hr >= 0 && hr < 24) byHour[hr] = Number(rows[i].hits || 0);
      }
    }
    var max = 0;
    for (var k = 0; k < 24; k++) if (byHour[k] > max) max = byHour[k];
    var cells = [];
    for (var m = 0; m < 24; m++) {
      var intensity = max > 0 ? byHour[m] / max : 0;
      var alpha = intensity === 0 ? 0.06 : 0.2 + intensity * 0.8;
      cells.push(
        '<div class="analytics-hour-cell" style="background:rgba(79,70,229,' + alpha.toFixed(2) + ')" title="' + esc(m + ':00 UTC — ' + fmtInt(byHour[m]) + ' hits') + '">' +
          '<span class="analytics-hour-label">' + m + '</span>' +
        '</div>'
      );
    }
    return '<div class="analytics-hour-grid">' + cells.join('') + '</div>';
  }

  function fmtMs(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    var v = Number(n);
    if (v >= 1000) return (v / 1000).toFixed(2) + ' s';
    return Math.round(v) + ' ms';
  }

  function renderPerfBlock(perf) {
    if (!perf || !perf.samples) {
      return [
        '<div class="analytics-block">',
        '  <h3 class="analytics-block-title">Performance (page load)</h3>',
        '  <div class="analytics-empty">No performance samples yet.</div>',
        '</div>'
      ].join('');
    }
    var cards = [
      statCard('Samples',   perf.samples,         'page_load_ms'),
      statCard('Avg load',  perf.avg_page_load_ms, fmtMs(perf.avg_page_load_ms)),
      statCard('p50 load',  perf.p50_page_load_ms, fmtMs(perf.p50_page_load_ms)),
      statCard('p95 load',  perf.p95_page_load_ms, fmtMs(perf.p95_page_load_ms)),
      statCard('p50 FCP',   perf.p50_fcp_ms,       fmtMs(perf.p50_fcp_ms)),
      statCard('p95 FCP',   perf.p95_fcp_ms,       fmtMs(perf.p95_fcp_ms))
    ].join('');
    return [
      '<div class="analytics-block">',
      '  <h3 class="analytics-block-title">Performance (page load)</h3>',
      '  <div class="analytics-stat-grid">' + cards + '</div>',
      '</div>'
    ].join('');
  }

  function renderRecentRows(rows) {    if (!rows || !rows.length) {
      return '<div class="analytics-empty">No recent hits.</div>';
    }
    var out = ['<div class="analytics-recent-table"><table><thead><tr>',
      '<th>When</th><th>View</th><th>Path</th><th>Where</th><th>Device</th><th>Visitor</th>',
      '</tr></thead><tbody>'];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var when = r.created_at ? new Date(r.created_at).toLocaleString() : '—';
      var where = [r.city, r.country].filter(function (x) { return !!x; }).join(', ') || '—';
      var dev = [r.browser, r.os, r.device_type].filter(function (x) { return !!x; }).join(' · ') || '—';
      var vid = r.visitor_id ? r.visitor_id.slice(0, 8) : '—';
      out.push('<tr>',
        '<td>' + esc(when) + '</td>',
        '<td>' + esc(r.view_name || '—') + '</td>',
        '<td class="analytics-recent-path" title="' + esc(r.path || '') + '">' + esc(r.path || '—') + '</td>',
        '<td>' + esc(where) + '</td>',
        '<td>' + esc(dev) + '</td>',
        '<td><code>' + esc(vid) + '</code>' + (r.user_id ? ' <span class="analytics-badge-authed">authed</span>' : '') + '</td>',
        '</tr>');
    }
    out.push('</tbody></table></div>');
    return out.join('');
  }

  AppViews.renderAnalyticsPanel = function (state, deps) {
    var icon = deps && deps.icon ? deps.icon : function () { return ''; };
    var data = state.analyticsData || null;
    var loading = !!state.analyticsLoading;
    var err = state.analyticsError || null;
    var days = state.analyticsDays || 7;

    var ranges = [
      { k: 1,   label: '24h' },
      { k: 7,   label: '7d' },
      { k: 30,  label: '30d' },
      { k: 90,  label: '90d' },
      { k: 365, label: '1y' }
    ];
    var rangeBtns = ranges.map(function (r) {
      return '<button class="analytics-range-btn' + (r.k === days ? ' active' : '') +
        '" data-analytics-range="' + r.k + '">' + esc(r.label) + '</button>';
    }).join('');

    var totals = data && data.totals ? data.totals : null;
    var lifetime = data && data.lifetime ? data.lifetime : null;

    var headerHtml = [
      '<div class="analytics-header">',
      '  <div class="analytics-header-title">',
      '    ' + icon('activity', 18),
      '    <h2>Visitor Analytics</h2>',
      '  </div>',
      '  <div class="analytics-header-actions">',
      '    <div class="analytics-range-bar">' + rangeBtns + '</div>',
      '    <button class="btn-secondary analytics-refresh-btn" data-analytics-refresh>' + icon('refreshCw', 14) + ' Refresh</button>',
      '  </div>',
      '</div>'
    ].join('');

    if (err) {
      return [
        headerHtml,
        '<div class="alert-warning">' + icon('xCircle', 16) + ' Failed to load analytics: ' + esc(err) + '</div>'
      ].join('');
    }

    if (loading && !data) {
      return [
        headerHtml,
        '<div class="analytics-loading">' + icon('loader', 18) + ' Loading analytics…</div>'
      ].join('');
    }

    if (!data) {
      return [
        headerHtml,
        '<div class="alert-info">' + icon('info', 16) + ' Switch to this tab to load stats.</div>'
      ].join('');
    }

    var cards = [
      statCard('Hits', totals ? totals.hits : 0, 'last ' + days + 'd'),
      statCard('Unique visitors', totals ? totals.unique_visitors : 0, 'last ' + days + 'd'),
      statCard('Unique sessions', totals ? totals.unique_sessions : 0, 'last ' + days + 'd'),
      statCard('New sessions', totals ? (totals.new_sessions || 0) : 0, 'session starts'),
      statCard('New visitors', totals ? (totals.new_visitors || 0) : 0, 'first-time'),
      statCard('Authed visitors', totals ? totals.authed_visitors : 0, 'signed in'),
      statCard('Anonymous', totals ? totals.anon_visitors : 0, 'not signed in'),
      statCard('Countries', totals ? totals.countries : 0, 'reached'),
      statCard('PWA hits', totals ? (totals.pwa_hits || 0) : 0, 'installed app'),
      statCard('Bot hits', totals ? (totals.bot_hits || 0) : 0, 'navigator.webdriver'),
      statCard('Lifetime hits', lifetime ? lifetime.hits : 0, 'all-time'),
      statCard('Lifetime visitors', lifetime ? lifetime.visitors : 0, 'all-time')
    ].join('');

    return [
      headerHtml,
      '<div class="analytics-stat-grid">' + cards + '</div>',

      '<div class="analytics-block">',
      '  <h3 class="analytics-block-title">Hits per day</h3>',
      '  ' + renderDailyChart(data.daily),
      '</div>',

      '<div class="analytics-block">',
      '  <h3 class="analytics-block-title">Hits by hour (UTC, last ' + days + 'd)</h3>',
      '  ' + renderHourlyChart(data.hourly),
      '</div>',

      '<div class="analytics-two-col">',
      renderBarList('Top in-app views', data.top_views, 'view'),
      renderBarList('Top paths', data.top_paths, 'path'),
      '</div>',

      '<div class="analytics-two-col">',
      renderBarList('Top countries', data.countries, 'country'),
      renderBarList('Top cities', data.cities, 'city', { cityFormat: true }),
      '</div>',

      '<div class="analytics-two-col">',
      renderBarList('Browsers', data.browsers, 'browser'),
      renderBarList('Operating systems', data.os, 'os'),
      '</div>',

      '<div class="analytics-two-col">',
      renderBarList('Device types', data.devices, 'device_type'),
      renderBarList('Languages', data.languages, 'language'),
      '</div>',

      '<div class="analytics-two-col">',
      renderBarList('Screen orientation', data.orientations, 'orientation'),
      renderBarList('Network quality', data.effective_types, 'effective_type'),
      '</div>',

      renderPerfBlock(data.perf),

      '<div class="analytics-two-col">',
      renderBarList('UTM sources', data.utm_sources, 'source'),
      renderBarList('UTM mediums', data.utm_mediums, 'medium'),
      '</div>',

      '<div class="analytics-two-col">',
      renderBarList('UTM campaigns', data.utm_campaigns, 'campaign'),
      renderBarList('Navigation type', data.nav_types, 'nav_type', { fallbackEmpty: true }),
      '</div>',

      '<div class="analytics-block">',
      '  <h3 class="analytics-block-title">Top entry pages (new sessions)</h3>',
      '  ' + (data.entry_paths && data.entry_paths.length
          ? data.entry_paths.map(function (r, idx) {
              var maxS = data.entry_paths[0].sessions || 1;
              return barRow(r.path || '(root)', r.sessions, maxS, fmtInt(r.sessions) + ' sessions');
            }).join('')
          : '<div class="analytics-empty">No new sessions recorded yet.</div>'),
      '</div>',

      '<div class="analytics-block">',
      '  <h3 class="analytics-block-title">Top referrers</h3>',
      '  ' + (data.referrers && data.referrers.length
          ? data.referrers.map(function (r) {
              return barRow(r.referrer_host || '(direct)', r.hits, data.referrers[0].hits, '');
            }).join('')
          : '<div class="analytics-empty">All traffic is direct / in-app navigation.</div>'),
      '</div>',

      '<div class="analytics-block">',
      '  <h3 class="analytics-block-title">Recent hits</h3>',
      '  ' + renderRecentRows(data.recent),
      '</div>'
    ].join('');
  };
})(window);
