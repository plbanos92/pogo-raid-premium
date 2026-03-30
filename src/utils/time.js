(function (global) {
  function toDate(input) {
    if (!input) return null;
    var d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function overlaps(startA, endA, startB, endB) {
    var aStart = toDate(startA);
    var aEnd = toDate(endA);
    var bStart = toDate(startB);
    var bEnd = toDate(endB);

    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return aStart < bEnd && bStart < aEnd;
  }

  function formatDateTime(value) {
    var d = toDate(value);
    if (!d) return "N/A";
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  global.TimeUtils = {
    overlaps: overlaps,
    formatDateTime: formatDateTime
  };
})(window);
