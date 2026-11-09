import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homeInlineApplyDecision } from '../src/lib/homeApplyDecision.ts';
import { canPreopenHomeDocuments } from '../src/lib/homeDirectApplyEntry.ts';

const JOB_ID = '11111111-2222-4333-8444-555555555555';
const APPLICATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const now = Date.parse('2026-11-10T00:00:00Z');
const job = { id: JOB_ID, is_open: true, is_external: false, can_apply_direct: true, closing_at: null };
const profile = { name: '合成テスト候補者' };
const decide = (j = job, p = profile, applications = []) => homeInlineApplyDecision(j, p, applications, JOB_ID, now);

test('explicit direct-apply hint only opens a verified document-selection state', () => {
  assert.equal(canPreopenHomeDocuments('1', decide(), 'open', false), true);
  for (const hint of [undefined, '0', 'true', 'yes', '2', '1&send=1']) {
    assert.equal(canPreopenHomeDocuments(hint, decide(), 'open', false), false);
  }
});

test('never opens selection for external/closed/malformed status, no profile or missing canonical job', () => {
  const cases = [
    decide({ ...job, is_external: true }),
    decide({ ...job, is_open: false }),
    decide({ ...job, closing_at: 'invalid' }),
    decide(null),
    decide(job, null),
    decide(job, { name: '   ' }),
  ];
  for (const decision of cases) assert.equal(canPreopenHomeDocuments('1', decision, 'open', false), false);
  assert.equal(canPreopenHomeDocuments('1', decide(), 'closed', false), false);
  assert.equal(canPreopenHomeDocuments('1', decide(), 'unknown', false), false);
});

test('candidate-owned existing application never reopens documents; uncertain attempts remain quarantined', () => {
  const existing = decide(job, profile, [{ id: APPLICATION_ID, job_id: JOB_ID.toUpperCase() }]);
  assert.equal(existing.kind, 'existing');
  assert.equal(canPreopenHomeDocuments('1', existing, 'open', false), false);
  assert.equal(canPreopenHomeDocuments('1', decide(), 'open', true), false);
});

test('featured card offers only the native direct-apply entry for open and direct postings', () => {
  const source = readFileSync(new URL('../src/components/FeaturedHomeJobs.tsx', import.meta.url), 'utf8');
  assert.match(source, /!job\.is_external && job\.can_apply_direct !== false && availability === 'open'/);
  assert.match(source, /router\.push\(`\/job\/\$\{encodeURIComponent\(job\.id\)\}\?apply=1` as never\)/);
  assert.match(source, /<Text style=\{styles\.primaryText\}>応募する<\/Text>/);
  assert.doesNotMatch(source, /submitApplication|sendMessage|newJobApplication/);
});

test('job detail gates one-shot preopen behind owner-pinned canonical readback, not a submit call', () => {
  const source = readFileSync(new URL('../src/app/job/[id].tsx', import.meta.url), 'utf8');
  assert.match(source, /firstParam\(params\.apply\) === '1'/);
  assert.match(source, /autoApplyRequested && !autoApplyConsumed\.current/);
  assert.match(source, /homeInlineApplyDecision\(nextJob, nextProfile, applications, jobId, Date\.now\(\)\)/);
  assert.match(source, /canPreopenHomeDocuments\('1', decision, availability, readback\.quarantine\)/);
  assert.match(source, /<ApplyDocumentsPanel jobId=\{job\.id\} submitting=\{applying\}/);
  assert.match(source, /const alreadyPending = await armPendingHomeApplication\(/);
  assert.match(source, /const result = await submitApplication\(pinned\.client, jobId, freshProfile, \{ documentIds \}\)/);
});
