import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { updateSavedJobAndConfirm, canCommitSavedJobsView } from '../src/lib/savedJobsReadback.ts';

// Tests run against the actual checked source and exact Git blob of the shared
// canonical saved-jobs helper, not a replacement with looser semantics.
const source = readFileSync(new URL('../src/components/FeaturedHomeJobs.tsx', import.meta.url), 'utf8');
const jobId = '11111111-2222-4333-8444-555555555555';

test('Home loads saved IDs alongside canonical jobs without hiding jobs when favorites fail', () => {
  assert.match(source, /Promise\.all\(\[\s*searchJobseekerJobs\(pinned\.client, \{ limit: 3 \}\),\s*listSavedJobIds\(pinned\.client\)/);
  assert.match(source, /\.catch\(\(\) => \(\{ ids: null, failed: true \} as const\)\)/);
  assert.match(source, /setSnapshot\(\{ ownerKey, jobs: page\.jobs, savedIds: savedResult\.ids \}\)/);
  assert.match(source, /snapshot\?\.ownerKey === ownerKey/);
});

test('the heart only renders from known canonical saved status and is accessible', () => {
  assert.match(source, /savedIds !== null \? <Pressable accessibilityRole="button"/);
  assert.match(source, /accessibilityState=\{\{ selected: isSaved, disabled: favoriteBusyId !== null \}\}/);
  assert.match(source, /disabled=\{favoriteBusyId !== null\}/);
  assert.match(source, /isSaved \? '気になるから外す' : '気になるに保存'/);
  assert.match(source, /onPress=\{\(\) => void toggleFavorite\(job\.id\)\}/);
  // Saving a closed/external posting is allowed, just like Web's saved history.
  assert.doesNotMatch(source, /savedIds !== null && availability === 'open'/);
});

test('a bookmark write is pinned to exact Clerk user/session and never optimistic', () => {
  assert.match(source, /favoriteMutation\.current \|\|/);
  assert.match(source, /candidateViewOwnerKey\(pinned\.ownerId, pinned\.ownerSessionId\) !== ownerKey/);
  assert.match(source, /request !== generation\.current/);
  assert.match(source, /updateSavedJobAndConfirm\(\s*jobId, shouldSave,/);
  assert.match(source, /shouldSave \? saveJob\(pinned\.client, jobId\) : unsaveJob\(pinned\.client, jobId\)/);
  assert.match(source, /setSnapshot\(\(previous\) => previous\?\.ownerKey === ownerKey\s*\? \{ \.\.\.previous, savedIds: ids \}/);
});

test('ambiguous save response disables further mutation until fresh canonical read', () => {
  assert.match(source, /\{ \.\.\.previous, savedIds: null \}/);
  assert.match(source, /setFavoriteError\('保存状況を確認できませんでした。再読み込みしてご確認ください。'\)/);
  assert.match(source, /onPress=\{\(\) => setRetry\(\(value\) => value \+ 1\)\}/);
  assert.match(source, /favoriteMutation\.current = false/);
});

test('save commits only after the canonical saved-ID list contains this job', async () => {
  let mutate = 0;
  let reread = 0;
  const ids = await updateSavedJobAndConfirm(jobId, true,
    async () => { mutate += 1; },
    async () => { reread += 1; return [jobId]; });
  assert.deepEqual(ids, [jobId]);
  assert.equal(mutate, 1);
  assert.equal(reread, 1);
  await assert.rejects(() => updateSavedJobAndConfirm(jobId, true,
    async () => {}, async () => []), /保存状況を確認できません/);
});

test('unsave requires authoritative removal, including transient/read failures', async () => {
  const ids = await updateSavedJobAndConfirm(jobId, false,
    async () => {}, async () => []);
  assert.deepEqual(ids, []);
  await assert.rejects(() => updateSavedJobAndConfirm(jobId, false,
    async () => {}, async () => [jobId]), /保存状況を確認できません/);
  await assert.rejects(() => updateSavedJobAndConfirm(jobId, true,
    async () => { throw new Error('ambiguous'); },
    async () => [jobId]), /ambiguous/);
});

test('owner/session generation and App Lock all gate saved-state display', () => {
  assert.equal(canCommitSavedJobsView('A:1', 'A:1', 4, 4, true), true);
  assert.equal(canCommitSavedJobsView('A:1', 'B:2', 4, 4, true), false);
  assert.equal(canCommitSavedJobsView('A:1', 'A:1', 4, 5, true), false);
  assert.equal(canCommitSavedJobsView('A:1', 'A:1', 4, 4, false), false);
  assert.equal(canCommitSavedJobsView(null, 'A:1', 4, 4, true), false);
});
