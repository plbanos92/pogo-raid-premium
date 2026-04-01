(function (global) {
  var AppConstants = global.AppConstants;
  if (!AppConstants) {
    throw new Error('[AppHtml] constants.js must load before html.js — check index.html script order');
  }

  var ICON_PATHS = {
    users:    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    swords:   '<path d="M14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><path d="M13 19l6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4"/><path d="m7 17-3 3"/><path d="m3 19 2 2"/>',
    crown:    '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5.21 16.5h13.58"/>',
    clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    xCircle:  '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    alert:    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    check:    '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    zap:      '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    star:     '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    shield:   '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    user:     '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clipboard:'<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    qrCode:   '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
    plus:     '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'plus-circle': '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
    list:     '<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    pencil:   '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    menu:     '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    x:        '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    info:       '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    refreshCw:  '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    trash:      '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'
  };

  var CURRENT_BOSS_SILHOUETTES = {
    94: "/assets/silhouettes/gif/94.gif",
    150: "/assets/silhouettes/gif/150.gif",
    249: "/assets/silhouettes/gif/249.gif",
    250: "/assets/silhouettes/gif/250.gif",
    382: "/assets/silhouettes/gif/382.gif",
    383: "/assets/silhouettes/gif/383.gif",
    384: "/assets/silhouettes/gif/384.gif"
  };

  function icon(name, w, h) {
    var s = w || 20;
    var sh = h || s;
    return '<svg width="' + s + '" height="' + sh + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || '') + '</svg>';
  }

  function personSvg(sz) {
    var s = sz || 22;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="7.5" r="4.5"/><path d="M4 21a8 8 0 0 1 16 0z"/></svg>';
  }

  function escapeHtml(value) {
    return (value || "").toString()
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var HAMBURGER_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>';

  function viewTitleHtml(iconKey, text, opts) {
    opts = opts || {};
    var isVip = !!opts.vip;
    var gradientClass = isVip ? ' vip-gradient' : '';
    var accentClass = isVip ? ' vip' : '';
    var iconClass = isVip ? ' vip' : '';
    return [
      '<div class="view-title-wrap">',
      '  <div class="view-title-row">',
      '    <span class="view-title-icon' + iconClass + '">' + icon(iconKey, 22) + '</span>',
      '    <h1 class="view-title' + gradientClass + '">' + escapeHtml(text) + '</h1>',
      '    <button class="navbar-hamburger" data-open-drawer aria-label="Open menu" type="button">' + HAMBURGER_SVG + '</button>',
      '  </div>',
      '  <div class="view-title-accent' + accentClass + '"></div>',
      '</div>'
    ].join('\n');
  }

  function formatTier(tier) {
    var n = Number(tier);
    if (n === 6) return "Mega";
    if (n === 5) return "5-Star";
    if (n === 3) return "3-Star";
    if (n === 1) return "1-Star";
    return "Tier " + (n || "?");
  }

  function renderTierStars(tier) {
    var n = Number(tier);
    if (n === 6) return '<span class="admin-tier-stars">Mega</span>';
    if (!n || n < 1) return '';
    var stars = '';
    for (var i = 0; i < Math.min(n, 5); i++) stars += '★';
    return '<span class="admin-tier-stars">' + stars + '</span>';
  }

  function renderTrainerMeta(team, level, className) {
    var chips = [];
    if (team) {
      chips.push('<span class="team-badge team-' + escapeHtml(team) + '">' + escapeHtml(team.charAt(0).toUpperCase() + team.slice(1)) + '</span>');
    }
    if (level) {
      chips.push('<span class="level-badge">Lv. ' + escapeHtml(String(level)) + '</span>');
    }
    if (!chips.length) return '';
    return '<div class="' + escapeHtml(className || 'trainer-meta-row') + '">' + chips.join('') + '</div>';
  }

  function getTrainerDisplayName(entry) {
    return (entry && (entry.in_game_name || entry.display_name)) || "Player";
  }

  function formatFriendCode(fc) {
    var digits = (fc || "").replace(/\D/g, "").substring(0, AppConstants.FRIEND_CODE_LENGTH);
    if (!digits) return "";
    var groups = digits.match(new RegExp('.{1,' + AppConstants.FRIEND_CODE_BLOCK + '}', 'g'));
    return groups ? groups.join(" ") : digits;
  }

  function buildFriendCodeDeepLink(friendCode) {
    var cleanCode = (friendCode || "").replace(/\D/g, "");
    if (cleanCode.length !== AppConstants.FRIEND_CODE_LENGTH) return null;
    return "https://pokemon-go.onelink.me/nBRb?af_dp=pokemongo://&deep_link_value=dl_action%3DAddFriend%2CDlId%3D" + cleanCode;
  }

  function getBossDisplayImage(boss) {
    var pokemonId = Number(boss && boss.pokemon_id);
    if (pokemonId && CURRENT_BOSS_SILHOUETTES[pokemonId]) {
      return CURRENT_BOSS_SILHOUETTES[pokemonId];
    }
    if (boss && boss.image_url) return boss.image_url;
    var text = encodeURIComponent(((boss && boss.name) || "Boss").slice(0, 20));
    return "https://placehold.co/300x300?text=" + text;
  }

  global.AppHtml = {
    ICON_PATHS: ICON_PATHS,
    icon: icon,
    personSvg: personSvg,
    escapeHtml: escapeHtml,
    viewTitleHtml: viewTitleHtml,
    formatTier: formatTier,
    renderTierStars: renderTierStars,
    renderTrainerMeta: renderTrainerMeta,
    getTrainerDisplayName: getTrainerDisplayName,
    formatFriendCode: formatFriendCode,
    buildFriendCodeDeepLink: buildFriendCodeDeepLink,
    getBossDisplayImage: getBossDisplayImage
  };
})(window);
