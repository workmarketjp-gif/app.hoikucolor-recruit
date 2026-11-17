import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ApplicationDocumentsSection.tsx', import.meta.url), 'utf8');
const submitStart = source.indexOf('  const submitDocuments = async ');
const openStart = source.indexOf('  const openSubmitted = async ');

test('r320: document submission pins a current session with a bounded pre-write token read', () => {
  assert.ok(submitStart >= 0 && openStart > submitStart, 'real Native document submission handler exists');
  assert.match(source, /import \{ pinForApplicationMutation \} from '\.\.\/lib\/applicationMutationPin';/);
  const submit = source.slice(submitStart, openStart);
  assert.match(submit, /await pinForApplicationMutation\(pinCandidateAction, prewriteCurrent\)/);
  assert.doesNotMatch(submit, /const pinned = await pinCandidateAction\(\)/);
  assert.match(submit, /presentationEpoch\.current === requestedPresentationEpoch/);
  assert.match(submit, /AppState\.currentState === 'active'/);
  assert.match(submit, /open && focusedRef\.current/);
  assert.match(submit, /privacy\.canAccessPrivateData\(\)/);
  assert.match(submit, /contextLease\.current\.viewKey === requestedViewKey/);
  assert.match(submit, /candidateViewOwnerKey\(pinned\.ownerId, pinned\.ownerSessionId\) !== requestedOwnerKey/);
});

test('r320: only a started attachment gets the ambiguous-write warning and snapshot quarantine', () => {
  const submit = source.slice(submitStart, openStart);
  assert.match(submit, /submissionStarted = true;\s*await attachJobseekerDocumentToApplication/);
  assert.match(submit, /if \(submissionStarted\) \{[\s\S]*?setSnapshot\(null\)/);
  assert.match(submit, /setError\('ログイン状態を確認できませんでした。書類は提出していません。/);
  assert.match(submit, /const \{ saved, submitted, expectations \} = await readApplicationDocumentSnapshot\(/);
  assert.doesNotMatch(submit, /await attachJobseekerDocumentToApplication[\s\S]*?catch \{[\s\S]*?await attachJobseekerDocumentToApplication/);
});
