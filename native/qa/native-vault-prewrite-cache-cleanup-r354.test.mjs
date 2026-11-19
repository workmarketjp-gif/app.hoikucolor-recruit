import test from 'node:test';
import assert from 'node:assert/strict';
import { runVaultPrewriteWithCleanup } from '../src/lib/runVaultPrewriteWithCleanup.ts';

test('successful canonical preflight retains the cache for authorized upload', async () => {
  const order=[];
  await runVaultPrewriteWithCleanup(async()=>{order.push('verify')},async()=>{order.push('release')});
  assert.deepEqual(order,['verify']);
});
test('stale default releases registered picker asset before surfacing error', async () => {
  const order=[]; const stale=new Error('stale');
  await assert.rejects(runVaultPrewriteWithCleanup(async()=>{order.push('verify');throw stale},async()=>{order.push('release')}),err=>err===stale);
  assert.deepEqual(order,['verify','release']);
});
test('failed cache cleanup does not mask original canonical refusal', async () => {
  const stale=new Error('expired session');
  await assert.rejects(runVaultPrewriteWithCleanup(async()=>{throw stale},async()=>{throw new Error('cleanup error')}),err=>err===stale);
});
test('network failure during canonical read releases the picker cache', async () => {
  const order=[]; const network=new Error('network');
  await assert.rejects(runVaultPrewriteWithCleanup(async()=>{order.push('list');throw network},async()=>{order.push('release')}),err=>err===network);
  assert.deepEqual(order,['list','release']);
});
