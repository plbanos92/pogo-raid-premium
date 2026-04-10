(function (global) {
  'use strict';

  var CACHE_VERSION = 1;
  var KEY_PREFIX = 'raidSync_cache:v' + CACHE_VERSION + ':';

  function _key(suffix) {
    return KEY_PREFIX + suffix;
  }

  function _save(suffix, data) {
    try {
      var entry = JSON.stringify({ ts: Date.now(), d: data });
      global.localStorage.setItem(_key(suffix), entry);
    } catch (e) {}
  }

  function _load(suffix, maxAgeMs) {
    try {
      var raw = global.localStorage.getItem(_key(suffix));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || typeof entry.ts !== 'number' || !entry.d) return null;
      if (maxAgeMs != null && (Date.now() - entry.ts) > maxAgeMs) return null;
      return entry.d;
    } catch (e) {
      return null;
    }
  }

  function _remove(suffix) {
    try {
      global.localStorage.removeItem(_key(suffix));
    } catch (e) {}
  }

  // Saves user-specific cache keyed by userId.
  // Envelope: { ts: <unix ms>, d: <data> }
  function saveUser(userId, data) {
    if (!userId) return;
    _save(userId, data);
  }

  // Returns cached user data if it exists and is within maxAgeMs, else null.
  function loadUser(userId, maxAgeMs) {
    if (!userId) return null;
    return _load(userId, maxAgeMs);
  }

  // Saves app-global cache (shared across all users on this device).
  function saveGlobal(data) {
    _save('_global', data);
  }

  // Returns cached global data if it exists and is within maxAgeMs, else null.
  function loadGlobal(maxAgeMs) {
    return _load('_global', maxAgeMs);
  }

  // Removes a single user's cache entry.
  function clearUser(userId) {
    if (!userId) return;
    _remove(userId);
  }

  // Removes all raidSync_cache:* keys across all versions.
  // Used on factory reset / debug scenarios.
  function clearAll() {
    try {
      var keys = [];
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (k && k.indexOf('raidSync_cache:') === 0) keys.push(k);
      }
      keys.forEach(function (k) {
        try { global.localStorage.removeItem(k); } catch (e) {}
      });
    } catch (e) {}
  }

  global.LocalCache = {
    CACHE_VERSION: CACHE_VERSION,
    saveUser: saveUser,
    loadUser: loadUser,
    saveGlobal: saveGlobal,
    loadGlobal: loadGlobal,
    clearUser: clearUser,
    clearAll: clearAll
  };
})(window);
