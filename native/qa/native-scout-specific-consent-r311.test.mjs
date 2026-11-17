import assert from 'node:assert/strict';
import test from 'node:test';
import { scoutConsentCopy } from '../src/lib/scoutConsentCopy.ts';

test('acceptance names the canonical facility and explicitly discloses email and phone visibility', () => {
  const copy = scoutConsentCopy('さくら保育園', 'accepted');
  assert.deepEqual(copy, {
    title: 'さくら保育園からのスカウトを承諾しますか？',
    message: '承諾後は、園が今後の連絡に必要な氏名・メール・電話番号等を確認できるようになります。',
  });
});

test('decline names the same facility without implying personal data sharing', () => {
  const copy = scoutConsentCopy('さくら保育園', 'declined');
  assert.equal(copy?.title, 'さくら保育園からのスカウトを辞退しますか？');
  assert.match(copy?.message ?? '', /共有されません/);
  assert.doesNotMatch(copy?.message ?? '', /確認できるようになります/);
});

test('blank and control-character facility names cannot produce a vague consent prompt', () => {
  for (const name of ['', '  ', '\n', '園\n別の操作']) {
    assert.equal(scoutConsentCopy(name, 'accepted'), null);
    assert.equal(scoutConsentCopy(name, 'declined'), null);
  }
});

test('a long Japanese canonical facility name remains exact rather than silently truncating consent', () => {
  const facility = '認可保育園・長い法人名'.repeat(9);
  const copy = scoutConsentCopy(`  ${facility}  `, 'accepted');
  assert.ok(copy?.title.startsWith(facility));
  assert.ok(copy?.title.endsWith('承諾しますか？'));
});
