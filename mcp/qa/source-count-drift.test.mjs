import assert from 'node:assert/strict';
import test from 'node:test';
import { scanFreshWindow } from '../scan-fresh-window.mjs';

const project = row => row.fresh ? { id: row.id } : null;

test('underreported total_count cannot hide fresh public jobs on the next page', async () => {
  const rows = [
    { id: 'stale-a', fresh: false }, { id: 'stale-b', fresh: false },
    { id: 'fresh-c', fresh: true }, { id: 'fresh-d', fresh: true },
  ];
  const offsets = [];
  const result = await scanFreshWindow({
    limit: 2, offset: 0, project,
    fetchPage: async (offset, limit) => {
      offsets.push(offset);
      return rows.slice(offset, offset + limit).map(row => ({ ...row, total_count: 2 }));
    },
  });
  assert.deepEqual(offsets, [0, 2]);
  assert.deepEqual(result.jobs.map(row => row.id), ['fresh-c', 'fresh-d']);
  assert.equal(result.scanned_source_rows, 4);
  assert.equal(result.reported_total, 2); // intentionally still labelled source-only
  assert.equal(result.possible_more_source_rows, false);
});

test('a stale full page with an underreported count stays resumable after bounded lookahead', async () => {
  const offsets = [];
  const result = await scanFreshWindow({
    limit: 2, offset: 0, project,
    fetchPage: async (offset) => {
      offsets.push(offset);
      return [
        { id: 'stale-' + offset, fresh: false, total_count: 1 },
        { id: 'stale-' + (offset + 1), fresh: false, total_count: 1 },
      ];
    },
  });
  assert.deepEqual(offsets, [0, 2, 4, 6]);
  assert.deepEqual(result.jobs, []);
  assert.equal(result.possible_more_source_rows, true);
  assert.equal(result.next_offset, 8);
});

test('a short upstream page proves exhaustion even if total_count is inflated', async () => {
  const result = await scanFreshWindow({
    limit: 2, offset: 0, project,
    fetchPage: async () => [{ id: 'stale', fresh: false, total_count: 500 }],
  });
  assert.equal(result.possible_more_source_rows, false);
  assert.equal(result.next_offset, null);
});

test('known source count remains a pagination hint once the requested fresh page is full', async () => {
  const result = await scanFreshWindow({
    limit: 2, offset: 0, project,
    fetchPage: async () => [
      { id: 'one', fresh: true, total_count: 2 },
      { id: 'two', fresh: true, total_count: 2 },
    ],
  });
  assert.deepEqual(result.jobs.map(row => row.id), ['one', 'two']);
  assert.equal(result.next_offset, null);
});

test('later source failure cannot be mistaken for a zero-result response after count drift', async () => {
  let calls = 0;
  await assert.rejects(scanFreshWindow({
    limit: 2, offset: 0, project,
    fetchPage: async () => {
      calls++;
      if (calls === 2) throw new Error('UPSTREAM_UNAVAILABLE');
      return [
        { id: 'stale-1', fresh: false, total_count: 2 },
        { id: 'stale-2', fresh: false, total_count: 2 },
      ];
    },
  }), /UPSTREAM_UNAVAILABLE/);
  assert.equal(calls, 2);
});
