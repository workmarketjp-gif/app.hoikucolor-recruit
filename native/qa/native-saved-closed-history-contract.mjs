#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const nativeRoot = path.resolve(qaDir, '..');
const api = fs.readFileSync(path.join(nativeRoot, 'src/lib/jobseekerCoreApi.ts'), 'utf8');
const screen = fs.readFileSync(path.join(nativeRoot, 'src/app/(tabs)/saved.tsx'), 'utf8');

const checks = [
  ['canonical closed-history RPC is used', api.includes("client.rpc('hc_jobseeker_list_saved_jobs_with_status')")],
  ['saved status type requires boolean is_open', /SavedJobWithStatus[\s\S]*is_open:\s*boolean/.test(api)],
  ['RPC response validates is_open', api.includes("typeof job.is_open !== 'boolean'")],
  ['screen consumes canonical saved-status API', screen.includes('listSavedJobsWithStatus')],
  ['closed saved rows stay renderable', screen.includes("{job.is_open ? '募集中' : '募集終了'}")],
  ['closed saved rows explain history semantics', screen.includes('保存履歴として求人情報を確認できます。')],
  ['initial transport failure is not rendered as zero', screen.includes("'確認中…' : '件数不明'")],
  ['empty state requires authoritative loaded array', screen.includes("!loading && jobs !== null && jobs.length === 0")],
  ['same-screen retry exists', screen.includes('同じ画面で再読み込み')],
  ['unsave still uses canonical mutation', screen.includes('await unsaveJob(pinned.client, jobId)')],
];
for (const [name, ok] of checks) {
  assert.equal(ok, true, name);
  console.log('PASS', name);
}
console.log(`native saved closed-history contract: ${checks.length}/${checks.length} PASS`);
