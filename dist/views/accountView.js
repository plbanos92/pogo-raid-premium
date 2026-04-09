(function (global) {
  var AppViews = global.AppViews = global.AppViews || {};

  AppViews.renderAccount = function renderAccount(state, deps) {
    deps = deps || {};
    state = state || {};

    var qs = deps.qs || function (id) { return document.getElementById(id); };
    var updateRenderedHtml = deps.updateRenderedHtml || function (el, html) {
      if (el) el.innerHTML = html;
      return true;
    };
    var viewTitleHtml = deps.viewTitleHtml || function () { return ""; };
    var isAuthed = deps.isAuthed || function () { return false; };
    var icon = deps.icon || function () { return ""; };
    var escapeHtml = deps.escapeHtml || function (value) { return String(value || ""); };
    var buildFriendCodeDeepLink = deps.buildFriendCodeDeepLink || function () { return ""; };
    var formatFriendCode = deps.formatFriendCode || function (fc) { return fc || ""; };
    var formPersist = deps.formPersist || { load: function () { return null; } };
    var profileEditMode = !!deps.profileEditMode;

    var wrap = qs("accountContent");
    if (!wrap) return;

    var html = [];
    html.push('<div class="view-header" style="margin-bottom:1.5rem">');
    html.push('  <div>');
    html.push(viewTitleHtml('user', 'Account'));

    if (isAuthed()) {
      html.push('    <p class="view-subtitle">Your trainer hub &amp; settings.</p>');
      html.push('  </div>');
      html.push('</div>');

      var prof = state.profile || {};
      var stats = state.accountStats || {};
      var ign = prof.in_game_name || "";
      var fc = prof.friend_code || "";
      var team = prof.team || "";
      var level = prof.trainer_level || "";
      var email = stats.email || "";
      var memberSince = stats.member_since ? new Date(stats.member_since) : null;
      var raidsJoined = stats.raids_joined || 0;
      var raidsHosted = stats.raids_hosted || 0;

      html.push('<div class="account-card account-identity-card">');
      html.push('  <div class="account-identity">');
      html.push('    <div class="account-avatar-lg">' + icon("user", 28) + '</div>');
      html.push('    <div class="account-identity-info">');
      html.push('      <p class="account-name">' + escapeHtml(ign || "Trainer") + '</p>');
      if (email) {
        html.push('      <p class="account-email">' + escapeHtml(email) + '</p>');
      }
      html.push('      <div class="account-badges">');
      if (state.isVip) {
        html.push('        <span class="pill-vip">' + icon("crown", 14) + ' VIP</span>');
      } else {
        html.push('        <span class="account-tier-free">Free Tier</span>');
      }
      if (team) {
        html.push('        <span class="team-badge team-' + escapeHtml(team) + '">' + escapeHtml(team.charAt(0).toUpperCase() + team.slice(1)) + '</span>');
      }
      if (level) {
        html.push('        <span class="level-badge">Lv. ' + escapeHtml(String(level)) + '</span>');
      }
      html.push('      </div>');
      html.push('    </div>');
      html.push('  </div>');
      html.push('</div>');

      var memberStr = memberSince ? memberSince.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '\u2014';
      html.push('<div class="account-stats-row">');
      html.push('  <div class="account-stat-box">');
      html.push('    <span class="account-stat-value">' + raidsJoined + '</span>');
      html.push('    <span class="account-stat-label">Raids Joined</span>');
      html.push('  </div>');
      html.push('  <div class="account-stat-box">');
      html.push('    <span class="account-stat-value">' + raidsHosted + '</span>');
      html.push('    <span class="account-stat-label">Raids Hosted</span>');
      html.push('  </div>');
      html.push('  <div class="account-stat-box">');
      html.push('    <span class="account-stat-value">' + escapeHtml(memberStr) + '</span>');
      html.push('    <span class="account-stat-label">Member Since</span>');
      html.push('  </div>');
      html.push('</div>');

      var deepLink = buildFriendCodeDeepLink(fc);
      html.push('<div class="account-card" style="margin-top:1.25rem">');
      if (!profileEditMode) {
        html.push('  <div class="profile-view-header">');
        html.push('    <div class="section-header">' + icon("users", 20) + ' Trainer Profile</div>');
        html.push('    <button type="button" class="btn-edit-profile" id="editProfileBtn">' + icon("pencil", 14) + ' Edit</button>');
        html.push('  </div>');
        html.push('  <dl class="profile-readout">');
        html.push('    <div class="profile-readout-row"><dt>Trainer Name</dt><dd>' + escapeHtml(ign || '\u2014') + '</dd></div>');
        html.push('    <div class="profile-readout-row"><dt>Friend Code</dt><dd class="profile-fc-display">' + escapeHtml(formatFriendCode(fc) || '\u2014') + '</dd></div>');
        html.push('    <div class="profile-readout-row"><dt>Team</dt><dd>' + (team ? '<span class="team-badge team-' + escapeHtml(team) + '">' + escapeHtml(team.charAt(0).toUpperCase() + team.slice(1)) + '</span>' : '\u2014') + '</dd></div>');
        html.push('    <div class="profile-readout-row"><dt>Trainer Level</dt><dd>' + escapeHtml(level ? String(level) : '\u2014') + '</dd></div>');
        html.push('  </dl>');
        if (deepLink) {
          html.push('  <div class="qr-container" id="profileQrContainer"></div>');
          html.push('  <p style="text-align:center;color:var(--slate-500);font-size:0.8125rem;margin:0.5rem 0 0">Scan to add me as a friend</p>');
          html.push('  <div class="deeplink-row">');
          html.push('    <span class="code-inline deeplink-url">' + escapeHtml(deepLink) + '</span>');
          html.push('    <button type="button" class="deeplink-copy-btn" data-copy-deeplink="' + escapeHtml(deepLink) + '">' + icon("clipboard", 14) + '</button>');
          html.push('  </div>');
        }
      } else {
        var ignDraft = formPersist.load('profileForm', 'profileIGN'); if (ignDraft === null) ignDraft = ign;
        var fcDraft = formPersist.load('profileForm', 'profileFriendCode'); if (fcDraft === null) fcDraft = formatFriendCode(fc);
        var teamDraft = formPersist.load('profileForm', 'profileTeam'); if (teamDraft === null) teamDraft = team;
        var levelDraft = formPersist.load('profileForm', 'profileLevel'); if (levelDraft === null) levelDraft = String(level);
        html.push('  <div class="profile-view-header">');
        html.push('    <div class="section-header">' + icon("users", 20) + ' Trainer Profile</div>');
        html.push('    <button type="button" class="btn-cancel-profile" id="cancelProfileBtn">Cancel</button>');
        html.push('  </div>');
        html.push('  <form id="profileForm" class="profile-form">');
        html.push('    <label class="form-label">');
        html.push('      Trainer Name');
        html.push('      <input id="profileIGN" class="form-input" type="text" maxlength="30" placeholder="e.g. TrainerAsh99" value="' + escapeHtml(ignDraft) + '">');
        html.push('    </label>');
        html.push('    <label class="form-label">');
        html.push('      Friend Code');
        html.push('      <input id="profileFriendCode" class="form-input" type="text" inputmode="numeric" maxlength="14" placeholder="0000 0000 0000" value="' + escapeHtml(fcDraft) + '">');
        html.push('    </label>');
        html.push('    <div class="profile-row-2col">');
        html.push('      <label class="form-label">');
        html.push('        Team');
        html.push('        <select id="profileTeam" class="form-select' + (teamDraft ? ' team-' + escapeHtml(teamDraft) : '') + '">');
        html.push('          <option value=""' + (!teamDraft ? ' selected' : '') + '>\u2014 Select \u2014</option>');
        html.push('          <option value="mystic"' + (teamDraft === 'mystic' ? ' selected' : '') + '>Mystic</option>');
        html.push('          <option value="valor"' + (teamDraft === 'valor' ? ' selected' : '') + '>Valor</option>');
        html.push('          <option value="instinct"' + (teamDraft === 'instinct' ? ' selected' : '') + '>Instinct</option>');
        html.push('        </select>');
        html.push('        <div class="team-select-preview' + (teamDraft ? ' team-' + escapeHtml(teamDraft) : '') + '" id="teamPreview"></div>');
        html.push('      </label>');
        html.push('      <label class="form-label">');
        html.push('        Trainer Level');
        html.push('        <input id="profileLevel" class="form-input" type="number" min="1" max="50" placeholder="1\u201350" value="' + escapeHtml(levelDraft) + '">');
        html.push('      </label>');
        html.push('    </div>');
        html.push('    <button class="btn-primary" type="submit" style="width:100%;margin-top:0.75rem">Save Profile</button>');
        html.push('  </form>');
      }
      html.push('</div>');

      var createdStr = memberSince ? memberSince.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '\u2014';
      html.push('<div class="account-card account-support-card">');
      html.push('  <div class="section-header">' + icon("shield", 20) + ' Support Info</div>');
      html.push('  <p class="account-support-hint">Share these details when contacting support.</p>');
      html.push('  <div class="support-info-grid">');
      html.push('    <div class="support-info-row">');
      html.push('      <span class="support-info-label">User ID</span>');
      html.push('      <span class="support-info-value"><code>' + escapeHtml((state.config || {}).userId) + '</code><button type="button" class="support-copy-btn" data-copy-value="' + escapeHtml((state.config || {}).userId) + '">' + icon("clipboard", 14) + '</button></span>');
      html.push('    </div>');
      if (email) {
        html.push('    <div class="support-info-row">');
        html.push('      <span class="support-info-label">Email</span>');
        html.push('      <span class="support-info-value"><code>' + escapeHtml(email) + '</code><button type="button" class="support-copy-btn" data-copy-value="' + escapeHtml(email) + '">' + icon("clipboard", 14) + '</button></span>');
        html.push('    </div>');
      }
      html.push('    <div class="support-info-row">');
      html.push('      <span class="support-info-label">Account Created</span>');
      html.push('      <span class="support-info-value"><code>' + escapeHtml(createdStr) + '</code></span>');
      html.push('    </div>');
      html.push('  </div>');
      html.push('</div>');

      // ── Notifications section ──
      if (typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
        var isIosNotInstalled = (/iP(hone|ad|od)/i.test(navigator.userAgent)) && !navigator.standalone;
        var permission = Notification.permission;
        html.push('<div class="account-card account-notifications-card" style="margin-top:1.25rem">');
        html.push('  <div class="section-header">' + icon("bell", 20) + ' Notifications</div>');
        if (isIosNotInstalled) {
          html.push('  <div class="notif-ios-hint">');
          html.push('    <p class="notif-ios-hint-text">Add RaidSync to your Home Screen to enable background alerts.</p>');
          html.push('  </div>');
        } else if (permission === 'granted') {
          html.push('  <div class="notif-status-row">');
          html.push('    <span class="notif-badge notif-badge-on">' + icon("check", 14) + ' Background alerts on</span>');
          html.push('  </div>');
        } else if (permission === 'denied') {
          html.push('  <p class="notif-blocked-text">Notifications are blocked. To re-enable, go to your browser settings and allow notifications for this site.</p>');
        } else {
          html.push('  <p class="notif-hint-text">Enable background alerts so you\'ll know when it\'s your turn to raid.</p>');
          html.push('  <button type="button" class="btn-primary notif-enable-btn" id="enableNotifsBtn" style="width:100%;margin-top:0.75rem">' + icon("bell", 16) + ' Enable Notifications</button>');
        }
        html.push('</div>');
      }

      html.push('<div style="margin-top:1.5rem">');
      html.push('  <button class="btn-sign-out" id="signOutBtn" type="button">Sign Out</button>');
      html.push('</div>');
    } else {
      var mode = state.authMode || "signin";
      var isSignUp = mode === "signup";
      var subtitle = isSignUp
        ? "Create an account to start joining raids."
        : "Sign in to join raids and track your queues.";
      html.push('    <p class="view-subtitle">' + escapeHtml(subtitle) + '</p>');
      html.push('  </div>');
      html.push('</div>');
      html.push('<div class="account-card">');
      if (state.pendingConfirmation) {
        html.push('  <div class="email-sent-banner">');
        html.push('    <div class="email-sent-icon">' + icon("checkCircle", 20) + '</div>');
        html.push('    <div class="email-sent-body">');
        html.push('      <p class="email-sent-title">Confirmation email sent</p>');
        html.push('      <p class="email-sent-desc">We sent a link to <strong>' + escapeHtml(state.pendingConfirmation) + '</strong>. Click it to verify your account, then sign in below.</p>');
        html.push('    </div>');
        html.push('  </div>');
      }
      html.push('  <div class="auth-tabs">');
      html.push('    <button class="auth-tab' + (!isSignUp ? ' active' : '') + '" data-auth-tab="signin" type="button">Sign In</button>');
      html.push('    <button class="auth-tab' + (isSignUp ? ' active' : '') + '" data-auth-tab="signup" type="button">Create Account</button>');
      html.push('  </div>');
      html.push('  <form id="authForm" class="auth-form-inner" data-mode="' + escapeHtml(mode) + '">');
      html.push('    <label class="form-label">');
      html.push('      Email');
      var emailDraft = formPersist.load('authForm', 'authEmail') || '';
      html.push('      <input id="authEmail" class="form-input" type="email" placeholder="trainer@example.com" autocomplete="email" required value="' + escapeHtml(emailDraft) + '">');
      html.push('    </label>');
      html.push('    <label class="form-label">');
      html.push('      Password');
      html.push('      <input id="authPassword" class="form-input" type="password" placeholder="••••••••" autocomplete="' + (isSignUp ? 'new-password' : 'current-password') + '" required>');
      html.push('    </label>');
      html.push('    <label class="form-label auth-confirm-field">');
      html.push('      Confirm Password');
      html.push('      <input id="authConfirm" class="form-input" type="password" placeholder="••••••••" autocomplete="new-password">');
      html.push('    </label>');
      html.push('    <button class="btn-primary" type="submit" id="authSubmitBtn">' + (isSignUp ? 'Create Account' : 'Sign In') + '</button>');
      html.push('  </form>');
      html.push('</div>');
    }

    updateRenderedHtml(wrap, html.join("\n"));
  };
})(window);
