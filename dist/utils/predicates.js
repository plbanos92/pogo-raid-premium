(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(null);
  } else {
    root.RaidPredicates = factory(root.QueueFSM);
  }
})(typeof self !== "undefined" ? self : this, function (QueueFSM) {
  function isJoinable(status) {
    if (QueueFSM) return QueueFSM.getRaidStatusMeta(status).isJoinable;
    return status === 'open' || status === 'lobby';
  }

  function isActive(status) {
    if (QueueFSM) return QueueFSM.getRaidStatusMeta(status).isActive;
    return !!(status && status !== 'completed' && status !== 'cancelled');
  }

  function isTerminal(status) {
    if (QueueFSM) return QueueFSM.getRaidStatusMeta(status).isTerminal;
    return status === 'completed' || status === 'cancelled';
  }

  return {
    isJoinable: isJoinable,
    isActive: isActive,
    isTerminal: isTerminal
  };
});
