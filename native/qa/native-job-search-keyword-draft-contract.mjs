import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screen = readFileSync(path.join(root, 'src/app/(tabs)/jobs.tsx'), 'utf8');

// Verify actual UI entry points use the same owner-keyed, synchronous draft.
for (const required of [
  'keywordDraftRef.current = { ownerKey, value };',
  "keywordDraftRef.current = { ownerKey, value: '' };",
  'void load(true, keywordForCurrentCandidate(ownerKey, keywordDraftRef.current, query), next);',
  'onSubmitEditing={() => { cancelKeywordTimer(); void load(true, keywordForCurrentCandidate(ownerKey, keywordDraftRef.current, query)); }}',
  'onPress={() => { cancelKeywordTimer(); void load(true, keywordForCurrentCandidate(ownerKey, keywordDraftRef.current, query)); }}',
]) assert.ok(screen.includes(required), `missing search UI wiring: ${required}`);

const outcome = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', 'qa/native-job-search-keyword-draft.test.mjs',
], { cwd: root, encoding: 'utf8' });
if (outcome.status !== 0) {
  process.stdout.write(outcome.stdout || '');
  process.stderr.write(outcome.stderr || '');
  throw new Error(`candidate keyword behavior test failed: ${outcome.status ?? outcome.error}`);
}
console.log('PASS candidate-keyed latest keyword source wiring and behavior');
