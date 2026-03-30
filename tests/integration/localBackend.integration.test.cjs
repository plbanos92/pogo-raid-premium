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
