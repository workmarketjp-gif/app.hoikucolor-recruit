import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationMessageWebMeta,
  formatApplicationMessageWebTimestamp,
} from '../src/lib/applicationMessageWebMeta.ts';

const expectedWebDate = (value) => new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

test('r325: application message Web local-time format has month/day and hour/minute only', () => {
  const at = '2026-11-18T07:08:59+09:00';
  assert.equal(formatApplicationMessageWebTimestamp(at), expectedWebDate(at));
  assert.equal(formatApplicationMessageWebTimestamp(at).includes('2026'), false);
});
test('r325: local time-zone offsets follow the Web viewer, not a hard-coded JST', () => {
  const at = '2026-11-17T22:08:59Z';
  assert.equal(formatApplicationMessageWebTimestamp(at), expectedWebDate(at));
});
test('r325: sender and date live in one Web-style metadata line', () => {
  const at = '2026-11-18T07:08:59+09:00';
  assert.equal(applicationMessageWebMeta('jobseeker', at), `あなた ・ ${expectedWebDate(at)}`);
  assert.equal(applicationMessageWebMeta('facility', at), `園 ・ ${expectedWebDate(at)}`);
});
test('r325: malformed server timestamps do not leak raw strings or Invalid Date', () => {
  assert.equal(formatApplicationMessageWebTimestamp('untrusted/url?token=secret'), '');
  assert.equal(applicationMessageWebMeta('facility', 'untrusted/url?token=secret'), '園');
});
test('r325: empty timestamp is not shown as epoch', () => {
  assert.equal(formatApplicationMessageWebTimestamp(''), '');
  assert.equal(applicationMessageWebMeta('jobseeker', ''), 'あなた');
});
test('r325: non-candidate sender is not misrepresented as the candidate', () => {
  const at = '2026-11-18T07:08:59+09:00';
  assert.equal(applicationMessageWebMeta('unknown', at), `園 ・ ${expectedWebDate(at)}`);
});
