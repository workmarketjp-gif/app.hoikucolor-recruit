import test from 'node:test';
import assert from 'node:assert/strict';
import { homeAttentionReadState } from '../src/lib/homeAttentionReadState.ts';
import { canShowCalmHomeLinks } from '../src/lib/homeCalmNavigation.ts';

const emptyAttention = Object.freeze({
  unread_messages_count: 0,
  unanswered_interviews_count: 0,
  pending_scouts_count: 0,
});
const base = (summary, warning = null, overrides = {}) => {
  const attention = homeAttentionReadState(summary, warning);
  return {
    applicationCount: 0,
    applicationLoading: false,
    applicationError: null,
    attentionSummary: summary,
    attentionLoaded: attention.loaded,
    attentionLoading: false,
    attentionError: attention.error,
    ...overrides,
  };
};

test('a confirmed independent attention read permits Web calm Home despite badge-count warning', () => {
  const warning = '通知の一部を取得できませんでした。更新して再確認してください。';
  assert.deepEqual(homeAttentionReadState(emptyAttention, warning), { loaded: true, error: null });
  assert.equal(canShowCalmHomeLinks(base(emptyAttention, warning)), true);
});

test('failed attention read remains unknown, even if notification list is loaded', () => {
  const warning = '通知の一部を取得できませんでした。更新して再確認してください。';
  assert.deepEqual(homeAttentionReadState(null, warning), { loaded: false, error: warning });
  assert.equal(canShowCalmHomeLinks(base(null, warning)), false);
});

test('initial loading and missing summary do not invent a zero state', () => {
  assert.deepEqual(homeAttentionReadState(null, null), { loaded: false, error: null });
  assert.equal(canShowCalmHomeLinks(base(null)), false);
  assert.equal(canShowCalmHomeLinks(base(emptyAttention, null, { attentionLoading: true })), false);
});

test('a confirmed nonzero message/interview/scout count still exposes actionable attention', () => {
  for (const key of Object.keys(emptyAttention)) {
    assert.equal(canShowCalmHomeLinks(base({ ...emptyAttention, [key]: 1 }, 'badge count failed')), false);
  }
});

test('application read failure or pending count still overrides an independent calm attention', () => {
  assert.equal(canShowCalmHomeLinks(base(emptyAttention, 'badge count failed', { applicationError: 'failure' })), false);
  assert.equal(canShowCalmHomeLinks(base(emptyAttention, null, { applicationCount: 1 })), false);
});
