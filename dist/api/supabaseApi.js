(function (global) {
  function parseResponse(res) {
    return res.text().then(function (text) {
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        data = { raw: text };
      }

      if (!res.ok) {
        var message = data && (data.msg || data.message || data.error_description || data.error) || ("HTTP " + res.status);
        var error = new Error(message);
        error.status = res.status;
        error.payload = data;
        throw error;
      }

      return data;
    });
  }

  function createApiClient(config) {
    function request(path, options) {
      var opts = options || {};
      var headers = Object.assign({
        "Content-Type": "application/json"
      }, opts.headers || {});

      if (config.token) {
        headers.Authorization = "Bearer " + config.token;
      }

      return fetch("/api" + path, {
        method: opts.method || "GET",
        headers: headers,
        body: typeof opts.body === "undefined" ? undefined : JSON.stringify(opts.body)
      }).then(parseResponse);
    }

    return {
      signUp: function (email, password) {
        return request("/auth/v1/signup", {
          method: "POST",
          body: { email: email, password: password }
        });
      },
      signIn: function (email, password) {
        return request("/auth/v1/token?grant_type=password", {
          method: "POST",
          body: { email: email, password: password }
        });
      },
      listActiveRaids: function () {
        return request("/rest/v1/raids?is_active=eq.true&select=id,raid_boss_id,host_user_id,location_name,start_time,end_time,capacity,friend_code,status,raid_bosses(id,name,tier,pokemon_id,image_url)&order=start_time.asc");
      },
      listBossQueueStats: function () {
        return request("/rest/v1/boss_queue_stats?select=id,name,tier,pokemon_id,cp,image_url,types,active_hosts,queue_length&order=queue_length.desc");
      },
      listRaidBosses: function () {
        return request("/rest/v1/raid_bosses?select=id,name,tier,pokemon_id,cp,image_url,types&order=tier.desc,name.asc").catch(function () {
          return request("/rest/v1/raid_bosses?select=id,name,tier,pokemon_id&order=tier.desc,name.asc");
        });
      },
      listMyQueues: function (userId) {
        return request("/rest/v1/raid_queues?user_id=eq." + encodeURIComponent(userId) + "&status=in.(queued,invited,confirmed,raiding,done)&select=id,raid_id,user_id,status,position,is_vip,note,joined_at,invited_at,raids(raid_boss_id,location_name,start_time,end_time,friend_code,status,raid_bosses(id,name,tier,pokemon_id,image_url))&order=joined_at.asc");
      },
      listMyHostedRaids: function (userId) {
        return request("/rest/v1/raids?host_user_id=eq." + encodeURIComponent(userId) + "&is_active=eq.true&select=id,raid_boss_id,location_name,capacity,friend_code,created_at,last_host_action_at,host_finished_at,status,raid_bosses(id,name,tier,pokemon_id,image_url)&order=created_at.desc");
      },
      joinRaidQueue: function (raidId, note) {
        return request("/rest/v1/rpc/join_raid_queue", {
          method: "POST",
          body: {
            p_raid_id: raidId,
            p_note: note || "Joined from web app"
          }
        });
      },
      joinBossQueue: function (bossId, note) {
        return request("/rest/v1/rpc/join_boss_queue", {
          method: "POST",
          body: {
            p_boss_id: bossId,
            p_note: note || "Joined from web app"
          }
        });
      },
      createRaid: function (payload) {
        return request("/rest/v1/raids", {
          method: "POST",
          headers: {
            Prefer: "return=representation"
          },
          body: {
            host_user_id: payload.hostUserId,
            raid_boss_id: payload.raidBossId,
            location_name: payload.locationName,
            start_time: payload.startTime,
            end_time: payload.endTime,
            capacity: payload.capacity,
            is_active: true,
            friend_code: payload.friendCode
          }
        }).catch(function () {
          return request("/rest/v1/raids", {
            method: "POST",
            headers: {
              Prefer: "return=representation"
            },
            body: {
              host_user_id: payload.hostUserId,
              raid_boss_id: payload.raidBossId,
              location_name: payload.locationName,
              start_time: payload.startTime,
              end_time: payload.endTime,
              capacity: payload.capacity,
              is_active: true
            }
          });
        });
      },
      getVipStatus: function (userId) {
        return request("/rest/v1/subscriptions?user_id=eq." + encodeURIComponent(userId) + "&is_vip=eq.true&status=eq.active&select=id&limit=1");
      },
      activateVip: function (userId) {
        return request("/rest/v1/subscriptions", {
          method: "POST",
          headers: {
            Prefer: "return=representation"
          },
          body: {
            user_id: userId,
            provider: "manual",
            status: "active",
            is_vip: true,
            starts_at: new Date().toISOString()
          }
        });
      },
      deactivateVip: function (userId) {
        return request("/rest/v1/subscriptions?user_id=eq." + encodeURIComponent(userId) + "&is_vip=eq.true&status=eq.active", {
          method: "PATCH",
          headers: {
            Prefer: "return=representation"
          },
          body: {
            status: "cancelled"
          }
        });
      },
      leaveQueue: function (queueId, note) {
        return request("/rest/v1/rpc/leave_queue_and_promote", {
          method: "POST",
          body: {
            p_queue_id: queueId,
            p_note: note || "Left due to conflict"
          }
        });
      },
      confirmInvite: function (queueId) {
        return request("/rest/v1/rpc/user_confirm_invite", {
          method: "POST",
          body: { p_queue_id: queueId }
        });
      },
      expireStaleInvites: function (raidId) {
        return request("/rest/v1/rpc/expire_stale_invites", {
          method: "POST",
          body: { p_raid_id: raidId }
        });
      },
      startRaid: function (raidId) {
        return request("/rest/v1/rpc/start_raid", {
          method: "POST",
          body: { p_raid_id: raidId }
        });
      },
      checkHostInactivity: function (raidId) {
        return request("/rest/v1/rpc/check_host_inactivity", {
          method: "POST",
          body: { p_raid_id: raidId }
        });
      },
      listRaidQueue: function (raidId) {
        return request("/rest/v1/rpc/list_raid_queue", {
          method: "POST",
          body: { p_raid_id: raidId }
        });
      },
      getRaidHostProfile: function (raidId) {
        return request("/rest/v1/rpc/get_raid_host_profile", {
          method: "POST",
          body: { p_raid_id: raidId }
        });
      },
      finishRaiding: function (queueId) {
        return request("/rest/v1/rpc/finish_raiding", {
          method: "POST",
          body: { p_queue_id: queueId }
        });
      },
      hostFinishRaiding: function (raidId) {
        return request("/rest/v1/rpc/host_finish_raiding", {
          method: "POST",
          body: { p_raid_id: raidId }
        });
      },
      getMyProfile: function (userId) {
        return request("/rest/v1/user_profiles?auth_id=eq." + encodeURIComponent(userId) + "&select=auth_id,in_game_name,friend_code,trainer_level,team,created_at&limit=1");
      },
      ensureMyProfile: function (userId) {
        return request("/rest/v1/user_profiles", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          body: {
            auth_id: userId
          }
        });
      },
      getMyAccountStats: function () {
        return request("/rest/v1/rpc/get_my_account_stats", { method: "POST" });
      },
      updateMyProfile: function (userId, data) {
        return request("/rest/v1/user_profiles?auth_id=eq." + encodeURIComponent(userId), {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: data
        });
      },
      getQueueSnapshot: function (raidId) {
        return request("/rest/v1/rpc/get_raid_queue_snapshot", {
          method: "POST",
          body: { p_raid_id: raidId }
        });
      },
      getQueueSyncState: function (managingRaidId) {
        return request("/rest/v1/rpc/get_queue_sync_state", {
          method: "POST",
          body: { p_managing_raid_id: managingRaidId || null }
        });
      },
      adminListAllBosses: function () {
        return request("/rest/v1/rpc/admin_list_all_bosses", { method: "POST" });
      },
      adminCreateBoss: function (boss) {
        return request("/rest/v1/rpc/admin_create_boss", {
          method: "POST",
          body: {
            p_name: boss.name,
            p_tier: boss.tier || null,
            p_pokemon_id: boss.pokemonId || null,
            p_cp: boss.cp || null,
            p_image_url: boss.imageUrl || null,
            p_types: boss.types || [],
            p_available_from: boss.availableFrom || null,
            p_available_until: boss.availableUntil || null,
            p_is_visible: boss.isVisible !== undefined ? boss.isVisible : true
          }
        });
      },
      adminUpdateBoss: function (bossId, updates) {
        return request("/rest/v1/rpc/admin_update_boss", {
          method: "POST",
          body: {
            p_boss_id: bossId,
            p_name: updates.name || null,
            p_tier: updates.tier || null,
            p_pokemon_id: updates.pokemonId || null,
            p_cp: updates.cp || null,
            p_image_url: updates.imageUrl || null,
            p_types: updates.types || null,
            p_available_from: updates.availableFrom || null,
            p_available_until: updates.availableUntil || null,
            p_is_visible: updates.isVisible !== undefined ? updates.isVisible : null
          }
        });
      },
      checkIsAdmin: function (userId) {
        return request("/rest/v1/user_profiles?auth_id=eq." + encodeURIComponent(userId) + "&select=is_admin")
          .then(function (rows) {
            return Array.isArray(rows) && rows.length > 0 && rows[0].is_admin === true;
          });
      },
      getAppConfig: function () {
        return request("/rest/v1/app_config?id=eq.1&select=host_capacity_free,host_capacity_vip,vip_price,vip_price_period,invite_window_seconds,host_inactivity_seconds,vip_features&limit=1");
      }
    };
  }

  global.SupabaseApi = {
    createApiClient: createApiClient
  };
})(window);
