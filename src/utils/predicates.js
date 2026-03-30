(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RaidPredicates = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function isJoinable(status) {
    return status === 'open' || status === 'lobby';
  }

  function isActive(status) {
    return !!(status && status !== 'completed' && status !== 'cancelled');
  }

  function isTerminal(status) {
    return status === 'completed' || status === 'cancelled';
  }

  return {
    isJoinable: isJoinable,
    isActive: isActive,
    isTerminal: isTerminal
  };
});
