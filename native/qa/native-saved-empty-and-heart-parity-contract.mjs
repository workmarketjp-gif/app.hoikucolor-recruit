// Static Web-to-Native Saved UI regression; not Android/iOS execution evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const web = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const saved = readFileSync(new URL('../src/app/(tabs)/saved.tsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/SavedJobPreviewCard.tsx', import.meta.url), 'utf8');
const icon = readFileSync(new URL('../src/components/CandidateTabIcon.tsx', import.meta.url), 'utf8');
function has(text, needle) { assert.ok(text.includes(needle), 'Expected source: ' + needle); }
has(web, `action="求人を探す" onAction={() => onNavigate('jobs')}`);
for (const needle of [
  'testID="saved-empty-state"', 'testID="saved-empty-find-jobs"',
  'accessibilityLabel="求人を探す"', "onPress={() => router.push('/(tabs)/jobs' as never)}",
  '!loading && !error && jobs?.length === 0', 'removeSavedJobAndConfirm(jobId,',
  'unsaveJob(pinned.client, jobId)', "usePrivateScreenCapture('saved')",
]) has(saved, needle);
for (const needle of [
  "import { CandidateTabIcon } from './CandidateTabIcon';",
  '<CandidateTabIcon name="heart" color="#E9265A" />', 'onPress={onRemove}',
  'accessibilityState={{ selected: true, disabled }}',
]) has(card, needle);
assert.ok(!card.includes('<Text style={styles.heart}>♥</Text>'), 'Remove Unicode heart');
has(icon, 'candidateTabGlyphs[name]');
console.log('PASS Saved empty CTA and shared icon; only exact-source static verification');
