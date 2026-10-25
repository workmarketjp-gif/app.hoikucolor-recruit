import assert from 'node:assert/strict';
import test from 'node:test';
import { scanFreshWindow } from '../scan-fresh-window.mjs';

const project = row => row.visible ? { id: row.id } : null;

function source(rows, count) {
  const offsets = [];
  return {
    offsets,
    fetchPage: async (offset, limit) => {
      offsets.push(offset);
      return rows.slice(offset, offset + limit)
        .map(row => ({ ...row, total_count: count }));
    },
  };
}

test('NULL upstream total_count is unknown, not zero: public-job pagination remains reachable', async () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ id: String(i), visible: true }));
  const feed = source(rows, null);
  const first = await scanFreshWindow({ ...feed, project, limit: 2, offset: 0 });
  assert.equal(first.reported_total, null);
  assert.deepEqual(first.jobs.map(row => row.id), ['0', '1']);
  assert.equal(first.next_offset, 2);
  assert.equal(first.possible_more_source_rows, true);
  const second = await scanFreshWindow({ ...feed, project, limit: 2, offset: first.next_offset });
  assert.deepEqual(second.jobs.map(row => row.id), ['2', '3']);
  assert.deepEqual(feed.offsets, [0, 2]);
});

test('unavailable or malformed totals do not falsely end a complete result page', async () => {
  for (const raw of [null, undefined, '', ' ', false, true, '2.5', -1, '-1', {}, []]) {
    const feed = source([
      { id: 'a', visible: true }, { id: 'b', visible: true },
      { id: 'c', visible: true },
    ], raw);
    const result = await scanFreshWindow({ ...feed, project, limit: 2, offset: 0 });
    assert.equal(result.reported_total, null, String(raw));
    assert.equal(result.next_offset, 2, String(raw));
    assert.equal(result.possible_more_source_rows, true, String(raw));
  }
});

test('genuine numeric and PostgREST bigint-string counts retain normal exhaustion hints', async () => {
  for (const count of [2, '2']) {
    const feed = source([{ id: 'a', visible: true }, { id: 'b', visible: true }], count);
    const result = await scanFreshWindow({ ...feed, project, limit: 2, offset: 0 });
    assert.deepEqual(result.jobs.map(row => row.id), ['a', 'b']);
    assert.equal(result.reported_total, 2);
    assert.equal(result.next_offset, null);
    assert.equal(result.possible_more_source_rows, false);
  }
});

test('empty initial upstream page still truthfully reports no source rows', async () => {
  const feed = source([], undefined);
  const result = await scanFreshWindow({ ...feed, project, limit: 2, offset: 0 });
  assert.equal(result.reported_total, 0);
  assert.deepEqual(result.jobs, []);
  assert.equal(result.next_offset, null);
});
