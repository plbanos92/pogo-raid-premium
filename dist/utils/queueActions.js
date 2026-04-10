(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(null);
  } else {
    root.QueueActionUtils = factory(root.QueueFSM);
  }
})(typeof self !== "undefined" ? self : this, function (QueueFSM) {
  function shouldShowLeaveQueueButton(status) {
    if (QueueFSM) return QueueFSM.getQueueStatusMeta(status).isLeavable;
    return status === 'queued' || status === 'invited' || status === 'confirmed';
  }

  return {
    shouldShowLeaveQueueButton: shouldShowLeaveQueueButton
  };
});