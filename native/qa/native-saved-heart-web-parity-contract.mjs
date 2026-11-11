// Web saved JobCard's existing heart is an action, not a static indicator.
// This is a real-source wiring contract. Android/iOS rendering is a separate gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const web = readFileSync(new URL('../../src/components/JobCard.tsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/SavedJobPreviewCard.tsx', import.meta.url), 'utf8');
const saved = readFileSync(new URL('../src/app/(tabs)/saved.tsx', import.meta.url), 'utf8');
assert.match(web, /onClick=\{\(\) => onToggleSaved\(job\.id\)\}/);
assert.match(web, /aria-pressed=\{saved\}/);
assert.match(card, /testID=\{'saved-job-heart-' \+ job\.id\}/);
assert.match(card, /accessibilityRole="button"/);
assert.match(card, /accessibilityState=\{\{ selected: true, disabled \}\}/);
assert.match(card, /disabled=\{disabled\}/);
assert.match(card, /onPress=\{onRemove\}/);
assert.match(card, /removing \? <ActivityIndicator/);
assert.match(card, /minWidth: 48, minHeight: 48/);
assert.equal((card.match(/onPress=\{onRemove\}/g) ?? []).length, 1);
assert.doesNotMatch(card, /style=\{styles\.remove\}|accessibilityLabel="気になるに保存済み"/);
assert.match(saved, /onRemove=\{\(\) => void remove\(job\.id\)\}/);
assert.match(saved, /removeSavedJobAndConfirm\(jobId,/);
assert.match(saved, /unsaveJob\(pinned\.client, jobId\)/);
assert.match(saved, /canPresent\(requestOwner, requestGeneration\)/);
assert.match(saved, /usePrivateScreenCapture\('saved'\)/);
console.log('PASS Saved Web actionable heart + canonical candidate-owned unsave wiring (static source only)');
