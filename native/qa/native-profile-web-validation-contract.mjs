import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nativeRoot = path.join(repo, 'native');
const screen = readFileSync(path.join(nativeRoot, 'src/app/(tabs)/profile.tsx'), 'utf8');
const web = readFileSync(path.join(repo, 'src/App.tsx'), 'utf8');

assert.ok(web.includes("if (missingName) { setError('お名前を入力してください。'); return; }"),
  'the expected Web name-required baseline has changed');
assert.ok(web.includes('<input type="date" value={draft.desired_start_date ||'),
  'the expected Web date-only baseline has changed');

for (const required of [
  "import { profileWebValidationError } from '../../lib/profileWebValidation';",
  'const invalid = profileWebValidationError(next.name, next.desired_start_date);',
  'if (invalid) throw new Error(invalid);',
  '<Field label="お名前（必須）"',
  '<Field label="勤務開始希望日"',
  'accessibilityLabel={label}',
]) assert.ok(screen.includes(required), 'Native profile missing Web input parity: ' + required);

const saveBody = screen.slice(screen.indexOf('  const save = async () => {'));
const validationAt = saveBody.indexOf('const invalid = profileWebValidationError(');
const pinAt = saveBody.indexOf('const pinned = await pinCandidateAction();');
const writeAt = saveBody.indexOf('await upsertJobseekerProfile(pinned.client, next);');
assert.ok(validationAt >= 0 && validationAt < pinAt && pinAt < writeAt,
  'invalid profile data must be rejected before any pinned network submission');

const run = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', 'qa/native-profile-web-validation.test.mjs',
], { cwd: nativeRoot, encoding: 'utf8' });
if (run.status !== 0) {
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  throw new Error('profile Web validation failed: ' + String(run.status ?? run.error));
}
console.log('PASS Web-required candidate profile validation, Native pre-RPC wiring and 5 focused behavioral tests');
