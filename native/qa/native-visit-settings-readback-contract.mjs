// Registered by native/qa/run-native-contracts.mjs. Source wiring is not rendered Native QA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapter = readFileSync(path.join(root, 'src/lib/applicationJourneyApi.ts'), 'utf8');
assert.match(adapter, /import \{ verifiedVisitSettingsReadback, type VerifiedVisitSettings \} from '\.\/visitSettingsReadback'/);
assert.match(adapter, /export type JobseekerVisitSettings = VerifiedVisitSettings/);
assert.match(adapter, /hc_jobseeker_get_visit_settings'[\s\S]*?return verifiedVisitSettingsReadback\(data\)/);
const result = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', 'qa/native-visit-settings-readback.test.mjs',
], { cwd: root, encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stdout + result.stderr);
  throw new Error('Native venue settings readback test failed');
}
console.log('PASS: Native visit settings adapter wiring and 6 behavior tests');
