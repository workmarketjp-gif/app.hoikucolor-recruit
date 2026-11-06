import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftAfterConfirmedMessageSend } from '../src/lib/messageDraftIntegrity.ts';

test('canonical acknowledgement clears only the submitted unchanged draft', () => {
  assert.equal(draftAfterConfirmedMessageSend('園見学について質問です', '園見学について質問です'), '');
});
test('new text typed while the send is pending is retained intact', () => {
  assert.equal(draftAfterConfirmedMessageSend('次に別の質問をします', '園見学について質問です'), '次に別の質問をします');
});
test('additional Japanese text or a trailing newline is never dropped', () => {
  assert.equal(draftAfterConfirmedMessageSend('確認です\n追記', '確認です'), '確認です\n追記');
});
test('an earlier empty draft cannot wipe a later nonempty draft', () => {
  assert.equal(draftAfterConfirmedMessageSend('最新の下書き', ''), '最新の下書き');
});
