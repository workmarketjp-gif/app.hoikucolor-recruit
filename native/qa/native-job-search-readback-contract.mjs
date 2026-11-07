import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Verify the actual Native adapter is wired to the tested fail-closed parser.
const adapter = readFileSync(new URL('../src/lib/jobseekerCoreApi.ts', import.meta.url), 'utf8');
assert.match(adapter, /import \{ verifiedJobSearchRows, verifiedJobSearchFacets \} from '\.\/jobSearchReadback';/);
assert.match(adapter, /const rows = verifiedJobSearchRows<SearchRpcRow>\(data\);/);
assert.match(adapter, /return verifiedJobSearchFacets\(data\);/);
assert.doesNotMatch(adapter, /Array\.isArray\(data\) \? data : \[\]\) as SearchRpcRow\[\]/);

const result = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', 'qa/native-job-search-readback.test.mjs',
], { cwd: process.cwd(), encoding: 'utf8' });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) throw result.error;
process.exit(result.status ?? 1);
