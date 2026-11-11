import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedScoutBlockableOrganizations } from '../src/lib/scoutCanonicalReadback.ts';

const ID = '123e4567-e89b-42d3-a456-426614174001';
const row = { organization_id: ID, organization_name: '合成法人（実在しないテストデータ）' };

test('genuine empty RPC result remains a legitimate empty search', () => {
  assert.deepEqual(verifiedScoutBlockableOrganizations([]), []);
});
test('canonical rows are preserved unchanged for the existing authorized block action', () => {
  const result = [row];
  assert.equal(verifiedScoutBlockableOrganizations(result), result);
  assert.equal(result[0].organization_id, ID);
});
test('an invalid RPC envelope never masquerades as zero matching organizations', () => {
  for (const data of [null, undefined, {}, '[]', false, { data: [] }, [null], [false]]) {
    assert.throws(() => verifiedScoutBlockableOrganizations(data), /法人の検索結果を確認/);
  }
});
test('missing identity, invalid UUID, and missing display names reject unsafe block targets', () => {
  for (const value of [
    { organization_id: 'not-a-uuid', organization_name: row.organization_name },
    { organization_id: ID, organization_name: '' },
    { organization_id: ID, organization_name: '   ' },
    { organization_id: ID, organization_name: null },
    { organization_id: ID },
    { organization_name: '合成法人' },
  ]) assert.throws(() => verifiedScoutBlockableOrganizations([value]), /法人の検索結果を確認/);
});
test('duplicate organizations are ambiguous even when UUID casing differs', () => {
  assert.throws(() => verifiedScoutBlockableOrganizations([row, { ...row, organization_id: ID.toUpperCase() }]), /法人の検索結果を確認/);
});
test('server response exceeding the requested ten-result limit is not rendered', () => {
  const data = Array.from({ length: 11 }, (_, index) => ({
    ...row,
    organization_id: `123e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}`,
  }));
  assert.throws(() => verifiedScoutBlockableOrganizations(data), /法人の検索結果を確認/);
});
