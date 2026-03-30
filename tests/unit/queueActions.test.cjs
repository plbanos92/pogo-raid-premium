const test = require("node:test");
const assert = require("node:assert/strict");

const { shouldShowLeaveQueueButton } = require("../../src/utils/queueActions.js");

test("shouldShowLeaveQueueButton allows queued invited and confirmed", () => {
  assert.equal(shouldShowLeaveQueueButton("queued"), true);
  assert.equal(shouldShowLeaveQueueButton("invited"), true);
  assert.equal(shouldShowLeaveQueueButton("confirmed"), true);
});

test("shouldShowLeaveQueueButton hides terminal and unrelated states", () => {
  assert.equal(shouldShowLeaveQueueButton("left"), false);
  assert.equal(shouldShowLeaveQueueButton("cancelled"), false);
  assert.equal(shouldShowLeaveQueueButton("raiding"), false);
  assert.equal(shouldShowLeaveQueueButton("done"), false);
  assert.equal(shouldShowLeaveQueueButton(null), false);
});