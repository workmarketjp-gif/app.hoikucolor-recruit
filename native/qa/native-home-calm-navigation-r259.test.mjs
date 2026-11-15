import test from 'node:test';
import assert from 'node:assert/strict';
import { canShowCalmHomeLinks } from '../src/lib/homeCalmNavigation.ts';
import { homeInProgressApplicationCount } from '../src/lib/homeApplicationProgressCount.ts';
import { homeAttentionActions } from '../src/lib/homeAttentionActions.ts';

const zero = { unread_messages_count: 0, unanswered_interviews_count: 0, pending_scouts_count: 0,
  next_message: null, next_interview: null, next_scout: null };
const settled = (changes = {}) => ({ applicationCount: 0, applicationLoading: false,
  applicationError: null, attentionSummary: zero, attentionLoaded: true,
  attentionLoading: false, attentionError: null, ...changes });

test('canonical confirmed zero application + attention reads show calm links', () => {
  const applications = [{ status: 'hired' }, { status: 'withdrawn' }];
  assert.equal(canShowCalmHomeLinks(settled({
    applicationCount: homeInProgressApplicationCount(applications),
  })), true);
  assert.equal(homeAttentionActions(zero).message.count, 0);
});

test('unknown, loading and failed application reads cannot suppress the attention section', () => {
  for (const state of [
    { applicationCount: null },
    { applicationLoading: true },
    { applicationError: 'read failed' },
    { applicationCount: homeInProgressApplicationCount([{ status: 'offer' }]) },
  ]) assert.equal(canShowCalmHomeLinks(settled(state)), false);
});

test('unknown, loading and failed notification state cannot claim calm', () => {
  for (const state of [
    { attentionSummary: null },
    { attentionLoaded: false },
    { attentionLoading: true },
    { attentionError: 'partial attention failure' },
  ]) assert.equal(canShowCalmHomeLinks(settled(state)), false);
});

test('each pending Web attention category independently prevents calm', () => {
  for (const key of ['unread_messages_count', 'unanswered_interviews_count', 'pending_scouts_count']) {
    assert.equal(canShowCalmHomeLinks(settled({ attentionSummary: { ...zero, [key]: 1 } })), false);
  }
});

test('other notification-center unread items do not invent pending message count', () => {
  // Web's home calm state uses the attention summary, NOT OS push/notification badge count.
  assert.equal(canShowCalmHomeLinks(settled()), true);
});

test('malformed, partial or negative counters cannot produce false calm success', () => {
  for (const value of [undefined, null, -1, Number.NaN, '0']) {
    assert.equal(canShowCalmHomeLinks(settled({ attentionSummary: { ...zero, unread_messages_count: value } })), false);
  }
});
