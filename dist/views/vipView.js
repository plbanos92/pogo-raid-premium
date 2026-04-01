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
    var glow = '<div class="glow"></div>';
    var cfg = state.appConfig || {};
    var vipPrice = cfg.vip_price || '$4.99';
    var vipPricePeriod = cfg.vip_price_period || '/mo';
    var freeCapacity = cfg.host_capacity_free || 5;
    var features = Array.isArray(cfg.vip_features) ? cfg.vip_features : [
      { icon: 'zap', text: 'Priority Queue Placement' },
      { icon: 'star', text: 'Host up to 10 players' },
      { icon: 'shield', text: 'Ad-free experience' },
      { icon: 'crown', text: 'Exclusive Discord role' }
    ];

    updateRenderedHtml(wrap, [
      '<div class="vip-header">',
      '  <button class="navbar-hamburger vip-header-hamburger" data-open-drawer aria-label="Open menu" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg></button>',
      '  <div class="vip-crown-wrap">' + icon("crown", 40) + '</div>',
      '  <h1 class="vip-page-title">RaidSync <span class="vip-gradient">VIP</span></h1>',
      '  <p class="vip-page-desc">Skip the lines, match faster, and dominate raids with exclusive features tailored for dedicated raiders.</p>',
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
      '    <button class="btn-upgrade ' + (isVip ? 'is-vip' : 'not-vip') + '" id="vipUpgradeBtn"' + (isVip ? ' disabled' : '') + '>' + (isVip ? 'VIP Active' : 'Upgrade to VIP') + '</button>',
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
      '    <button class="btn-downgrade" id="vipDowngradeBtn"' + (isVip ? '' : ' disabled') + '>' + (isVip ? 'Downgrade to Free' : 'Current Plan') + '</button>',
      '  </div>',

      '</div>'
    ].join("\n"));
  };
})(window);
