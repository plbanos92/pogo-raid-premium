(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ConflictUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var ACTIVE_STATUS = {
    invited: true,
    confirmed: true
  };

  function overlaps(startA, endA, startB, endB) {
    var aStart = new Date(startA);
    var aEnd = new Date(endA);
    var bStart = new Date(startB);
    var bEnd = new Date(endB);

    if (Number.isNaN(aStart.getTime()) || Number.isNaN(aEnd.getTime())) return false;
    if (Number.isNaN(bStart.getTime()) || Number.isNaN(bEnd.getTime())) return false;

    return aStart < bEnd && bStart < aEnd;
  }

  function getRaid(row) {
    if (!row || !row.raids) return null;
    return Array.isArray(row.raids) ? row.raids[0] : row.raids;
  }

  function detectQueueConflicts(queueRows) {
    var rows = Array.isArray(queueRows) ? queueRows : [];
    var conflicts = [];

    for (var i = 0; i < rows.length; i += 1) {
      var left = rows[i];
      if (!ACTIVE_STATUS[left.status]) continue;

      var leftRaid = getRaid(left);
      if (!leftRaid) continue;

      for (var j = i + 1; j < rows.length; j += 1) {
        var right = rows[j];
        if (!ACTIVE_STATUS[right.status]) continue;

        var rightRaid = getRaid(right);
        if (!rightRaid) continue;

        if (overlaps(leftRaid.start_time, leftRaid.end_time, rightRaid.start_time, rightRaid.end_time)) {
          conflicts.push({
            leftQueueId: left.id,
            rightQueueId: right.id,
            leftRaidId: left.raid_id,
            rightRaidId: right.raid_id,
            leftRaid: leftRaid,
            rightRaid: rightRaid,
            reason: "overlapping_invites_or_confirmations"
          });
        }
      }
    }

    return conflicts;
  }

  return {
    detectQueueConflicts: detectQueueConflicts
  };
});
