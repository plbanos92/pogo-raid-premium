const test = require("node:test");
const assert = require("node:assert/strict");
const { detectQueueConflicts } = require("../../src/utils/conflictDetection.js");

test("detectQueueConflicts returns overlap for invited/confirmed queues", () => {
  const rows = [
    {
      id: "q1",
      raid_id: "r1",
      status: "invited",
      raids: {
        start_time: "2026-03-22T10:00:00Z",
        end_time: "2026-03-22T10:30:00Z"
      }
    },
    {
      id: "q2",
      raid_id: "r2",
      status: "confirmed",
      raids: {
        start_time: "2026-03-22T10:20:00Z",
        end_time: "2026-03-22T10:45:00Z"
      }
    }
  ];

  const conflicts = detectQueueConflicts(rows);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].leftQueueId, "q1");
  assert.equal(conflicts[0].rightQueueId, "q2");
});

test("detectQueueConflicts ignores queued-only rows", () => {
  const rows = [
    {
      id: "q1",
      raid_id: "r1",
      status: "queued",
      raids: {
        start_time: "2026-03-22T10:00:00Z",
        end_time: "2026-03-22T10:30:00Z"
      }
    },
    {
      id: "q2",
      raid_id: "r2",
      status: "queued",
      raids: {
        start_time: "2026-03-22T10:20:00Z",
        end_time: "2026-03-22T10:45:00Z"
      }
    }
  ];

  const conflicts = detectQueueConflicts(rows);
  assert.equal(conflicts.length, 0);
});

test("detectQueueConflicts handles non-overlap", () => {
  const rows = [
    {
      id: "q1",
      raid_id: "r1",
      status: "invited",
      raids: {
        start_time: "2026-03-22T10:00:00Z",
        end_time: "2026-03-22T10:30:00Z"
      }
    },
    {
      id: "q2",
      raid_id: "r2",
      status: "confirmed",
      raids: {
        start_time: "2026-03-22T10:31:00Z",
        end_time: "2026-03-22T10:55:00Z"
      }
    }
  ];

  const conflicts = detectQueueConflicts(rows);
  assert.equal(conflicts.length, 0);
});
