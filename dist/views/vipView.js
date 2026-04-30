(function (global) {
  var AppViews = global.AppViews = global.AppViews || {};
  var AppHtml = global.AppHtml || {};

  function icon(name, w, h) {
    return AppHtml.icon(name, w, h);
  }

  function escapeHtml(value) {
    return AppHtml.escapeHtml(value);
  }

  AppViews.renderVip = function renderVip(state, deps) {
    deps = deps || {};
    state = state || {};

    var qs = deps.qs || function (id) { return document.getElementById(id); };
    var updateRenderedHtml = deps.updateRenderedHtml || function (el, html) {
      if (el) el.innerHTML = html;
      return true;
    };

    var wrap = qs("vipContent");
    if (!wrap) return;

    var isVip = !!state.isVip;
    var hasDarkUnlock = !!state.hasDarkUnlock;
    var darkOwned = isVip || hasDarkUnlock; // VIP includes dark mode
    var glow = '<div class="glow"></div>';
    var cfg = state.appConfig || {};
    var ent = state.entitlements || {};
    var paymentsTestMode = ent.paymentsTestMode !== undefined
      ? !!ent.paymentsTestMode
      : (cfg.payments_test_mode !== false);
    var vipPrice = cfg.vip_price || '$4.99';
    var vipPricePeriod = cfg.vip_price_period || '/mo';
    var darkPrice = cfg.dark_unlock_price || '$5';
    var darkPricePeriod = cfg.dark_unlock_price_period || ' one-time';
    var freeCapacity = cfg.host_capacity_free || 5;

    function fmtDate(iso) {
      if (!iso) return '';
      try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
      catch (_) { return ''; }
    }
    var vipStatusLine = '';
    if (isVip && ent.vipCurrentPeriodEnd) {
      vipStatusLine = ent.vipCancelAtPeriodEnd
        ? '<div class="plan-status">Cancels on ' + escapeHtml(fmtDate(ent.vipCurrentPeriodEnd)) + '</div>'
        : '<div class="plan-status">Renews on ' + escapeHtml(fmtDate(ent.vipCurrentPeriodEnd)) + '</div>';
    }
    var features = Array.isArray(cfg.vip_features) ? cfg.vip_features : [
      { icon: 'zap', text: 'Priority Queue Placement' },
      { icon: 'star', text: 'Host up to 10 players' },
      { icon: 'shield', text: 'Ad-free experience' },
      { icon: 'crown', text: 'Exclusive Discord role' },
      { icon: 'moon', text: 'Dark Mode theme included' }
    ];
    var darkFeatures = Array.isArray(cfg.dark_unlock_features) ? cfg.dark_unlock_features : [
      { icon: 'moon', text: 'Full dark theme everywhere' },
      { icon: 'zap', text: 'Smooth neon pills & glow accents' },
      { icon: 'shield', text: 'Fancy gradient QR frame' },
      { icon: 'check', text: 'One-time payment, yours forever' }
    ];

    updateRenderedHtml(wrap, [
      '<div class="vip-header">',
      '  <button class="navbar-hamburger vip-header-hamburger" data-open-drawer aria-label="Open menu" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg></button>',
      '  <div class="vip-crown-wrap">' + icon("crown", 40) + '</div>',
      '  <h1 class="vip-page-title">RaidSync <span class="vip-gradient">VIP</span></h1>',
      '  <p class="vip-page-desc">Skip the lines, match faster, and dominate raids with exclusive features tailored for dedicated raiders.</p>',
      paymentsTestMode ? '  <div class="vip-dev-badge" role="status">DEV MODE — entitlements toggle instantly without payment</div>' : '',
      '</div>',

      '<div class="vip-grid">',

      '  <div class="plan-card premium-plan">',
           glow,
      '    <div class="most-popular">MOST POPULAR</div>',
      '    <div class="plan-name">VIP Access</div>',
      '    <div class="plan-desc">Priority queuing and advanced tools.</div>',
      '    <div class="plan-features">',
           features.map(function (feature) {
             return '<div class="plan-feature"><div class="feature-icon">' + icon(feature.icon, 16) + '</div><span>' + escapeHtml(feature.text) + '</span></div>';
           }).join(""),
      '    </div>',
      '    <div class="plan-price">' + escapeHtml(vipPrice) + '<span class="plan-price-sub">' + escapeHtml(vipPricePeriod) + '</span></div>',
           vipStatusLine,
      '    <button class="btn-upgrade ' + (isVip ? 'is-vip' : 'not-vip') + '" id="vipUpgradeBtn"' + (isVip ? ' disabled' : '') + '>' + (isVip ? 'VIP Active' : 'Upgrade to VIP') + '</button>',
      '  </div>',

      '  <div class="plan-card dark-plan">',
           glow,
      '    <div class="plan-name">Dark Mode</div>',
      '    <div class="plan-desc">Unlock the dark theme without a subscription.</div>',
      '    <div class="plan-features">',
           darkFeatures.map(function (feature) {
             return '<div class="plan-feature"><div class="feature-icon">' + icon(feature.icon, 16) + '</div><span>' + escapeHtml(feature.text) + '</span></div>';
           }).join(""),
      '    </div>',
      '    <div class="plan-price">' + escapeHtml(darkPrice) + '<span class="plan-price-sub">' + escapeHtml(darkPricePeriod) + '</span></div>',
      '    <button class="btn-dark-unlock ' + (darkOwned ? 'is-owned' : 'not-owned') + '" id="darkUnlockBtn"' + (isVip ? ' disabled' : '') + (hasDarkUnlock && !isVip ? ' title="Click to remove Dark Mode unlock"' : '') + '>' + (isVip ? 'Included with VIP' : (hasDarkUnlock ? 'Dark Mode Unlocked' : 'Buy Dark Mode')) + '</button>',
      '  </div>',

      '  <div class="plan-card free-plan">',
           glow,
      '    <div class="plan-name">Free Tier</div>',
      '    <div class="plan-desc">Everything you need to get started.</div>',
      '    <div class="plan-features">',
             ['Access all raid queues', 'Host up to ' + freeCapacity + ' players', 'Standard matchmaking', 'Ad-supported'].map(function (feature) {
               return '<div class="plan-feature"><div class="feature-icon">' + icon("check", 16) + '</div><span>' + feature + '</span></div>';
             }).join(""),
      '    </div>',
      '    <div class="plan-price">$0<span class="plan-price-sub">/mo</span></div>',
      '    <button class="btn-downgrade" id="vipDowngradeBtn"' + (isVip ? '' : ' disabled') + '>' +
            (!isVip
              ? 'Current Plan'
              : (paymentsTestMode
                  ? 'Downgrade to Free'
                  : (ent.vipCancelAtPeriodEnd ? 'Resume Subscription' : 'Cancel Subscription'))) +
            '</button>',
      '  </div>',

      '</div>'
    ].join("\n"));
  };
})(window);
