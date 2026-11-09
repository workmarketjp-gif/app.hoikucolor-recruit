import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homeJobAvailability, homeEvidenceMetrics } from '../src/lib/homeFeaturedDetails.ts';
const source = readFileSync(new URL('../src/components/FeaturedHomeJobs.tsx', import.meta.url), 'utf8');

test('canonical owner/session and App Lock gates quarantine stale featured rows', () => {
  assert.match(source, /candidateViewOwnerKey\(session\?\.user\?\.id, session\?\.id\)/);
  assert.match(source, /!privacy\.shieldVisible && privacy\.canAccessPrivateData\(\)/);
  assert.match(source, /request === generation\.current && pinned\.isCurrent\(\)/);
  assert.match(source, /snapshot\?\.ownerKey === ownerKey/);
});

test('Home uses canonical search ordering and a confirmed empty result, never invented listing counts', () => {
  assert.match(source, /searchJobseekerJobs\(pinned\.client, \{ limit: 3 \}\)/);
  assert.match(source, /jobs\?\.length === 0/);
  assert.match(source, /!error && jobs === null/);
});

test('visit booking passes the canonical job ID only for open and internal jobs', () => {
  assert.match(source, /!job\.is_external && availability === 'open'/);
  assert.match(source, /router\.push\(`\/visits\?jobId=\$\{encodeURIComponent\(job\.id\)\}` as never\)/);
  const job = { is_external: false, is_open: false, closing_at: null };
  assert.equal(homeJobAvailability(job, 1800000000000), 'closed');
  assert.equal(homeJobAvailability({ ...job, is_open: true, closing_at: 'bad-date' }, 1800000000000), 'unknown');
});

test('verified metrics require actual evidence, not a verified-count label', () => {
  assert.equal(homeEvidenceMetrics({ verified_metric_count: 5, verified_metrics: {} }, 'workplace').length, 0);
  assert.match(source, /homeEvidenceMetrics\(job\.verified_workplace, 'workplace'\)/);
  assert.match(source, /homeEvidenceMetrics\(job\.verified_finance, 'finance'\)/);
});
