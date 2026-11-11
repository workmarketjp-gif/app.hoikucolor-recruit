// Exact source wiring + real helper behavior. Not Android/iOS runtime evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const matching = readFileSync(new URL('../src/lib/jobMatching.ts', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/lib/jobVerifiedEvidence.ts', import.meta.url), 'utf8');
assert.match(matching, /import \{ verifiedWorkplaceNumericMetric \} from '\.\/jobVerifiedEvidence'/);
assert.equal((matching.match(/verifiedWorkplaceNumericMetric\(job\.verified_workplace,/g) ?? []).length, 5);
assert.doesNotMatch(matching, /function metricNumber|metricNumber\(job,/);
assert.match(source, /verifiedEvidence\(profile, 'workplace'\)/);
const child = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'qa/native-verified-workplace-matching.test.mjs'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
});
if (child.status !== 0) {
  process.stderr.write(child.stdout + '\n' + child.stderr);
  process.exit(child.status || 1);
}
console.log('PASS matching-source gates + focused helper test (Native actual runtime still unverified)');
