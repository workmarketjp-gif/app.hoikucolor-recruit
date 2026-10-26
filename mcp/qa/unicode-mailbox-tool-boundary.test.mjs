import assert from 'node:assert/strict';
import test from 'node:test';
import { publicToolResult } from '../sdk-bridge.mjs';

// Synthetic only: upstream NFKC contact filtering may leave a Unicode
// SMTPUTF8 local part when it replaces an IDN/ASCII domain with this marker.
const publicJob = {
  id: '11111111-1111-4111-8111-000000000019',
  url: 'https://hoikucolor.jp/jobs/11111111-1111-4111-8111-000000000019',
  title: '保育士の募集',
  facility_name: '施設: 山田@[連絡先省略]',
  description: '採用窓口: 田中太郎@[連絡先省略] へ',
  salary_note: '電話連絡ではなく求人ページを確認',
  source_name: '問い合わせ先: 花子＠[連絡先省略]',
};
test('redacts the complete Japanese mailbox fragment in structured and text outputs', () => {
  const original = { jobs: [publicJob], returned: 1, next_offset: null, note: '公開求人' };
  const actual = publicToolResult(original);
  for (const response of [actual.structuredContent, JSON.parse(actual.content[0].text)]) {
    assert.equal(response.jobs[0].facility_name, '施設: [連絡先省略]');
    assert.equal(response.jobs[0].description, '採用窓口: [連絡先省略] へ');
    assert.equal(response.jobs[0].source_name, '問い合わせ先: [連絡先省略]');
    assert.ok(!JSON.stringify(response).includes('田中太郎@'));
    assert.ok(!JSON.stringify(response).includes('花子＠'));
    assert.equal(response.returned, 1);
    assert.equal(response.note, '公開求人');
    assert.equal(response.jobs[0].url, publicJob.url);
  }
  // A shared catalog object must not be mutated by serialization.
  assert.equal(publicJob.description, '採用窓口: 田中太郎@[連絡先省略] へ');
});
test('preserves ordinary Japanese text and already-redacted contacts', () => {
  const result = publicToolResult({
    jobs: [{ description: '今日は保育園で子どもと遊ぶ仕事です', salary_note: '[連絡先省略]' }],
    note: '応募・メッセージ送信はできません。',
  });
  assert.equal(result.structuredContent.jobs[0].description, '今日は保育園で子どもと遊ぶ仕事です');
  assert.equal(result.structuredContent.jobs[0].salary_note, '[連絡先省略]');
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
});
test('multiple contact fragments are masked without leaking into tool text', () => {
  const result = publicToolResult({ job: {
    description: '窓口: 山田@[連絡先省略] と 花子＠[連絡先省略] に連絡',
  } });
  assert.equal(result.structuredContent.job.description,
    '窓口: [連絡先省略] と [連絡先省略] に連絡');
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
});
test('oversized text output remains rejected after contact scrubbing', () => {
  assert.throws(() => publicToolResult({ note: 'a'.repeat(51_000) }), /OUTPUT_TOO_LARGE/);
});
