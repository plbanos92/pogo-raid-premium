/**
 * Regression tests for the boss-card realtime relay channels (Channels 4 and 5).
 *
 * Background:
 *   - Channel 4 ('boss-queue-changes') subscribes to raid_queues with event:'*'.
 *     Supabase realtime enforces RLS before delivering events, so boss-level entries
 *     (raid_id = NULL) are never delivered to non-owner observers through this channel.
 *     It still serves raid-level entries visible to the host.
 *
 *   - Channel 5 ('boss-meta-changes') subscribes to raid_bosses (publicly readable).
 *     A SECURITY DEFINER trigger (trg_notify_boss_queue_change on raid_queues, and
 *     trg_notify_raids_boss_change on raids) touches raid_bosses.updated_at on any
 *     queue join/leave/status change and on any raid create/cancel/complete.
 *     Since raid_bosses has no RLS restriction for authenticated clients, Channel 5
 *     reliably delivers events to ALL connected realtime subscribers.
 *
 * These tests guard the channel names, table subscriptions, and demition callback
 * wiring against accidental removal or renaming.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(
  path.resolve(__dirname, "../../src/realtime/realtimeClient.js"),
  "utf8"
);

// ── Channel 4: raid_queues (unfiltered) ──────────────────────────────────────

test("Channel 4 subscribes to raid_queues with event '*'", () => {
  assert.ok(
    src.includes("client.channel('boss-queue-changes')"),
    "Channel 4 named 'boss-queue-changes' must be registered"
  );
  assert.ok(
    /channel\('boss-queue-changes'\)[\s\S]*?table:\s*'raid_queues'/.test(src),
    "Channel 4 must subscribe to table 'raid_queues'"
  );
  // Must use event:'*' (not INSERT-only) to catch UPDATE(status=left/invited/cancelled)
  assert.ok(
    /channel\('boss-queue-changes'\)[\s\S]*?event:\s*'\*'/.test(src),
    "Channel 4 must use event:'*' on raid_queues"
  );
});

test("Channel 4 calls scheduleRealtimeRefresh on change", () => {
  // Extract the boss-queue-changes block between its channel() call and the next channel() call
  const block = src.slice(
    src.indexOf("channel('boss-queue-changes')"),
    src.indexOf("channel('boss-meta-changes')")
  );
  assert.ok(
    block.includes("scheduleRealtimeRefresh()"),
    "Channel 4 handler must call scheduleRealtimeRefresh()"
  );
});

test("Channel 4 demotion callback handles CHANNEL_ERROR and TIMED_OUT", () => {
  const block = src.slice(
    src.indexOf("channel('boss-queue-changes')"),
    src.indexOf("channel('boss-meta-changes')")
  );
  assert.ok(
    block.includes("CHANNEL_ERROR"),
    "Channel 4 subscribe callback must handle CHANNEL_ERROR"
  );
  assert.ok(
    block.includes("TIMED_OUT"),
    "Channel 4 subscribe callback must handle TIMED_OUT"
  );
  assert.ok(
    block.includes("handleRealtimeDemotion()"),
    "Channel 4 subscribe callback must call handleRealtimeDemotion()"
  );
});

test("Channel 4 is pushed onto the _channels array", () => {
  const block = src.slice(
    src.indexOf("channel('boss-queue-changes')"),
    src.indexOf("channel('boss-meta-changes')")
  );
  assert.ok(
    block.includes("this._channels.push(bossQueueCh)"),
    "Channel 4 (bossQueueCh) must be pushed onto this._channels"
  );
});

// ── Channel 5: raid_bosses relay (public read — bypasses RLS for all clients) ──

test("Channel 5 subscribes to raid_bosses with event '*'", () => {
  assert.ok(
    src.includes("client.channel('boss-meta-changes')"),
    "Channel 5 named 'boss-meta-changes' must be registered"
  );
  assert.ok(
    /channel\('boss-meta-changes'\)[\s\S]*?table:\s*'raid_bosses'/.test(src),
    "Channel 5 must subscribe to table 'raid_bosses'"
  );
  assert.ok(
    /channel\('boss-meta-changes'\)[\s\S]*?event:\s*'\*'/.test(src),
    "Channel 5 must use event:'*' on raid_bosses"
  );
});

test("Channel 5 is NOT filtered by user_id (must reach all connected clients)", () => {
  const block = src.slice(
    src.indexOf("channel('boss-meta-changes')"),
    src.indexOf("disconnect:")
  );
  assert.ok(
    !block.includes("filter:"),
    "Channel 5 must have no filter — it must broadcast to all clients regardless of user"
  );
});

test("Channel 5 calls scheduleRealtimeRefresh on change", () => {
  const block = src.slice(
    src.indexOf("channel('boss-meta-changes')"),
    src.indexOf("disconnect:")
  );
  assert.ok(
    block.includes("scheduleRealtimeRefresh()"),
    "Channel 5 handler must call scheduleRealtimeRefresh()"
  );
});

test("Channel 5 demotion callback handles CHANNEL_ERROR and TIMED_OUT", () => {
  const block = src.slice(
    src.indexOf("channel('boss-meta-changes')"),
    src.indexOf("disconnect:")
  );
  assert.ok(
    block.includes("CHANNEL_ERROR"),
    "Channel 5 subscribe callback must handle CHANNEL_ERROR"
  );
  assert.ok(
    block.includes("TIMED_OUT"),
    "Channel 5 subscribe callback must handle TIMED_OUT"
  );
  assert.ok(
    block.includes("handleRealtimeDemotion()"),
    "Channel 5 subscribe callback must call handleRealtimeDemotion()"
  );
});

test("Channel 5 is pushed onto the _channels array", () => {
  const block = src.slice(
    src.indexOf("channel('boss-meta-changes')"),
    src.indexOf("disconnect:")
  );
  assert.ok(
    block.includes("this._channels.push(bossMetaCh)"),
    "Channel 5 (bossMetaCh) must be pushed onto this._channels"
  );
});

// ── Structural invariants: channels must appear in order ─────────────────────

test("All five channel names appear in the correct order", () => {
  const channels = [
    "'queue-changes-'",
    "'session-changes-'",
    "'raids-changes'",
    "'boss-queue-changes'",
    "'boss-meta-changes'",
  ];
  let lastIdx = -1;
  for (const name of channels) {
    const idx = src.indexOf(name);
    assert.ok(idx > lastIdx, `Channel ${name} must appear after the previous channel in connect()`);
    lastIdx = idx;
  }
});

test("disconnect() clears all channels via removeAllChannels", () => {
  const disconnectBlock = src.slice(src.indexOf("disconnect:"), src.indexOf("isConnected:"));
  assert.ok(
    disconnectBlock.includes("removeAllChannels()"),
    "disconnect() must call removeAllChannels() to clean up all registered channels"
  );
  assert.ok(
    disconnectBlock.includes("this._client = null"),
    "disconnect() must null out _client after removal"
  );
});
