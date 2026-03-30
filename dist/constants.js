(function (global) {
  global.AppConstants = {
    STATUS: {
      QUEUED: 'queued',
      INVITED: 'invited',
      CONFIRMED: 'confirmed',
      RAIDING: 'raiding',
      DONE: 'done',
      LEFT: 'left',
      CANCELLED: 'cancelled'
    },
    POLL: {
      HOT_MS: 2000,
      WARM_MS: 5000,
      IDLE_MS: 20000
    },
    MAINTENANCE: {
      HOT_MS: 10000,
      WARM_MS: 30000,
      IDLE_MS: 60000
    },
    INACTIVITY_TIMEOUT_S: 100,
    FRIEND_CODE_LENGTH: 12,
    FRIEND_CODE_BLOCK: 4,
    FORM_PERSIST_PREFIX: 'rsp:'
  };
})(window);
