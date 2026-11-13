import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { loadIndependentMessageInbox } from '../src/lib/messageInboxIndependentLoad.ts';
import { readApplicationDocumentSnapshot } from '../src/lib/applicationDocumentSnapshotRead.ts';

const spin = async () => { for (let n = 0; n < 12; n += 1) await Promise.resolve(); };

test('the authentic messages screen imports the materialized independent inbox helper', () => {
  const inboxPath = new URL('../src/app/messages.tsx', import.meta.url);
  // No fabricated JSX runner: this is an explicit source-link check, not a render claim.
  assert.equal(existsSync(new URL('../src/lib/messageInboxIndependentLoad.ts', import.meta.url)), true);
  const inbox = readFileSync(inboxPath, 'utf8');
  assert.match(inbox, /import \{ loadIndependentMessageInbox \} from '\.\.\/lib\/messageInboxIndependentLoad';/);
  assert.match(inbox, /await loadIndependentMessageInbox\(/);

});

test('authorized message threads become usable before slow unread summary resolves', async () => {
  let finishAttention;
  const attention = new Promise(resolve => { finishAttention = resolve; });
  const events = [];
  await loadIndependentMessageInbox({
    loadApplications: async () => [{ id: 'synthetic-app-A' }],
    loadAttention: () => attention,
    isCurrent: () => true,
    onApplications: rows => events.push(['threads', rows.length]),
    onAttention: result => events.push(['unread', result.status]),
  });
  assert.deepEqual(events, [['threads', 1]]);
  finishAttention({ unreadCount: 2 });
  await spin();
  assert.deepEqual(events, [['threads', 1], ['unread', 'fulfilled']]);
});

test('failed unread summary stays unknown, not zero, while verified threads remain displayed', async () => {
  const events = [];
  await loadIndependentMessageInbox({
    loadApplications: async () => ['synthetic-thread-A'],
    loadAttention: async () => { throw new Error('synthetic timeout'); },
    isCurrent: () => true,
    onApplications: value => events.push(['threads', value.length]),
    onAttention: result => events.push(['unread', result.status]),
  });
  await spin();
  assert.deepEqual(events, [['threads', 1], ['unread', 'rejected']]);
});

test('an unauthorized application document row is rejected before presentation', async () => {
  await assert.rejects(readApplicationDocumentSnapshot({
    ownerId: 'synthetic-candidate-A', applicationId: 'synthetic-app-A',
    isCurrent: () => true,
    loadSaved: async () => [{ jobseeker_clerk_user_id: 'synthetic-candidate-A' }],
    loadSubmitted: async () => [{ application_id: 'synthetic-app-B' }],
    loadExpectations: async () => [],
  }), /所有者または応募先/);
});
