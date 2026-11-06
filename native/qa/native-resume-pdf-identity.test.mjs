import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResumePdfIdentity } from '../src/lib/resumePdfIdentity.ts';

test('canonical profile and résumé contact fields remain separate in Japanese A4 documents', () => {
  const p = { phone: ' 03-5555-1212 ', email: ' hana@example.jp ' };
  const r = { postal_code: ' 100-0001 ', address_kana: ' とうきょうと ', address: ' 千代田区千代田 ', contact_address: ' 勤務先へ郵送希望 ' };
  const before = JSON.stringify({ p, r });
  assert.deepEqual(buildResumePdfIdentity(p, r), {
    postalCode: '100-0001', addressKana: 'とうきょうと', address: '千代田区千代田',
    phone: '03-5555-1212', email: 'hana@example.jp', contactAddress: '勤務先へ郵送希望',
  });
  assert.equal(JSON.stringify({ p, r }), before, 'must not mutate canonical records');
});

test('missing candidate contact fields are blank, never filled with fabricated data', () => {
  assert.deepEqual(buildResumePdfIdentity({ phone: null, email: null }, {
    postal_code: null, address_kana: null, address: null, contact_address: null,
  }), { postalCode: '', addressKana: '', address: '', phone: '', email: '', contactAddress: '' });
});

test('a candidate can supply telephone and email independently without cross-population', () => {
  const r = { postal_code: null, address_kana: null, address: '東京都', contact_address: null };
  const onlyPhone = buildResumePdfIdentity({ phone: '0120-000-111', email: null }, r);
  const onlyEmail = buildResumePdfIdentity({ phone: null, email: 'person@example.jp' }, r);
  assert.equal(onlyPhone.email, '');
  assert.equal(onlyEmail.phone, '');
  assert.equal(onlyPhone.address, onlyEmail.address);
});

test('A4 contact rows never merge postal code, telephone, email or alternate address', async () => {
  const { resumePdfIdentityRows } = await import('../src/lib/resumePdfIdentity.ts');
  const rows = resumePdfIdentityRows(buildResumePdfIdentity(
    { phone: '070-1234-5678', email: 'hana@example.jp' },
    { postal_code: '100-0001', address_kana: 'とうきょうと', address: '東京都千代田区', contact_address: '東京都港区' },
  ));
  assert.deepEqual(rows, [
    { label: '現住所（ふりがな）', value: 'とうきょうと' },
    { label: '現住所', value: '〒100-0001 東京都千代田区' },
    { label: '電話', value: '070-1234-5678' },
    { label: 'E-mail', value: 'hana@example.jp' },
    { label: '連絡先（現住所以外）', value: '東京都港区' },
  ]);
  assert.equal(resumePdfIdentityRows({ postalCode:'', addressKana:'', address:'', phone:'', email:'', contactAddress:'' }).length, 4);
});


test('actual A4 renderer keeps separate contact rows and escapes applicant text', async () => {
  const { buildResumeA4Html } = await import('../src/lib/resumeA4Html.ts');
  const identity = buildResumePdfIdentity(
    { phone: '070-1234-5678', email: 'hana@example.jp' },
    { postal_code: '100-0001', address_kana: 'とうきょうと', address: '<img src=x>', contact_address: '東京都港区' },
  );
  const review = {
    name: '山田 花子', kana: 'やまだ はなこ', birth: '', gender: '',
    address: 'legacy summary', contact: 'legacy contact', createdOn: '2026年11月7日現在',
    history: [], licenses: [], appeal: [], work: [], requests: '希望なし', gaps: [], pdfIdentity: identity,
  };
  const html = buildResumeA4Html('resume', review);
  assert.match(html, /<th scope="row">現住所（ふりがな）<\/th><td>とうきょうと<\/td>/);
  assert.match(html, /<th scope="row">現住所<\/th><td>〒100-0001 &lt;img src=x&gt;<\/td>/);
  assert.match(html, /<th scope="row">電話<\/th><td>070-1234-5678<\/td>/);
  assert.match(html, /<th scope="row">E-mail<\/th><td>hana@example.jp<\/td>/);
  assert.match(html, /<th scope="row">連絡先（現住所以外）<\/th><td>東京都港区<\/td>/);
  assert.doesNotMatch(html, /legacy summary|legacy contact|<img src=x>/);
});
