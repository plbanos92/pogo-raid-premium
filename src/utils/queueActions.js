(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.QueueActionUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function shouldShowLeaveQueueButton(status) {
    return status === 'queued' || status === 'invited' || status === 'confirmed';
  }

  return {
    shouldShowLeaveQueueButton: shouldShowLeaveQueueButton
  };
});