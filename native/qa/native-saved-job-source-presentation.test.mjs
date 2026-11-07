import assert from 'node:assert/strict';
import test from 'node:test';
import { presentSavedJobSource } from '../src/lib/savedJobSourcePresentation.ts';

const external = { is_external: true, source_name: 'ハローワーク', source_job_id: '12345-67890', source_last_verified_at: '2026-11-07T18:30:00Z' };

test('official direct jobs never carry imported source provenance', () => {
  assert.deepEqual(presentSavedJobSource({ ...external, is_external: false }), { provenance: null, lastVerified: null });
});
test('imported record displays real publisher and source job number', () => {
  assert.deepEqual(presentSavedJobSource(external), { provenance: '出典：ハローワーク（求人番号 12345-67890）', lastVerified: '2026年11月8日' });
});
test('optional external identifier is omitted rather than invented', () => {
  assert.equal(presentSavedJobSource({ ...external, source_job_id: '  ' }).provenance, '出典：ハローワーク');
});
test('JST formatting handles an actual offset rather than device timezone', () => {
  assert.equal(presentSavedJobSource({ ...external, source_last_verified_at: '2026-11-08T00:30:00+09:00' }).lastVerified, '2026年11月8日');
});
test('canonical date-only verified date is displayed without timezone shifting', () => {
  assert.equal(presentSavedJobSource({ ...external, source_last_verified_at: '2026-11-08' }).lastVerified, '2026年11月8日');
});
test('invalid or ambiguous timestamps never become a fabricated last-check date', () => {
  for (const value of ['2026-02-30', '2026-02-30T12:00:00Z', '2026-11-08T12:00:00', 'not a date', '']) {
    assert.equal(presentSavedJobSource({ ...external, source_last_verified_at: value }).lastVerified, null, value);
  }
});
test('unknown publisher does not imply verified provenance or status', () => {
  assert.deepEqual(presentSavedJobSource({ ...external, source_name: '  ' }), { provenance: null, lastVerified: null });
});
test('empty and malformed optional values do not surface source claims', () => {
  assert.deepEqual(presentSavedJobSource({ is_external: true, source_name: null, source_job_id: null, source_last_verified_at: null }), { provenance: null, lastVerified: null });
});
