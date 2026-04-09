(function () {
  'use strict';

  var _realtimeDebounceTimer = null;

  function scheduleRealtimeRefresh() {
    if (_realtimeDebounceTimer) clearTimeout(_realtimeDebounceTimer);
    _realtimeDebounceTimer = setTimeout(function () {
      _realtimeDebounceTimer = null;
      if (typeof window.App !== 'undefined' && window.App.handleRealtimeEvent) {
        window.App.handleRealtimeEvent();
      }
    }, 300);
  }

  // Audit helper — uses realtime_debug category for per-channel diagnostics
  function _trackDebug(eventName, payload) {
    if (typeof window.SessionAudit !== 'undefined' && window.SessionAudit.track) {
      window.SessionAudit.track('realtime_debug', eventName, payload || {}, false);
    }
  }

  // Subscribe callback factory — tracks per-channel status and demotes on error
  function _channelSubscribeCallback(channelName) {
    return function (status) {
      _trackDebug('realtime.channel_status', { channel: channelName, status: status });
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        window.App.handleRealtimeDemotion(channelName, status);
      }
    };
  }

  // Diagnostic-only subscribe callback — tracks status without triggering demotion.
  // Used for Channel 2 (realtime_sessions) where the DELETE handler already calls
  // handleRealtimeDemotion directly, and TIMED_OUT on this channel is expected
  // (realtime_sessions RLS is user-scoped; the channel may fail to subscribe
  // depending on timing and server-side ack behaviour).
  function _channelSubscribeTrackOnly(channelName) {
    return function (status) {
      _trackDebug('realtime.channel_status', { channel: channelName, status: status });
    };
  }

  var AppRealtime = {
    _client: null,
    _channels: [],

    // getTokenFn: function()→string — called by accessToken callback on every WS auth.
    // Avoids stale-JWT CHANNEL_ERROR after Supabase token refresh cycles.
    connect: function (supabaseUrl, anonKey, getTokenFn, userId) {
      var client = new window.RealtimeClient(supabaseUrl + '/realtime/v1', {
        params: { apikey: anonKey },
        accessToken: function () { return Promise.resolve(getTokenFn()); },
      });
      this._client = client;
      this._channels = [];

      client.connect(); // MUST precede channel setup

      // WS transport-level events for diagnostics
      if (client.conn) {
        client.conn.onopen = function () { _trackDebug('realtime.ws_open', {}); };
        client.conn.onclose = function (e) { _trackDebug('realtime.ws_close', { code: e && e.code, reason: e && e.reason }); };
        client.conn.onerror = function () { _trackDebug('realtime.ws_error', {}); };
      }

      // Channel 1: user's own queue changes — notification-only, debounced
      var ch1Name = 'queue-changes-' + userId;
      var queueCh = client.channel(ch1Name);
      queueCh.on('postgres_changes',
        { event: '*', schema: 'public', table: 'raid_queues', filter: 'user_id=eq.' + userId },
        function () { scheduleRealtimeRefresh(); }
      ).subscribe(_channelSubscribeTrackOnly(ch1Name));
      this._channels.push(queueCh);

      // Channel 2: own eviction detection — DELETE only, immediate (no debounce)
      var ch2Name = 'session-changes-' + userId;
      var sessionCh = client.channel(ch2Name);
      sessionCh.on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'realtime_sessions', filter: 'user_id=eq.' + userId },
        function () { window.App.handleRealtimeDemotion(ch2Name, 'EVICTION'); }
      ).subscribe(_channelSubscribeTrackOnly(ch2Name));
      this._channels.push(sessionCh);

      // Channel 3: any raid row change — triggers boss card active_hosts refresh.
      // Covers: host creates raid (INSERT → active_hosts↑), host cancels/completes (UPDATE → active_hosts↓).
      var raidsCh = client.channel('raids-changes');
      raidsCh.on('postgres_changes',
        { event: '*', schema: 'public', table: 'raids' },
        function () { scheduleRealtimeRefresh(); }
      ).subscribe(_channelSubscribeTrackOnly('raids-changes'));
      this._channels.push(raidsCh);

      // Channel 4: any raid_queues row change — fires for raid-level entries visible to
      // this subscriber via RLS (e.g. a host watching their own raid's queue members).
      // NOTE: boss-level entries (raid_id = NULL) fail RLS for non-owners and are NOT
      // delivered through this channel to observers. Channel 5 covers that gap.
      var bossQueueCh = client.channel('boss-queue-changes');
      bossQueueCh.on('postgres_changes',
        { event: '*', schema: 'public', table: 'raid_queues' },
        function () { scheduleRealtimeRefresh(); }
      ).subscribe(_channelSubscribeTrackOnly('boss-queue-changes'));
      this._channels.push(bossQueueCh);

      // Channel 5: raid_bosses update — relay for boss-level queue counter changes.
      // A SECURITY DEFINER trigger (trg_notify_boss_queue_change) touches
      // raid_bosses.updated_at on every raid_queues INSERT/UPDATE(status)/DELETE.
      // Since raid_bosses is publicly readable (anon + authenticated), this channel
      // delivers events to ALL connected clients regardless of their queue ownership,
      // ensuring boss card queue_length and active_hosts counters stay current.
      var bossMetaCh = client.channel('boss-meta-changes');
      bossMetaCh.on('postgres_changes',
        { event: '*', schema: 'public', table: 'raid_bosses' },
        function () { scheduleRealtimeRefresh(); }
      ).subscribe(_channelSubscribeTrackOnly('boss-meta-changes'));
      this._channels.push(bossMetaCh);
    },

    disconnect: function () {
      // Clear pending debounce first to prevent post-teardown refreshData() call
      if (_realtimeDebounceTimer) {
        clearTimeout(_realtimeDebounceTimer);
        _realtimeDebounceTimer = null;
      }
      if (this._client) {
        this._client.removeAllChannels(); // sends LEAVE for each channel; auto-disconnects WS
        this._client = null;
        this._channels = [];
      }
    },

    isConnected: function () {
      return this._client !== null && this._client.isConnected();
    },
  };

  window.AppRealtime = AppRealtime;
})();
