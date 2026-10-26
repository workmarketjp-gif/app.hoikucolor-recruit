import assert from 'node:assert/strict';
import test from 'node:test';
import { scanFreshWindow } from '../scan-fresh-window.mjs';

// A stale total_count must not terminate pagination when the actual public
// RPC returned more rows than its own reported total. Only the anonymous,
// already-published projection determines which jobs can be displayed.
const project = row => row.fresh ? { id: row.id } : null;
function source(total) {
  const rows = [
    { id: 'a', fresh: true, total_count: total },
    { id: 'b', fresh: true, total_count: total },
    { id: 'c', fresh: true, total_count: total },
  ];
  const calls = [];
  return {
    calls,
    fetchPage: async (offset, limit) => {
      calls.push([offset, limit]);
      return rows.slice(offset, offset + limit);
    },
  };
}

for (const total of [0, 1]) {
  test('underreported total_count ' + total + ' does not erase a real next page', async () => {
    const feed = source(total);
    const first = await scanFreshWindow({ ...feed, project, limit: 2, offset: 0 });
    assert.deepEqual(first.jobs.map(job => job.id), ['a', 'b']);
    assert.equal(first.reported_total, total);
    assert.equal(first.next_offset, 2);
    assert.equal(first.possible_more_source_rows, true);
    const second = await scanFreshWindow({ ...feed, project, limit: 2, offset: first.next_offset });
    assert.deepEqual(second.jobs.map(job => job.id), ['c']);
    assert.equal(second.next_offset, null);
    assert.deepEqual(feed.calls, [[0, 2], [2, 2]]);
  });
}

test('reported exact total cannot suppress a real next job on a full page', async () => {
  const feed = source(2);
  const result = await scanFreshWindow({ ...feed, project, limit: 2, offset: 0 });
  assert.equal(result.next_offset, 2);
  assert.equal(result.possible_more_source_rows, true);
  const next = await scanFreshWindow({ ...feed, project, limit: 2, offset: result.next_offset });
  assert.deepEqual(next.jobs.map(job => job.id), ['c']);
  assert.equal(next.next_offset, null);
  assert.deepEqual(feed.calls, [[0, 2], [2, 2]]);
});

test('underreported total never changes fresh-only projection', async () => {
  const feed = source(0);
  const result = await scanFreshWindow({
    ...feed, project: row => row.id === 'a' ? null : project(row),
    limit: 2, offset: 0,
  });
  assert.deepEqual(result.jobs.map(job => job.id), ['b', 'c']);
  assert.equal(result.scanned_source_rows, 3);
});
