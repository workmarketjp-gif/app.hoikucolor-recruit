import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readIndependentMessageAttention, loadIndependentMessageInbox } from '../src/lib/messageInboxIndependentLoad.ts';

const flush = async () => { for (let n = 0; n < 8; n += 1) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('Web attention.retry parity: a candidate can refresh unread metadata without re-fetching authorized threads', async () => {
  let applicationCalls = 0, summaryCalls = 0;
  const threads = [];
  const summaries = [];
  await loadIndependentMessageInbox({
    loadApplications: async () => { applicationCalls++; return ['synthetic-authorized-application']; },
    loadAttention: async () => { summaryCalls++; throw new Error('synthetic network loss'); },
    isCurrent: () => true, onApplications: value => threads.push(value),
    onAttention: value => summaries.push(value),
  });
  await flush();
  assert.equal(applicationCalls, 1);
  assert.equal(summaryCalls, 1);
  assert.deepEqual(summaries, [{ status: 'rejected' }]);

  await readIndependentMessageAttention({
    loadAttention: async () => { summaryCalls++; return { unread_messages_count: 3 }; },
    isCurrent: () => true, onAttention: value => summaries.push(value),
  });
  assert.deepEqual(threads, [['synthetic-authorized-application']]);
  assert.equal(applicationCalls, 1);
  assert.equal(summaryCalls, 2);
  assert.deepEqual(summaries[1], { status: 'fulfilled', value: { unread_messages_count: 3 } });
});

test('optional retry cannot start an RPC after session/App Lock revocation before microtask', async () => {
  let current = true, rpcCalls = 0; const published = [];
  const pending = readIndependentMessageAttention({
    loadAttention: async () => { rpcCalls++; return { unread_messages_count: 4 }; },
    isCurrent: () => current,
    onAttention: value => published.push(value),
  });
  current = false;
  await pending;
  assert.equal(rpcCalls, 0);
  assert.deepEqual(published, []);
});

test('late unread metadata is fenced when account changes during the request', async () => {
  const old = deferred(); let current = true; const published = [];
  const pending = readIndependentMessageAttention({
    loadAttention: () => old.promise, isCurrent: () => current,
    onAttention: value => published.push(value),
  });
  await flush(); current = false;
  old.resolve({ unread_messages_count: 99 });
  await pending;
  assert.deepEqual(published, []);
});

test('latest request supersedes earlier summary and cannot be overwritten by a late response', async () => {
  const old = deferred(); const published = []; let readSerial = 1;
  const first = readIndependentMessageAttention({
    loadAttention: () => old.promise, isCurrent: () => readSerial === 1,
    onAttention: value => published.push(['old', value]),
  });
  await flush(); readSerial = 2;
  await readIndependentMessageAttention({
    loadAttention: async () => ({ unread_messages_count: 1 }), isCurrent: () => readSerial === 2,
    onAttention: value => published.push(['latest', value]),
  });
  old.resolve({ unread_messages_count: 99 }); await first;
  assert.deepEqual(published, [['latest', { status: 'fulfilled', value: { unread_messages_count: 1 } }]]);
});

test('a stalled optional summary returns explicit unknown, never a fabricated unread zero', async () => {
  const results = [];
  await readIndependentMessageAttention({
    loadAttention: () => new Promise(() => {}), timeoutMs: 10, isCurrent: () => true,
    onAttention: result => results.push(result),
  });
  assert.deepEqual(results, [{ status: 'rejected' }]);
});

test('a failed retry does not automatically issue another RPC or lose state', async () => {
  let calls = 0; const events = [];
  await readIndependentMessageAttention({
    loadAttention: async () => { calls++; throw new Error('synthetic unavailable'); },
    isCurrent: () => true, onAttention: result => events.push(result),
  });
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(events, [{ status: 'rejected' }]);
});

test('real Native messages screen wires explicit retry to pinned canonical attention while preserving the thread index', () => {
  const source = readFileSync(new URL('../src/app/messages.tsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ loadIndependentMessageInbox, readIndependentMessageAttention \}/);
  assert.match(source, /const retryAttention = async \(\) => \{/);
  assert.match(source, /await pinCandidateForRead\(pinCandidateAction, isCurrent\)/);
  assert.match(source, /await readIndependentMessageAttention\(/);
  assert.match(source, /loadAttention: \(\) => getJobseekerAttentionSummary\(pinned\.client\)/);
  assert.match(source, /attentionRequest === attentionReadRequest\.current/);
  assert.match(source, /attentionRetryPending\.current/);
  assert.match(source, /onPress=\{\(\) => void retryAttention\(\)\}/);
  assert.match(source, /新着件数を再試行/);
  const retryBody = source.split('const retryAttention = async () => {')[1].split('  const visibleApplications =')[0];
  assert.doesNotMatch(retryBody, /setApplications\(|listApplications\(/);
  assert.doesNotMatch(retryBody, /submitApplication\(|sendApplicationMessage/);
});
