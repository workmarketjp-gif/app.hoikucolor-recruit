import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmedScoutWriteReadback } from '../src/lib/scoutWriteReadback.ts';

const offered = [{ scout_id: 'synthetic-offer-1', scout_status: 'accepted' }];
const assertAccepted = (rows) => {
  if (rows.filter((row) => row.scout_id === 'synthetic-offer-1' && row.scout_status === 'accepted').length !== 1) {
    throw new Error('承諾の正式確認が完了していません。');
  }
  return rows;
};

test('verified post-mutation canonical snapshot is returned once, without a second RPC', async () => {
  let reads = 0;
  const result = await confirmedScoutWriteReadback(async () => { reads++; return offered; }, assertAccepted, () => true);
  assert.equal(result, offered);
  assert.equal(reads, 1);
});

test('expired owner before read prevents a private RPC and result publication', async () => {
  let reads = 0;
  await assert.rejects(
    () => confirmedScoutWriteReadback(async () => { reads++; return offered; }, assertAccepted, () => false),
    /ログイン状態/,
  );
  assert.equal(reads, 0);
});

test('owner revocation during a read disallows verification after its resolution', async () => {
  let resolveRead;
  let owned = true;
  let verified = false;
  const pending = confirmedScoutWriteReadback(
    () => new Promise((resolve) => { resolveRead = resolve; }),
    (rows) => { verified = true; return assertAccepted(rows); },
    () => owned,
    500,
  );
  await Promise.resolve();
  owned = false;
  resolveRead(offered);
  await assert.rejects(pending, /ログイン状態/);
  assert.equal(verified, false);
});

test('unconfirmed canonical state is rejected without inventing acceptance', async () => {
  let reads = 0;
  await assert.rejects(
    () => confirmedScoutWriteReadback(async () => { reads++; return [{ scout_id: 'synthetic-offer-1', scout_status: 'pending' }]; }, assertAccepted, () => true),
    /正式確認/,
  );
  assert.equal(reads, 1);
});

test('hanging readback times out and a subsequent late resolution is ignored', async () => {
  let resolveRead;
  let validateCount = 0;
  const pending = confirmedScoutWriteReadback(
    () => new Promise((resolve) => { resolveRead = resolve; }),
    (rows) => { validateCount++; return rows; },
    () => true,
    20,
  );
  await assert.rejects(pending, /タイムアウト/);
  resolveRead(offered);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(validateCount, 0);
});

test('late rejection from a timed-out readback is observed, not unhandled', async () => {
  let rejectRead;
  const pending = confirmedScoutWriteReadback(
    () => new Promise((_, reject) => { rejectRead = reject; }),
    (rows) => rows,
    () => true,
    20,
  );
  await assert.rejects(pending, /タイムアウト/);
  rejectRead(new Error('synthetic private-path/candidate-id'));
  await new Promise((resolve) => setImmediate(resolve));
});

test('lease is checked again after a synchronous verifier', async () => {
  let owned = true;
  await assert.rejects(
    () => confirmedScoutWriteReadback(async () => offered, (rows) => { owned = false; return rows; }, () => owned),
    /ログイン状態/,
  );
});
