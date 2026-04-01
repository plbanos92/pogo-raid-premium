const test = require("node:test");
const assert = require("node:assert/strict");

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const SEED_RAID_ID = process.env.LOCAL_SEED_RAID_ID || "00000000-0000-0000-0000-000000000201";

function requiredEnvMissing() {
  return !ANON_KEY || !SERVICE_ROLE_KEY;
}

async function parseResponse(res) {
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (err) {
    payload = { raw: text };
  }

  if (!res.ok) {
    const error = new Error((payload && (payload.msg || payload.message || payload.error)) || `HTTP ${res.status}`);
    error.status = res.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function adminCreateUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true
    })
  });

  return parseResponse(res);
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  return parseResponse(res);
}

async function callRest(path, token, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: typeof options.body === "undefined" ? undefined : JSON.stringify(options.body)
  });

  return parseResponse(res);
}


// Helper: get an available raid_boss_id
async function getAvailableRaidBossId(token) {
  const bosses = await callRest("/rest/v1/raid_bosses?select=id&limit=1", token);
  if (!Array.isArray(bosses) || !bosses[0] || !bosses[0].id) throw new Error("No raid boss id available");
  return bosses[0].id;
}

// Helper: create a new raid row as host
async function createRaid(token, hostUserId, raidBossId) {
  const now = new Date();
  const start = new Date(now.getTime() + 10 * 60000).toISOString(); // 10 min from now
  const end = new Date(now.getTime() + 40 * 60000).toISOString(); // 40 min from now
  const raid = await callRest("/rest/v1/raids", token, {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: [{
      host_user_id: hostUserId,
      raid_boss_id: raidBossId,
      location_name: "Test Gym",
      start_time: start,
      end_time: end,
      is_active: true
    }]
  });
  if (!Array.isArray(raid) || !raid[0] || !raid[0].id) throw new Error("Raid creation failed");
  return raid[0].id;
}

// Helper: elevate a user to admin via service-role upsert on user_profiles
async function adminSetUserIsAdmin(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({ auth_id: userId, is_admin: true })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`adminSetUserIsAdmin failed (HTTP ${res.status}): ${body}`);
  }
}

const testFn = requiredEnvMissing() ? test.skip : test;
testFn("local backend integration: host+joiner lobby-sync regression (Phase 3)", async () => {
  // 1. Create host and joiner users
  const ts = Date.now();
  const hostEmail = `phase3-host-${ts}@example.test`;
  const joinerEmail = `phase3-joiner-${ts}@example.test`;
  const password = "TestPass123!";

  const hostUser = await adminCreateUser(hostEmail, password);
  const joinerUser = await adminCreateUser(joinerEmail, password);
  assert.ok(hostUser.id && joinerUser.id, "admin create user should return user id");

  // 2. Sign in both users
  const hostSignin = await signIn(hostEmail, password);
  const joinerSignin = await signIn(joinerEmail, password);
  assert.ok(hostSignin.access_token && joinerSignin.access_token, "sign in should return access token");
  assert.ok(hostSignin.user && joinerSignin.user, "sign in should return user");

  const hostToken = hostSignin.access_token;
  const joinerToken = joinerSignin.access_token;
  const hostId = hostSignin.user.id;
  const joinerId = joinerSignin.user.id;

  // 3. Create a new raid owned by host
  const raidBossId = await getAvailableRaidBossId(hostToken);
  const raidId = await createRaid(hostToken, hostId, raidBossId);
  assert.ok(raidId, "should create a new raid");

  // 4. Joiner joins queue via join_raid_queue RPC
  const queueRow = await callRest("/rest/v1/rpc/join_raid_queue", joinerToken, {
    method: "POST",
    body: {
      p_raid_id: raidId,
      p_note: "phase3 join"
    }
  });
  assert.equal(queueRow.user_id, joinerId);
  assert.equal(queueRow.raid_id, raidId);

  // 5. Joiner confirms via user_confirm_invite RPC
  const confirmRow = await callRest("/rest/v1/rpc/user_confirm_invite", joinerToken, {
    method: "POST",
    body: {
      p_queue_id: queueRow.id
    }
  });
  assert.equal(confirmRow.id, queueRow.id, "confirm should return same queue id");

  // 6. Host calls list_raid_queue RPC and sees joiner row in confirmed status
  const listRows = await callRest("/rest/v1/rpc/list_raid_queue", hostToken, {
    method: "POST",
    body: {
      p_raid_id: raidId
    }
  });
  assert.ok(Array.isArray(listRows), "list_raid_queue should return array");
  const found = listRows.find(r => r.user_id === joinerId);
  assert.ok(found, "host should see joiner in queue");
  assert.equal(found.status, "confirmed", "joiner status should be exactly 'confirmed'");
});

testFn("local backend integration: auth, read raids, join queue", async () => {
  const email = `local-int-${Date.now()}@example.test`;
  const password = "TestPass123!";

  const adminUser = await adminCreateUser(email, password);
  assert.ok(adminUser.id, "admin create user should return user id");

  const signin = await signIn(email, password);
  assert.ok(signin.access_token, "sign in should return access token");
  assert.ok(signin.user && signin.user.id, "sign in should return user");

  const token = signin.access_token;
  const userId = signin.user.id;

  const raids = await callRest("/rest/v1/raids?is_active=eq.true&select=id,location_name,start_time,end_time", token);
  assert.ok(Array.isArray(raids), "raids should be an array");

  const queueRow = await callRest("/rest/v1/rpc/join_raid_queue", token, {
    method: "POST",
    body: {
      p_raid_id: SEED_RAID_ID,
      p_note: "integration test join"
    }
  });

  assert.equal(queueRow.user_id, userId);
  assert.equal(queueRow.raid_id, SEED_RAID_ID);

  const myQueues = await callRest(`/rest/v1/raid_queues?user_id=eq.${encodeURIComponent(userId)}&select=id,raid_id,status`, token);
  assert.ok(myQueues.some((row) => row.raid_id === SEED_RAID_ID), "my queues should contain joined seed raid");
});

// ─────────────────────────────────────────────────────────────
// Phase 8: Realtime slot lifecycle integration tests
// Requires: realtime sessions migration applied to local DB
// ─────────────────────────────────────────────────────────────

testFn("realtime: get baseline slot stats", async () => {
  const ts = Date.now();
  await adminCreateUser(`rt-stats-${ts}@example.test`, "TestPass123!");
  const signin = await signIn(`rt-stats-${ts}@example.test`, "TestPass123!");
  const token = signin.access_token;

  const stats = await callRest("/rest/v1/rpc/get_realtime_slot_stats", token, {
    method: "POST",
    body: {}
  });

  assert.ok(typeof stats.used === "number" && stats.used >= 0,
    "used must be a non-negative number");
  assert.equal(stats.total, 10,
    "total must equal 10 (default realtime_slots in seed.sql)");
});

testFn("realtime: claim slot returns granted=true and session_id", async () => {
  const ts = Date.now();
  await adminCreateUser(`rt-claim-${ts}@example.test`, "TestPass123!");
  const signin = await signIn(`rt-claim-${ts}@example.test`, "TestPass123!");
  const token = signin.access_token;

  const result = await callRest("/rest/v1/rpc/claim_realtime_slot", token, {
    method: "POST",
    body: {}
  });

  assert.equal(result.granted, true, "granted must be true when slots are available");
  assert.equal(result.mode, "realtime", "mode must be 'realtime' when slots are available");

  // Cleanup
  await callRest("/rest/v1/rpc/release_realtime_slot", token, { method: "POST", body: {} });
});

testFn("realtime: stats increment after claim", async () => {
  const ts = Date.now();
  await adminCreateUser(`rt-count-${ts}@example.test`, "TestPass123!");
  const signin = await signIn(`rt-count-${ts}@example.test`, "TestPass123!");
  const token = signin.access_token;

  const before = await callRest("/rest/v1/rpc/get_realtime_slot_stats", token, {
    method: "POST",
    body: {}
  });
  await callRest("/rest/v1/rpc/claim_realtime_slot", token, { method: "POST", body: {} });
  const after = await callRest("/rest/v1/rpc/get_realtime_slot_stats", token, {
    method: "POST",
    body: {}
  });

  assert.equal(after.used, before.used + 1,
    "used must increment by exactly 1 after a new slot is claimed");

  // Cleanup
  await callRest("/rest/v1/rpc/release_realtime_slot", token, { method: "POST", body: {} });
});

testFn("realtime: release slot decrements used", async () => {
  const ts = Date.now();
  await adminCreateUser(`rt-release-${ts}@example.test`, "TestPass123!");
  const signin = await signIn(`rt-release-${ts}@example.test`, "TestPass123!");
  const token = signin.access_token;

  await callRest("/rest/v1/rpc/claim_realtime_slot", token, { method: "POST", body: {} });
  const afterClaim = await callRest("/rest/v1/rpc/get_realtime_slot_stats", token, {
    method: "POST",
    body: {}
  });
  await callRest("/rest/v1/rpc/release_realtime_slot", token, { method: "POST", body: {} });
  const afterRelease = await callRest("/rest/v1/rpc/get_realtime_slot_stats", token, {
    method: "POST",
    body: {}
  });

  assert.equal(afterRelease.used, afterClaim.used - 1,
    "used must decrement by exactly 1 after releasing a slot");
});

testFn("realtime: release is idempotent (double-release no error)", async () => {
  const ts = Date.now();
  await adminCreateUser(`rt-idem-${ts}@example.test`, "TestPass123!");
  const signin = await signIn(`rt-idem-${ts}@example.test`, "TestPass123!");
  const token = signin.access_token;

  await callRest("/rest/v1/rpc/claim_realtime_slot", token, { method: "POST", body: {} });
  await callRest("/rest/v1/rpc/release_realtime_slot", token, { method: "POST", body: {} });
  // Second release on an already-released session must not throw
  await callRest("/rest/v1/rpc/release_realtime_slot", token, { method: "POST", body: {} });
  // Reaching here without error is the assertion
});

testFn("realtime: slots=0 disables claiming (admin control)", async () => {
  const ts = Date.now();
  const adminRaw = await adminCreateUser(`rt-admin-${ts}@example.test`, "TestPass123!");
  await adminCreateUser(`rt-user-${ts}@example.test`, "TestPass123!");
  await adminSetUserIsAdmin(adminRaw.id);

  const adminSignin = await signIn(`rt-admin-${ts}@example.test`, "TestPass123!");
  const userSignin = await signIn(`rt-user-${ts}@example.test`, "TestPass123!");
  const adminToken = adminSignin.access_token;
  const userToken = userSignin.access_token;

  try {
    // Admin disables realtime globally
    await callRest("/rest/v1/rpc/admin_update_realtime_slots", adminToken, {
      method: "POST",
      body: { p_slots: 0 }
    });

    // Regular user attempts to claim — must be denied
    const result = await callRest("/rest/v1/rpc/claim_realtime_slot", userToken, {
      method: "POST",
      body: {}
    });

    assert.equal(result.granted, false,
      "granted must be false when realtime_slots = 0");
    assert.equal(result.mode, "polling",
      "mode must be 'polling' when realtime is administratively disabled");
  } finally {
    // Always restore — must not leave realtime disabled for subsequent tests
    await callRest("/rest/v1/rpc/admin_update_realtime_slots", adminToken, {
      method: "POST",
      body: { p_slots: 10 }
    });
  }
});
