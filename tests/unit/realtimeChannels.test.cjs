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

test("Channel 4 uses diagnostic-only subscribe callback (no demotion)", () => {
  const block = src.slice(
    src.indexOf("channel('boss-queue-changes')"),
    src.indexOf("channel('boss-meta-changes')")
  );
  assert.ok(
    block.includes("_channelSubscribeTrackOnly('boss-queue-changes')"),
    "Channel 4 subscribe must use _channelSubscribeTrackOnly (diagnostic-only)"
  );
  assert.ok(
    !block.includes("_channelSubscribeCallback('boss-queue-changes')"),
    "Channel 4 must NOT use _channelSubscribeCallback (which triggers demotion)"
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

test("Channel 5 uses diagnostic-only subscribe callback (no demotion)", () => {
  const block = src.slice(
    src.indexOf("channel('boss-meta-changes')"),
    src.indexOf("disconnect:")
  );
  assert.ok(
    block.includes("_channelSubscribeTrackOnly('boss-meta-changes')"),
    "Channel 5 subscribe must use _channelSubscribeTrackOnly (diagnostic-only)"
  );
  assert.ok(
    !block.includes("_channelSubscribeCallback('boss-meta-changes')"),
    "Channel 5 must NOT use _channelSubscribeCallback (which triggers demotion)"
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

// ── _channelSubscribeCallback factory ─────────────────────────────────────────

test("_channelSubscribeCallback factory exists and calls handleRealtimeDemotion", () => {
  assert.ok(
    /function\s+_channelSubscribeCallback\s*\(/.test(src),
    "_channelSubscribeCallback factory function must be declared"
  );
  assert.ok(
    src.includes("handleRealtimeDemotion("),
    "_channelSubscribeCallback must call handleRealtimeDemotion with channel info"
  );
});

test("_channelSubscribeCallback tracks channel status via SessionAudit", () => {
  assert.ok(
    src.includes("realtime.channel_status"),
    "_channelSubscribeCallback must track 'realtime.channel_status' event"
  );
});

test("_channelSubscribeTrackOnly factory exists and does NOT call handleRealtimeDemotion", () => {
  const match = src.match(/function\s+_channelSubscribeTrackOnly\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(match, "_channelSubscribeTrackOnly factory function must be declared");
  assert.ok(
    !match[1].includes("handleRealtimeDemotion"),
    "_channelSubscribeTrackOnly must NOT call handleRealtimeDemotion"
  );
  assert.ok(
    match[1].includes("realtime.channel_status"),
    "_channelSubscribeTrackOnly must track 'realtime.channel_status' event"
  );
});

// ── Channel 2: session-changes uses diagnostic-only subscribe callback ────────

test("Channel 2 uses _channelSubscribeTrackOnly (diagnostic-only, no demotion)", () => {
  const block = src.slice(
    src.indexOf("channel(ch2Name)") || src.indexOf("'session-changes-'"),
    src.indexOf("channel('raids-changes')")
  );
  assert.ok(
    block.includes("_channelSubscribeTrackOnly"),
    "Channel 2 must use _channelSubscribeTrackOnly (track status but NOT demote on TIMED_OUT)"
  );
  assert.ok(
    !block.includes("_channelSubscribeCallback(ch2Name)"),
    "Channel 2 must NOT use _channelSubscribeCallback (which triggers demotion)"
  );
});

// ── WS transport diagnostics ──────────────────────────────────────────────────

test("connect() tracks WS transport open/close/error events", () => {
  assert.ok(src.includes("realtime.ws_open"), "connect must track realtime.ws_open");
  assert.ok(src.includes("realtime.ws_close"), "connect must track realtime.ws_close");
  assert.ok(src.includes("realtime.ws_error"), "connect must track realtime.ws_error");
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
