import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Real-source structural regression: not a rendered Android/iOS screenshot test.
const native = readFileSync(new URL('../src/app/spot-jobs.tsx', import.meta.url), 'utf8');
const webCss = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const webSpot = readFileSync(new URL('../../src/views/SpotJobsView.tsx', import.meta.url), 'utf8');

test('Spot uses the approved Web accent rather than an unrelated dark primary button', () => {
  assert.match(webCss, /--accent:#fb2f52/);
  assert.match(webCss, /\.primary-button\{background:linear-gradient\(135deg,#fb3c5d,#ed274b\)/);
  assert.match(native, /primaryButtonWide:\s*\{[^}]*backgroundColor: '#fb2f52'/);
  assert.doesNotMatch(native, /primaryButtonWide:\s*\{[^}]*backgroundColor: '#191c20'/);
  assert.match(native, /page:\s*\{[^}]*backgroundColor: '#f6f6f5'/);
  assert.match(native, /card:\s*\{[^}]*borderWidth: 1, borderColor: '#e7e8eb'/);
});

test('Spot exhausted, busy, and cross-job-locked actions are visibly and semantically disabled', () => {
  assert.match(webCss, /\.primary-button:disabled\{opacity:\.6/);
  assert.match(native, /primaryButtonDisabled:\s*\{ opacity: 0\.6 \}/);
  assert.match(native, /accessibilityState=\{\{ disabled: busy \|\| locked \|\| job\.available_count <= 0, busy \}\}/);
  assert.match(native, /style=\{\[styles\.primaryButtonWide, \(busy \|\| locked \|\| job\.available_count <= 0\) && styles\.primaryButtonDisabled\]\}/);
  assert.match(native, /disabled=\{busy \|\| locked \|\| job\.available_count <= 0\}/);
  assert.match(native, /'満員です'/);
  assert.match(native, /'別の応募を確認中…'/);
});

test('Spot initial loading and failed read are mutually exclusive with a usable retry', () => {
  const start = native.indexOf('if (!verifiedVisible) {');
  const end = native.indexOf('  return (\n    <ScrollView', start);
  assert.ok(start >= 0 && end > start);
  const view = native.slice(start, end);
  assert.match(view, /\{error \? \(\s*<>/);
  assert.match(view, /accessibilityRole="alert"/);
  assert.match(view, /accessibilityLabel="スポット勤務をもう一度読み込む"/);
  assert.match(view, /style=\{styles\.secondaryButtonWide\}/);
  assert.match(view, /<ActivityIndicator color="#fb2f52"/);
  assert.match(view, /\) : \(\s*<>\s*<ActivityIndicator/);
  assert.doesNotMatch(view, /\{error \? <Text[^\n]+ : <ActivityIndicator/);
});

test('Spot keeps existing Web labels, canonical application navigation and owner fence', () => {
  assert.match(webSpot, /1日単位で働ける勤務です。通常求人とは分けて表示しています。/);
  assert.match(native, /1日単位で働ける勤務です。通常求人とは分けて表示しています。/);
  assert.match(native, /canStartSpotApplication\(/);
  assert.match(native, /readSpotApplicationPreflight\(/);
  assert.match(native, /armSpotApplicationDispatch\(/);
  assert.match(native, /submitApplication\(pinned\.client, job\.job_id, profile\)/);
  assert.match(native, /router\.push\(\`\/application\/\$\{result\.applicationId\}\` as never\)/);
});
