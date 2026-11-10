import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationSelectionTimeline } from '../src/lib/applicationSelectionTimeline.ts';

const expectedLabels = ['応募', '書類確認', '面接', '内定', '採用'];

for (const [status, expectedCurrent] of [
  ['new', 0], ['applied', 0],
  ['reviewing', 1], ['screening', 1], ['review', 1],
  ['interview', 2], ['offered', 3], ['offer', 3], ['hired', 4],
]) {
  test(`Web progress semantics match canonical status ${status}`, () => {
    const timeline = applicationSelectionTimeline(status);
    assert.equal(timeline.terminal, false);
    assert.equal(timeline.terminalMessage, null);
    assert.deepEqual(timeline.steps.map((step) => step.label), expectedLabels);
    assert.deepEqual(timeline.steps.map((step) => step.complete),
      expectedLabels.map((_, index) => index <= expectedCurrent));
    assert.deepEqual(timeline.steps.map((step) => step.number), [1, 2, 3, 4, 5]);
  });
}

for (const [status, expectedMessage] of [
  ['withdrawn', '応募を辞退しました。'],
  ['rejected', '今回の選考は終了しました。'],
]) {
  test(`terminal ${status} never displays misleading completed stages`, () => {
    const timeline = applicationSelectionTimeline(status);
    assert.equal(timeline.terminal, true);
    assert.equal(timeline.terminalMessage, expectedMessage);
    assert.deepEqual(timeline.steps, []);
  });
}

test('unexpected status is not represented as an invented later milestone', () => {
  const timeline = applicationSelectionTimeline('unknown_future_status');
  assert.equal(timeline.terminal, false);
  assert.deepEqual(timeline.steps.map((step) => step.complete), [true, false, false, false, false]);
});
