import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatSpotClosingAt, spotRemainingSlotsLabel, spotEmptyJobsMessage,
} from '../src/lib/spotJobWebPresentation.ts';

test('Web /spot closing timestamp is shown in Japanese Tokyo time (not device time)', () => {
  assert.equal(formatSpotClosingAt('2026-11-19T05:30:00Z'), '11/19 14:30');
  assert.equal(formatSpotClosingAt('2026-11-19T23:10:00+09:00'), '11/19 23:10');
  assert.equal(formatSpotClosingAt('2026-11-19T18:30:00Z'), '11/20 03:30');
});

test('missing closing time is omitted but malformed time never becomes a made-up date', () => {
  assert.equal(formatSpotClosingAt(null), null);
  assert.equal(formatSpotClosingAt('not-a-date'), '日時を確認できません');
});

test('slot count explains confirmed shifts are already excluded', () => {
  assert.equal(spotRemainingSlotsLabel(0), '確定済みを除く残り 0枠');
  assert.equal(spotRemainingSlotsLabel(2), '確定済みを除く残り 2枠');
});

test('Web empty job copy depends on actual confirmed assignment section', () => {
  assert.equal(spotEmptyJobsMessage(false), '新しい勤務枠が公開されると、ここに表示されます。');
  assert.equal(spotEmptyJobsMessage(true), '確定済みの勤務は上の「あなたのスポット勤務」から確認できます。');
});
