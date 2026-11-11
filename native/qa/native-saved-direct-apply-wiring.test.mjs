import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const card = readFileSync(new URL('../src/components/SavedJobPreviewCard.tsx', import.meta.url), 'utf8');
const saved = readFileSync(new URL('../src/app/(tabs)/saved.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/app/job/[id].tsx', import.meta.url), 'utf8');
const web = readFileSync(new URL('../../src/components/JobCard.tsx', import.meta.url), 'utf8');

test('saved Native card exposes Web 応募する without submitting on tap', () => {
  assert.match(web, /\{isClosed \? '募集終了' : applying \? '応募中…' : '応募する'\}/);
  assert.match(card, /info\.directApply \? onApply : onOpen/);
  assert.match(card, /info\.directApply \? '応募する'/);
  assert.match(saved, /onApply=\{\(\) => void open\(job\.id, 'apply'\)\}/);
  assert.match(saved, /savedJobNavigationPath\(jobId, chosen, destination, Date\.now\(\)\)/);
  assert.match(detail, /autoApplyRequested = firstParam\(params\.apply\) === '1'/);
  assert.match(detail, /canPreopenHomeDocuments\('1', decision, availability, readback\.quarantine\)/);
  assert.doesNotMatch(card, /submitApplication\(|\.rpc\(/);
});
