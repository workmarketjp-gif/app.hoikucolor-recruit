import assert from 'node:assert/strict';
import test from 'node:test';
import { scanFreshWindow } from '../scan-fresh-window.mjs';

function feed(rows) {
  const calls = [];
  return {
    calls,
    fetchPage: async (offset, limit) => {
      calls.push([offset, limit]);
      return rows.slice(offset, offset + limit).map(row => ({ ...row, total_count: rows.length }));
    },
  };
}
const visible = row => row.fresh ? { id: row.id } : null;

test('stale first RPC page does not hide fresher second page', async () => {
  const source = feed([{ id:'a',fresh:false },{ id:'b',fresh:false },{ id:'c',fresh:true },{ id:'d',fresh:true }]);
  const result = await scanFreshWindow({ ...source, project:visible, limit:2, offset:0 });
  assert.deepEqual(result.jobs.map(x => x.id), ['c','d']);
  assert.deepEqual(source.calls, [[0,2],[2,2]]);
  assert.equal(result.scanned_source_rows, 4);
  assert.equal(result.next_offset, null);
});

test('next_offset counts scanned upstream rows, preventing duplicate listings', async () => {
  const source = feed([{ id:'a',fresh:false },{ id:'b',fresh:true },{ id:'c',fresh:true },
    { id:'d',fresh:false },{ id:'e',fresh:true },{ id:'f',fresh:true },{ id:'g',fresh:true }]);
  const first = await scanFreshWindow({ ...source, project:visible, limit:2, offset:0 });
  assert.deepEqual(first.jobs.map(x => x.id), ['b','c']);
  assert.equal(first.next_offset, 3);
  const second = await scanFreshWindow({ ...source, project:visible, limit:2, offset:first.next_offset });
  assert.deepEqual(second.jobs.map(x => x.id), ['e','f']);
  assert.equal(second.next_offset, 6);
});

test('bounded scan returns empty plus continuation instead of claiming no vacancies', async () => {
  const source = feed(Array.from({length:50}, (_,i) => ({ id:String(i),fresh:false })));
  const result = await scanFreshWindow({ ...source, project:visible, limit:3, offset:0 });
  assert.deepEqual(result.jobs, []);
  assert.equal(source.calls.length, 4);
  assert.equal(result.next_offset, 12);
  assert.equal(result.possible_more_source_rows, true);
});

test('known source exhaustion has no continuation', async () => {
  const source = feed([{ id:'a',fresh:false }]);
  const result = await scanFreshWindow({ ...source, project:visible, limit:5, offset:0 });
  assert.equal(result.next_offset, null);
  assert.deepEqual(source.calls, [[0,5]]);
});

test('scan never requests an offset above the existing public RPC limit', async () => {
  const source = feed(Array.from({length:1000}, (_,i) => ({ id:String(i),fresh:false })));
  const result = await scanFreshWindow({ ...source, project:visible, limit:2, offset:499 });
  assert.deepEqual(source.calls, [[499,2]]);
  assert.equal(result.next_offset, null);
});

test('lookahead transport failure is propagated, never silently reported as zero jobs', async () => {
  let calls = 0;
  await assert.rejects(scanFreshWindow({
    fetchPage: async () => { calls++; if (calls === 2) throw Error('unavailable'); return [{fresh:false,total_count:42}]; },
    project:visible, limit:1, offset:0,
  }), /unavailable/);
  assert.equal(calls, 2);
});

test('invalid config and excessively long upstream page fail closed', async () => {
  const fetchPage = async () => [{ fresh:true },{ fresh:true }];
  await assert.rejects(scanFreshWindow({fetchPage,project:visible,limit:1,offset:0}),/PUBLIC_JOB_SOURCE_INVALID_SHAPE/);
  await assert.rejects(scanFreshWindow({fetchPage,project:visible,limit:0,offset:0}),/PUBLIC_SCAN_CONFIG_INVALID/);
});
