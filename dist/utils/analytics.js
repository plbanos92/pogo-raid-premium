/**
 * Analytics beacon — collects privacy-respecting client-side data and sends it
 * to the Cloudflare Worker at /api/track. The Worker enriches with CF geo data
 * and a salted IP hash before writing to Supabase (table: page_views).
 *
 * Identity:
 *   - visitor_id: persistent UUID stored in localStorage ("rs_vid")
 *   - session_id: UUID stored in sessionStorage ("rs_sid") — lives as long as
 *     the browser tab; a new tab gets a new session.
 *
 * No PII is collected. IPs are never sent by the client and never stored raw.
 *
 * Transport: fetch(..., { keepalive: true }) so the request survives the
 * current page unload. Same-origin — no CORS preflight.
 *
 * Failure mode: ALL errors are swallowed. Analytics must never break the app.
 */
(function (global) {
  var VID_KEY      = 'rs_vid';
  var VHITS_KEY    = 'rs_vhits';   // lifetime hit counter per visitor
  var SID_KEY      = 'rs_sid';
  var SHITS_KEY    = 'rs_shits';   // hit counter within current session
  var SSTART_KEY   = 'rs_sstart';  // session start ISO
  var SENTRY_KEY   = 'rs_sentry';  // session entry path
  var SREF_KEY     = 'rs_sref';    // session entry referrer
  var PREVVIEW_KEY = 'rs_pv';      // previous view name (session)
  var PREVPATH_KEY = 'rs_pp';      // previous path (session)
  var VIEW_TS_KEY  = 'rs_vts';     // timestamp when current view was entered
  var ENDPOINT     = '/api/track';

  var _lastKey = null;        // de-dupe guard (same view within 1s)
  var _lastKeyTs = 0;

  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      try { return global.crypto.randomUUID(); } catch (e) { /* fall through */ }
    }
    // RFC4122 v4 fallback
    var d = Date.now();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (e) { /* quota/privacy-mode */ }
  }

  function getVisitorId() {
    var v = safeGet(global.localStorage, VID_KEY);
    var isNew = false;
    if (!v) { v = uuid(); safeSet(global.localStorage, VID_KEY, v); isNew = true; }
    return { id: v, isNew: isNew };
  }
  function getSessionId() {
    var v = safeGet(global.sessionStorage, SID_KEY);
    var isNew = false;
    if (!v) {
      v = uuid();
      safeSet(global.sessionStorage, SID_KEY, v);
      safeSet(global.sessionStorage, SSTART_KEY, new Date().toISOString());
      isNew = true;
    }
    return { id: v, isNew: isNew };
  }

  function bumpCounter(storage, key) {
    var n = parseInt(safeGet(storage, key) || '0', 10);
    if (!Number.isFinite(n) || n < 0) n = 0;
    n += 1;
    safeSet(storage, key, String(n));
    return n;
  }

  // Parse utm_* + first-seen referrer/path and cache on sessionStorage so every
  // subsequent hit in the session carries the same attribution data.
  function getSessionAttribution(currentPath, currentReferrer) {
    var entryPath     = safeGet(global.sessionStorage, SENTRY_KEY);
    var entryReferrer = safeGet(global.sessionStorage, SREF_KEY);
    if (!entryPath) {
      entryPath = currentPath;
      safeSet(global.sessionStorage, SENTRY_KEY, entryPath || '');
    }
    if (entryReferrer === null) {
      entryReferrer = currentReferrer || '';
      safeSet(global.sessionStorage, SREF_KEY, entryReferrer);
    }
    var started = safeGet(global.sessionStorage, SSTART_KEY);
    return {
      entryPath: entryPath || null,
      entryReferrer: entryReferrer || null,
      startedAt: started || null
    };
  }

  function parseUTM(search) {
    var out = { source: null, medium: null, campaign: null, term: null, content: null };
    if (!search || typeof search !== 'string') return out;
    try {
      var q = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);
      out.source   = q.get('utm_source')   || null;
      out.medium   = q.get('utm_medium')   || null;
      out.campaign = q.get('utm_campaign') || null;
      out.term     = q.get('utm_term')     || null;
      out.content  = q.get('utm_content')  || null;
    } catch (e) { /* ignore */ }
    return out;
  }

  // Pull first paint / FCP / page load from PerformanceNavigationTiming when
  // available. Returns null for any metric that isn't ready yet.
  function getPerf() {
    var out = { pageLoad: null, dcl: null, fp: null, fcp: null, navType: null };
    try {
      var navEntries = (global.performance && global.performance.getEntriesByType)
        ? global.performance.getEntriesByType('navigation')
        : [];
      if (navEntries && navEntries[0]) {
        var n = navEntries[0];
        if (n.loadEventEnd > 0) out.pageLoad = Math.round(n.loadEventEnd);
        if (n.domContentLoadedEventEnd > 0) out.dcl = Math.round(n.domContentLoadedEventEnd);
        if (n.type) out.navType = n.type;
      }
      if (global.performance && global.performance.getEntriesByType) {
        var paints = global.performance.getEntriesByType('paint') || [];
        for (var i = 0; i < paints.length; i++) {
          if (paints[i].name === 'first-paint' && out.fp == null) out.fp = Math.round(paints[i].startTime);
          if (paints[i].name === 'first-contentful-paint' && out.fcp == null) out.fcp = Math.round(paints[i].startTime);
        }
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  function getOrientation() {
    try {
      if (global.screen && global.screen.orientation && global.screen.orientation.type) {
        return String(global.screen.orientation.type);
      }
      if (global.matchMedia) {
        if (global.matchMedia('(orientation: portrait)').matches) return 'portrait';
        if (global.matchMedia('(orientation: landscape)').matches) return 'landscape';
      }
    } catch (e) {}
    return null;
  }

  // Lightweight UA parser. Not attempting to compete with ua-parser-js — this
  // just gives us good-enough buckets (Chrome / Firefox / Safari / Edge / Opera
  // and Windows / macOS / iOS / Android / Linux) so Supabase can aggregate.
  function parseUA(ua) {
    ua = ua || '';
    var result = { browser: null, browser_version: null, os: null, os_version: null, device_type: 'desktop' };

    // OS
    if (/Windows NT/.test(ua))        { result.os = 'Windows';
      var mw = /Windows NT ([\d.]+)/.exec(ua); result.os_version = mw ? mw[1] : null; }
    else if (/Android/.test(ua))      { result.os = 'Android';
      var ma = /Android ([\d.]+)/.exec(ua); result.os_version = ma ? ma[1] : null; }
    else if (/iPhone|iPad|iPod/.test(ua)) { result.os = 'iOS';
      var mi = /OS ([\d_]+)/.exec(ua); result.os_version = mi ? mi[1].replace(/_/g, '.') : null; }
    else if (/Mac OS X/.test(ua))     { result.os = 'macOS';
      var mm = /Mac OS X ([\d_]+)/.exec(ua); result.os_version = mm ? mm[1].replace(/_/g, '.') : null; }
    else if (/CrOS/.test(ua))         { result.os = 'ChromeOS'; }
    else if (/Linux/.test(ua))        { result.os = 'Linux'; }

    // Device
    if (/iPad|Tablet/.test(ua) || (result.os === 'Android' && !/Mobile/.test(ua))) result.device_type = 'tablet';
    else if (/Mobi|iPhone|iPod|Android/.test(ua)) result.device_type = 'mobile';

    // Browser — order matters (Edge/Opera/Chrome/Safari/Firefox)
    var m;
    if ((m = /Edg\/([\d.]+)/.exec(ua)))      { result.browser = 'Edge';    result.browser_version = m[1]; }
    else if ((m = /OPR\/([\d.]+)/.exec(ua))) { result.browser = 'Opera';   result.browser_version = m[1]; }
    else if ((m = /Firefox\/([\d.]+)/.exec(ua))) { result.browser = 'Firefox'; result.browser_version = m[1]; }
    else if ((m = /Chrome\/([\d.]+)/.exec(ua))) { result.browser = 'Chrome'; result.browser_version = m[1]; }
    else if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) { result.browser = 'Safari'; result.browser_version = m[1]; }
    else if (/Safari/.test(ua)) { result.browser = 'Safari'; }

    return result;
  }

  function collect(eventType, viewName, extra) {
    var nav = global.navigator || {};
    var loc = global.location || {};
    var scr = global.screen || {};
    var doc = global.document || {};
    var ua = nav.userAgent || '';
    var parsed = parseUA(ua);

    var referrer = doc.referrer || '';
    var referrerHost = null;
    if (referrer) {
      try { referrerHost = new URL(referrer).host; } catch (e) { referrerHost = null; }
    }

    var conn = nav.connection || nav.mozConnection || nav.webkitConnection || null;
    var prefersDark = false;
    try { prefersDark = !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) {}
    var isStandalone = false;
    try { isStandalone = !!(global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true; } catch (e) {}
    var isTouch = false;
    try { isTouch = ('ontouchstart' in global) || (nav.maxTouchPoints > 0); } catch (e) {}
    var tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) {}

    // Identity + session counters
    var vid = getVisitorId();
    var sid = getSessionId();
    var visitorHitNum = bumpCounter(global.localStorage, VHITS_KEY);
    var sessionHitNum = bumpCounter(global.sessionStorage, SHITS_KEY);

    // Previous-view tracking (for time-on-page / funnel analysis)
    var prevView = safeGet(global.sessionStorage, PREVVIEW_KEY);
    var prevPath = safeGet(global.sessionStorage, PREVPATH_KEY);
    var prevTs = parseInt(safeGet(global.sessionStorage, VIEW_TS_KEY) || '0', 10);
    var nowMs = Date.now();
    var timeOnPrev = (prevTs && Number.isFinite(prevTs)) ? (nowMs - prevTs) : null;
    if (timeOnPrev != null && (timeOnPrev < 0 || timeOnPrev > 6 * 60 * 60 * 1000)) {
      timeOnPrev = null; // ignore absurd values (clock skew / tab was asleep for hours)
    }

    var currentPath = (loc.pathname || '/') + (loc.hash || '');
    var session = getSessionAttribution(currentPath, referrer);
    var utm = parseUTM(loc.search || '');
    var perf = getPerf();
    var orientation = getOrientation();

    // UA client hints (Chromium-only; null everywhere else)
    var uaData = nav.userAgentData || null;
    var uaMobile = uaData && typeof uaData.mobile === 'boolean' ? uaData.mobile : null;
    var uaPlatform = uaData && typeof uaData.platform === 'string' ? uaData.platform : null;

    // Only record the "enter view" timestamp for navigation-style events so
    // we can compute time_on_prev_view on the NEXT event.
    try {
      safeSet(global.sessionStorage, PREVVIEW_KEY, viewName || '');
      safeSet(global.sessionStorage, PREVPATH_KEY, currentPath);
      safeSet(global.sessionStorage, VIEW_TS_KEY, String(nowMs));
    } catch (e) {}

    return {
      // identity
      visitor_id:       vid.id,
      session_id:       sid.id,
      is_new_visitor:   vid.isNew,
      is_new_session:   sid.isNew,
      visitor_hit_num:  visitorHitNum,
      session_hit_num:  sessionHitNum,

      // event
      event_type:       eventType || 'pageview',
      path:             currentPath,
      view_name:        viewName || null,
      url_query:        loc.search || null,
      url_hash:         loc.hash || null,
      prev_view:        prevView || null,
      prev_path:        prevPath || null,
      time_on_prev_view_ms: timeOnPrev,

      // session attribution
      session_entry_path:     session.entryPath,
      session_entry_referrer: session.entryReferrer,
      session_started_at:     session.startedAt,

      // UTM
      utm_source:       utm.source,
      utm_medium:       utm.medium,
      utm_campaign:     utm.campaign,
      utm_term:         utm.term,
      utm_content:      utm.content,

      // referrer
      referrer:         referrer || null,
      referrer_host:    referrerHost,

      // UA
      user_agent:       ua,
      browser:          parsed.browser,
      browser_version:  parsed.browser_version,
      os:               parsed.os,
      os_version:       parsed.os_version,
      device_type:      parsed.device_type,
      ua_mobile:        uaMobile,
      ua_platform:      uaPlatform,

      // locale / time
      language:         nav.language || null,
      languages:        Array.isArray(nav.languages) ? nav.languages.join(',') : null,
      timezone:         tz,
      timezone_offset:  -new Date().getTimezoneOffset(),

      // screen / viewport
      screen_w:         scr.width || null,
      screen_h:         scr.height || null,
      viewport_w:       global.innerWidth || null,
      viewport_h:       global.innerHeight || null,
      dpr:              global.devicePixelRatio || null,
      color_depth:      scr.colorDepth || null,
      orientation:      orientation,

      // device capabilities
      is_standalone:    isStandalone,
      is_touch:         isTouch,
      prefers_dark:     prefersDark,
      cookie_enabled:   typeof nav.cookieEnabled === 'boolean' ? nav.cookieEnabled : null,
      webdriver:        typeof nav.webdriver === 'boolean' ? nav.webdriver : null,
      is_online:        typeof nav.onLine === 'boolean' ? nav.onLine : null,
      visibility_state: doc.visibilityState || null,
      has_focus:        typeof doc.hasFocus === 'function' ? !!doc.hasFocus() : null,

      // network
      connection_type:  conn ? (conn.type || null) : null,
      effective_type:   conn ? (conn.effectiveType || null) : null,
      downlink:         conn ? (typeof conn.downlink === 'number' ? conn.downlink : null) : null,
      rtt:              conn ? (typeof conn.rtt === 'number' ? conn.rtt : null) : null,
      save_data:        conn ? (typeof conn.saveData === 'boolean' ? conn.saveData : null) : null,

      // hardware
      hardware_concurrency: nav.hardwareConcurrency || null,
      device_memory:    typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
      platform:         nav.platform || null,
      vendor:           nav.vendor || null,

      // performance
      nav_type:         perf.navType,
      page_load_ms:     perf.pageLoad,
      dcl_ms:           perf.dcl,
      fp_ms:            perf.fp,
      fcp_ms:           perf.fcp,

      extra: extra && typeof extra === 'object' ? extra : null
    };
  }

  function send(payload, authToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    try {
      return fetch(ENDPOINT, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: 'same-origin'
      }).catch(function () { /* swallow */ });
    } catch (e) {
      return Promise.resolve();
    }
  }

  function track(eventType, viewName, extra) {
    // De-dupe identical pageviews fired within 500ms of each other (e.g. init
    // race between boot + switchView landing on same view).
    var key = (eventType || '') + '|' + (viewName || '') + '|' + (global.location ? global.location.pathname : '');
    var now = Date.now();
    if (key === _lastKey && (now - _lastKeyTs) < 500) return Promise.resolve();
    _lastKey = key; _lastKeyTs = now;

    var token = null;
    try {
      if (global.AppStore && typeof global.AppStore.getState === 'function') {
        var st = global.AppStore.getState();
        if (st && st.config && st.config.token) token = st.config.token;
      }
    } catch (e) {}

    try {
      return send(collect(eventType, viewName, extra), token);
    } catch (e) {
      return Promise.resolve();
    }
  }

  global.Analytics = {
    track: track,
    getVisitorId: function () { return getVisitorId().id; },
    getSessionId: function () { return getSessionId().id; },
    _collect: collect  // exposed for debugging only
  };
})(window);
