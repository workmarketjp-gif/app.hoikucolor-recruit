import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateMessageSendActionLabel } from '../src/lib/candidateMessageSendActionLabel.ts';

const state = (busy, sendPending, needsReview) => ({ busy, sendPending, needsReview });

test('Web-equivalent idle action is 送信する', () => {
  assert.equal(candidateMessageSendActionLabel(state(false, false, false)), '送信する');
});
test('SecureStore preparation retains 送信中… instead of an unrelated status', () => {
  assert.equal(candidateMessageSendActionLabel(state(true, true, false)), '送信中…');
});
test('RPC invocation can mark ambiguous-send safety flag without relabelling the live send', () => {
  assert.equal(candidateMessageSendActionLabel(state(true, true, true)), '送信中…');
});
test('expired or unconfirmed RPC displays review requirement rather than offering another send', () => {
  assert.equal(candidateMessageSendActionLabel(state(false, false, true)), '送信結果を確認');
});
test('explicit canonical message review has a distinct confirmation action state', () => {
  assert.equal(candidateMessageSendActionLabel(state(true, false, true)), '確認中…');
});
test('other in-flight decision never misleadingly says a message is sending', () => {
  assert.equal(candidateMessageSendActionLabel(state(true, false, false)), '処理中…');
});
test('after confirmed canonical readback the send label returns to the Web idle state', () => {
  assert.equal(candidateMessageSendActionLabel(state(false, false, false)), '送信する');
});
test('presentation label is deterministic for every boolean state', () => {
  for (const busy of [false, true]) for (const sendPending of [false, true]) for (const needsReview of [false, true]) {
    const label = candidateMessageSendActionLabel(state(busy, sendPending, needsReview));
    assert.equal(typeof label, 'string');
    assert.ok(label.length > 0);
  }
});
