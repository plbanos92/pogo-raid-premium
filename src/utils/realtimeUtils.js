(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RealtimeUtils = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Formats a slot stats object for display.
   * @param {{ used: number, total: number } | null} stats
   * @returns {string} e.g. "3 / 10" or "— / —" for null/invalid input
   */
  function formatRealtimeSlotStats(stats) {
    if (!stats || typeof stats.used !== 'number' || typeof stats.total !== 'number') {
      return '\u2014 / \u2014';
    }
    return stats.used + ' / ' + stats.total;
  }

  /**
   * Returns true if realtime mode is enabled (realtime_slots > 0).
   * @param {{ realtime_slots: number } | null | undefined} appConfig
   * @returns {boolean}
   */
  function isRealtimeEnabled(appConfig) {
    if (!appConfig || typeof appConfig.realtime_slots !== 'number') return false;
    return appConfig.realtime_slots > 0;
  }

  return {
    formatRealtimeSlotStats: formatRealtimeSlotStats,
    isRealtimeEnabled: isRealtimeEnabled,
  };
});
