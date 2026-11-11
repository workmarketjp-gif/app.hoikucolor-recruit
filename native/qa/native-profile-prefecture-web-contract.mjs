import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const native = path.join(root, 'native');
const web = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const source = readFileSync(path.join(native, 'src/app/(tabs)/profile.tsx'), 'utf8');
const options = readFileSync(path.join(native, 'src/lib/profilePrefectureOptions.ts'), 'utf8');

const webList = web.match(/^const prefectureOptions = \[([^\]]+)\];/m)?.[1];
const nativeList = options.match(/export const PROFILE_PREFECTURES: string\[\] = \[([\s\S]*?)\];/)?.[1];
assert.ok(webList && nativeList, 'prefecture options missing in Web or Native');
const names = (text) => [...text.matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(names(nativeList), names(webList), 'Native select options/order diverge from authorized Web');

for (const required of [
  "import { profilePrefectureChoices } from '../../lib/profilePrefectureOptions';",
  '<PrefectureSelectField value={profile.prefecture} disabled={!canEditDraft()}',
  'onChange={(value) => editProfile((current) => ({ ...current, prefecture: value }))}',
  "{['', ...profilePrefectureChoices(value)].map((option) => (",
  'visible={open && !disabled}',
  'if (disabled) setOpen(false)',
  'onRequestClose={() => setOpen(false)}',
  "accessibilityLabel={option || '選択しない'}",
]) assert.ok(source.includes(required), 'missing Native selection and privacy wiring: ' + required);
assert.ok(!source.includes('<Field label="希望都道府県"'), 'old unstructured prefecture field remains');

const run = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'qa/native-profile-prefecture-options.test.mjs'], {
  cwd: native, encoding: 'utf8',
});
if (run.status !== 0) {
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  throw new Error('prefecture helper behavior failed: ' + String(run.status ?? run.error));
}
console.log('PASS same 47 Web prefectures, selected/legacy values, authorized Native selector wiring');
