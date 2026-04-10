'use strict';
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// localStorage shim — Node.js has no native localStorage
// ---------------------------------------------------------------------------
const _store = {};
const localStorageShim = {
  _store,
  getItem(key) { return Object.prototype.hasOwnProperty.call(_store, key) ? _store[key] : null; },
  setItem(key, value) { _store[key] = String(value); },
  removeItem(key) { delete _store[key]; },
  get length() { return Object.keys(_store).length; },
  key(i) { return Object.keys(_store)[i] || null; },
  clear() { Object.keys(_store).forEach(k => delete _store[k]); }
};

// Inject the shim as a property that the IIFE reads from its `global` arg
const shimWindow = { localStorage: localStorageShim };

// ---------------------------------------------------------------------------
// Load the module under test by executing the IIFE with our shim window
// ---------------------------------------------------------------------------
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(
  path.join(__dirname, '../../src/utils/localCache.js'),
  'utf8'
);
// Execute the IIFE in this scope, passing shimWindow as `window`
// eslint-disable-next-line no-new-func
new Function('window', src)(shimWindow);
const LocalCache = shimWindow.LocalCache;

// ---------------------------------------------------------------------------
// Helper — wipe storage between tests
// ---------------------------------------------------------------------------
function clearStorage() { localStorageShim.clear(); }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalCache — saveUser / loadUser', () => {
  beforeEach(clearStorage);

  test('round-trip: saves and loads user data', () => {
    LocalCache.saveUser('user-1', { isVip: true, isAdmin: false, profile: { name: 'Ash' }, accountStats: { raids: 5 } });
    const result = LocalCache.loadUser('user-1', 86400000);
    assert.deepEqual(result, { isVip: true, isAdmin: false, profile: { name: 'Ash' }, accountStats: { raids: 5 } });
  });

  test('returns null for unknown userId', () => {
    const result = LocalCache.loadUser('nobody', 86400000);
    assert.equal(result, null);
  });

  test('returns null when entry is expired (TTL exceeded)', () => {
    LocalCache.saveUser('user-1', { isVip: true });
    // Manually backdate the timestamp
    const key = 'raidSync_cache:v1:user-1';
    const entry = JSON.parse(localStorageShim.getItem(key));
    entry.ts = Date.now() - 100000; // 100 seconds in the past
    localStorageShim.setItem(key, JSON.stringify(entry));
    // Load with a 50 second TTL — should be expired
    const result = LocalCache.loadUser('user-1', 50000);
    assert.equal(result, null);
  });

  test('returns data within TTL', () => {
    LocalCache.saveUser('user-1', { isVip: false });
    const result = LocalCache.loadUser('user-1', 86400000);
    assert.notEqual(result, null);
    assert.equal(result.isVip, false);
  });

  test('ignores null/undefined userId on save (no crash)', () => {
    assert.doesNotThrow(() => LocalCache.saveUser(null, { isVip: true }));
    assert.doesNotThrow(() => LocalCache.saveUser(undefined, { isVip: true }));
  });

  test('returns null for null/undefined userId on load', () => {
    assert.equal(LocalCache.loadUser(null, 86400000), null);
    assert.equal(LocalCache.loadUser(undefined, 86400000), null);
  });
});

describe('LocalCache — saveGlobal / loadGlobal', () => {
  beforeEach(clearStorage);

  test('round-trip: saves and loads global data', () => {
    LocalCache.saveGlobal({ appConfig: { invite_window: 60 }, raidBosses: [{ id: 1 }], bosses: [] });
    const result = LocalCache.loadGlobal(86400000);
    assert.deepEqual(result, { appConfig: { invite_window: 60 }, raidBosses: [{ id: 1 }], bosses: [] });
  });

  test('returns null when no global cache exists', () => {
    assert.equal(LocalCache.loadGlobal(86400000), null);
  });

  test('returns null when global cache is expired', () => {
    LocalCache.saveGlobal({ appConfig: {} });
    const key = 'raidSync_cache:v1:_global';
    const entry = JSON.parse(localStorageShim.getItem(key));
    entry.ts = Date.now() - 200000;
    localStorageShim.setItem(key, JSON.stringify(entry));
    assert.equal(LocalCache.loadGlobal(100000), null);
  });
});

describe('LocalCache — clearUser', () => {
  beforeEach(clearStorage);

  test('removes only the target user cache entry', () => {
    LocalCache.saveUser('user-1', { isVip: true });
    LocalCache.saveUser('user-2', { isVip: false });
    LocalCache.clearUser('user-1');
    assert.equal(LocalCache.loadUser('user-1', 86400000), null);
    assert.notEqual(LocalCache.loadUser('user-2', 86400000), null);
  });

  test('does not crash when clearing a non-existent user', () => {
    assert.doesNotThrow(() => LocalCache.clearUser('never-saved'));
  });

  test('does not crash with null userId', () => {
    assert.doesNotThrow(() => LocalCache.clearUser(null));
  });
});

describe('LocalCache — clearAll', () => {
  beforeEach(clearStorage);

  test('removes all raidSync_cache: keys', () => {
    LocalCache.saveUser('user-1', { isVip: true });
    LocalCache.saveUser('user-2', { isVip: false });
    LocalCache.saveGlobal({ appConfig: {} });
    LocalCache.clearAll();
    assert.equal(LocalCache.loadUser('user-1', 86400000), null);
    assert.equal(LocalCache.loadUser('user-2', 86400000), null);
    assert.equal(LocalCache.loadGlobal(86400000), null);
  });

  test('does not remove unrelated keys', () => {
    localStorageShim.setItem('pogo.auth.token', 'some-token');
    LocalCache.saveUser('user-1', { isVip: true });
    LocalCache.clearAll();
    assert.equal(localStorageShim.getItem('pogo.auth.token'), 'some-token');
  });

  test('does not crash on empty storage', () => {
    assert.doesNotThrow(() => LocalCache.clearAll());
  });
});

describe('LocalCache — CACHE_VERSION', () => {
  beforeEach(clearStorage);

  test('version stamp is exposed on the public API', () => {
    assert.equal(typeof LocalCache.CACHE_VERSION, 'number');
    assert.ok(LocalCache.CACHE_VERSION >= 1);
  });

  test('entries from a different cache version are not loaded', () => {
    // Simulate a stale v0 entry (old key format, different version prefix)
    localStorageShim.setItem('raidSync_cache:v0:user-1', JSON.stringify({ ts: Date.now(), d: { isVip: true } }));
    // v1 loadUser should not find the v0 entry
    assert.equal(LocalCache.loadUser('user-1', 86400000), null);
  });
});

describe('LocalCache — localStorage failure resistance', () => {
  test('saveUser does not throw when localStorage.setItem throws', () => {
    const origSetItem = localStorageShim.setItem.bind(localStorageShim);
    localStorageShim.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.doesNotThrow(() => LocalCache.saveUser('user-1', { isVip: true }));
    localStorageShim.setItem = origSetItem;
  });

  test('loadUser returns null when localStorage.getItem throws', () => {
    const origGetItem = localStorageShim.getItem.bind(localStorageShim);
    localStorageShim.getItem = () => { throw new Error('SecurityError'); };
    assert.equal(LocalCache.loadUser('user-1', 86400000), null);
    localStorageShim.getItem = origGetItem;
  });

  test('loadUser returns null for corrupted JSON', () => {
    localStorageShim.setItem('raidSync_cache:v1:user-1', 'not-valid-json{{{');
    assert.equal(LocalCache.loadUser('user-1', 86400000), null);
  });

  test('clearAll does not throw when localStorage iteration throws', () => {
    const origKey = localStorageShim.key.bind(localStorageShim);
    localStorageShim.key = () => { throw new Error('SecurityError'); };
    assert.doesNotThrow(() => LocalCache.clearAll());
    localStorageShim.key = origKey;
  });
});
