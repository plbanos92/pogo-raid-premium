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
  var VID_KEY = 'rs_vid';
  var SID_KEY = 'rs_sid';
  var ENDPOINT = '/api/track';

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
    if (!v) { v = uuid(); safeSet(global.localStorage, VID_KEY, v); }
    return v;
  }
  function getSessionId() {
    var v = safeGet(global.sessionStorage, SID_KEY);
    if (!v) { v = uuid(); safeSet(global.sessionStorage, SID_KEY, v); }
    return v;
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
    var ua = nav.userAgent || '';
    var parsed = parseUA(ua);

    var referrer = global.document && global.document.referrer ? global.document.referrer : '';
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

    return {
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      event_type: eventType || 'pageview',
      path: (loc.pathname || '/') + (loc.hash || ''),
      view_name: viewName || null,
      referrer: referrer || null,
      referrer_host: referrerHost,
      user_agent: ua,
      browser: parsed.browser,
      browser_version: parsed.browser_version,
      os: parsed.os,
      os_version: parsed.os_version,
      device_type: parsed.device_type,
      language: nav.language || null,
      languages: Array.isArray(nav.languages) ? nav.languages.join(',') : null,
      timezone: tz,
      timezone_offset: -new Date().getTimezoneOffset(),
      screen_w: scr.width || null,
      screen_h: scr.height || null,
      viewport_w: global.innerWidth || null,
      viewport_h: global.innerHeight || null,
      dpr: global.devicePixelRatio || null,
      color_depth: scr.colorDepth || null,
      is_standalone: isStandalone,
      is_touch: isTouch,
      prefers_dark: prefersDark,
      connection_type: conn ? (conn.type || null) : null,
      effective_type: conn ? (conn.effectiveType || null) : null,
      downlink: conn ? (typeof conn.downlink === 'number' ? conn.downlink : null) : null,
      hardware_concurrency: nav.hardwareConcurrency || null,
      device_memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
      platform: nav.platform || null,
      vendor: nav.vendor || null,
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
    getVisitorId: getVisitorId,
    getSessionId: getSessionId,
    _collect: collect  // exposed for debugging only
  };
})(window);
