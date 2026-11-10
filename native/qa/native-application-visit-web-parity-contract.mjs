import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const native = readFileSync(new URL('../src/app/application/[id].tsx', import.meta.url), 'utf8');
const web = readFileSync(new URL('../../src/components/ApplicationDetail.tsx', import.meta.url), 'utf8');

assert.match(web, /formatDuration\(visit\.starts_at, visit\.ends_at\)/);
assert.match(web, /visit\.candidate_message && <small>\{visit\.candidate_message\}<\/small>/);
assert.match(web, /この求人に関連する見学・体験予約はありません。/);
assert.match(web, /面接予定はまだ登録されていません。日程が決まるとここに表示されます。/);

assert.match(native, /formatApplicationVisitDuration\(visit\.starts_at, visit\.ends_at\)/);
assert.match(native, /\{applicationVisitStatusLabel\(visit\.status\)\}\{duration \? ` ・ \$\{duration\}` : ''\}/);
assert.match(native, /visit\.candidate_message \? <Text[^>]+>\{visit\.candidate_message\}<\/Text> : null/);
assert.match(native, /この求人に関連する見学・体験予約はありません。/);
assert.match(native, /面接予定はまだ登録されていません。日程が決まるとここに表示されます。/);
console.log('Native application visit source contract PASS: Web and Native equivalent fields');
