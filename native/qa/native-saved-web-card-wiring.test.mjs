import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const saved = readFileSync(new URL('../src/app/(tabs)/saved.tsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/SavedJobPreviewCard.tsx', import.meta.url), 'utf8');
const webCard = readFileSync(new URL('../../src/components/JobCard.tsx', import.meta.url), 'utf8');
test('Web saved action is a full expandable job card with real conditions', () => {
  for (const label of ['詳しく見る', '園', '条件', '仕事内容・保育観', '募集人数', '見学・体験を予約']) {
    assert.ok(card.includes(label), label);
  }
  assert.match(webCard, /className="hc-job-detail"/);
  assert.match(webCard, /!isExternal && !isClosed && <VisitTrialPanel/);
  assert.match(card, /info\.canVisit \? <Pressable/);
  assert.match(saved, /<SavedJobPreviewCard/);
});
test('saved record remains owner-pinned; visit and detail routes are Native', () => {
  assert.match(saved, /pinCandidateAction\(\)/);
  assert.match(saved, /canPresent\(ownerKey, requestGeneration\)/);
  assert.match(saved, /presentSavedJobCard\(chosen, Date\.now\(\)\)\.canVisit/);
  assert.match(saved, /\/visits\?jobId=/);
  assert.match(saved, /\/job\//);
  assert.doesNotMatch(card, /Linking\.openURL|https:\/\//);
});
test('canonical save/un-save and error gating remain wired', () => {
  assert.match(saved, /listSavedJobs\(pinned\.client\)/);
  assert.match(saved, /removeSavedJobAndConfirm/);
  assert.match(saved, /canCommitSavedJobsView/);
  assert.match(saved, /saved-private-shield/);
  assert.match(saved, /usePrivateScreenCapture\('saved'\)/);
});
test('actual submitted amount and verified metric source determine badges, not guesses', () => {
  assert.match(card, /presentSavedJobCard\(job, Date\.now\(\)\)/);
  assert.match(card, /verifiedEvidence\(job\.verified_workplace, 'workplace'\)/);
  assert.match(card, /verifiedEvidence\(job\.verified_finance, 'finance'\)/);
});
