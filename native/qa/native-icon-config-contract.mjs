import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { getJimpImageAsync } = require('@expo/image-utils/build/jimp');
function countPink(image) {
  const { data } = image.bitmap; let pink = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] > 170 && data[i + 1] < 130 && data[i + 2] < 180 && data[i + 3] > 100) pink++;
  return pink;
}
const profile = process.env.EAS_BUILD_PROFILE ?? 'ci';
const buildId = process.env.EAS_BUILD_ID ?? 'ci-contract';
const raw = execFileSync(process.execPath, [require.resolve('expo/bin/cli'), 'config', '--type', 'public', '--json'], {
  cwd: root, env: { ...process.env, EAS_BUILD_PROFILE: profile, EAS_BUILD_ID: buildId }, encoding: 'utf8',
});
const config = JSON.parse(raw.slice(raw.indexOf('{')));
assert.equal(config.icon, './assets/launcher-icon.png');
assert.equal(config.android.adaptiveIcon.foregroundImage, './assets/adaptive-foreground.png');
assert.equal(config.android.adaptiveIcon.backgroundColor, '#FFF5F7');
assert.equal(config.android.package, 'jp.hoikucolor.jobseeker');
assert.equal(config.android.versionCode, 4);
assert.equal(config.scheme, 'hoikucolor');
assert.equal(config.extra.eas.projectId, '507c2498-2098-4e4c-9699-75c494f00c47');
assert.equal(config.extra.buildProvenance.profile, profile);
assert.equal(config.extra.buildProvenance.easBuildId, buildId);
assert.match(config.extra.buildProvenance.gitCommit, /^[a-f0-9]{40}$/);
for (const asset of [config.icon, config.android.adaptiveIcon.foregroundImage]) {
  const data = fs.readFileSync(path.join(root, asset));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  assert.equal(data.readUInt32BE(16), 1024); assert.equal(data.readUInt32BE(20), 1024);
  const image = await getJimpImageAsync(path.join(root, asset));
  assert(countPink(image) > 10000, 'brand pink clover pixels required');
  if (asset === config.android.adaptiveIcon.foregroundImage) {
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
      if (image.bitmap.data[(y * 1024 + x) * 4 + 3] > 10) assert(Math.hypot(x - 512, y - 512) < 1024 * 33 / 108, 'foreground escapes adaptive safe circle');
    }
  }
}
assert.deepEqual(fs.readFileSync(path.join(root, 'assets/hoiku-color-mark.png')), fs.readFileSync(path.join(root, '../src/logo/logom_hoikucolor.png')));
fs.writeFileSync(path.join(root, '.expo-resolved-audit.json'), JSON.stringify({
  icon: config.icon, android: config.android, scheme: config.scheme,
  projectId: config.extra.eas.projectId, provenance: config.extra.buildProvenance,
}, null, 2));
console.log('PASS Expo resolved config: brand icon, adaptive foreground, build 4, identity/provenance');
console.info('HC_NATIVE_BUILD_PROVENANCE', JSON.stringify({ appVersion: config.version,
  versionCode: config.android.versionCode, projectId: config.extra.eas.projectId, ...config.extra.buildProvenance }));

if (process.argv.includes('--android-resources')) {
  const res = path.join(root, 'android/app/src/main/res');
  const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert(manifest.includes('android:icon="@mipmap/ic_launcher"'));
  assert(manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"'));
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
      const dir = path.join(res, `mipmap-${density}`);
      const file = fs.readdirSync(dir).find(f => f === `${name}.png` || f === `${name}.webp`);
      assert(file, `${name} missing in ${density}`);
      assert(fs.statSync(path.join(dir, file)).size > 100, 'empty launcher resource');
      const image = await getJimpImageAsync(path.join(dir, file));
      assert(countPink(image) > image.bitmap.width * image.bitmap.height * 0.01, `${density}/${name} has no Hoiku Color pink clover`);
    }
  }
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    const xml = fs.readFileSync(path.join(res, 'mipmap-anydpi-v26', `${name}.xml`), 'utf8');
    assert(xml.includes('@mipmap/ic_launcher_foreground')); assert(xml.includes('@color/iconBackground'));
  }
  assert(fs.readFileSync(path.join(res, 'values/colors.xml'), 'utf8').toUpperCase().includes('#FFF5F7'));
  console.log('PASS Android manifest/adaptive XML and all five launcher mipmap densities');
}
