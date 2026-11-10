import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Source wiring checks supplement focused lease tests. They are NOT Native
// runtime or application-level TypeScript checks.
const source = readFileSync(new URL('../src/app/application/[id].tsx', import.meta.url), 'utf8');
const start = source.indexOf('function InterviewCard(');
const end = source.indexOf('/**\n * Keeping the data-bearing subtree', start);
assert.ok(start >= 0 && end > start, 'InterviewCard source is present');
const card = source.slice(start, end);

test('interview action acquires synchronous lease and revokes it on screen blur', () => {
  assert.match(card, /const token = responseGate\.begin\(\);/);
  assert.match(card, /useFocusEffect\(useCallback\(/);
  assert.match(card, /responseGate\.revoke\(\);/);
  assert.doesNotMatch(card, /actionPending/);
});

test('Clerk session and focus lease must remain valid before interview RPC', () => {
  const beforeMutation = card.slice(0, card.indexOf('await respondToInterviewDurable('));
  assert.match(beforeMutation, /const pinned = await pinCandidateAction\(\);/);
  assert.match(beforeMutation, /!pinned\.isCurrent\(\) \|\| !stillCurrent\(\)/);
  assert.match(card, /await respondToInterviewDurable\(/);
});

test('stale responses cannot update the screen and answer buttons remain gated', () => {
  assert.match(card, /await onChanged\(\);\s+if \(!pinned\.isCurrent\(\) \|\| !stillCurrent\(\)\) return;/);
  assert.match(card, /if \(stillCurrent\(\)\) setError\(/);
  assert.match(card, /responseGate\.finish\(token\);/);
  assert.equal((card.match(/disabled=\{busy \|\| responseGate\.isBusy\(\)/g) ?? []).length, 3);
});
