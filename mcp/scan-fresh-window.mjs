/**
 * Bounded lookahead over the existing anonymous public search RPC.
 * offset and next_offset are upstream row positions, not counts of eligible jobs.
 * This mitigates, but does not eliminate, the upstream 7-day vs MCP 12-hour skew.
 */
export async function scanFreshWindow({ fetchPage, project, limit, offset, maxWindows = 4, maxOffset = 500 }) {
  if (typeof fetchPage !== 'function' || typeof project !== 'function' ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 20 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > maxOffset ||
      !Number.isSafeInteger(maxWindows) || maxWindows < 1 || maxWindows > 4 ||
      !Number.isSafeInteger(maxOffset) || maxOffset < 0 || maxOffset > 500) {
    throw new Error('PUBLIC_SCAN_CONFIG_INVALID');
  }
  const jobs = [];
  let cursor = offset;
  let reportedTotal = null;
  let scanned = 0;
  let lastWindowFull = false;
  let sourceEndReached = false;
  for (let window = 0; window < maxWindows && cursor <= maxOffset && jobs.length < limit; window++) {
    const rows = await fetchPage(cursor, limit);
    if (!Array.isArray(rows) || rows.length > limit) throw new Error('PUBLIC_JOB_SOURCE_INVALID_SHAPE');
    if (reportedTotal === null && rows.length) {
      const total = Number(rows[0]?.total_count);
      if (Number.isSafeInteger(total) && total >= 0) reportedTotal = total;
    }
    lastWindowFull = rows.length === limit;
    for (const row of rows) {
      const visible = project(row);
      cursor++;
      scanned++;
      if (visible) jobs.push(visible);
      if (jobs.length === limit) break;
    }
    if (!lastWindowFull || (reportedTotal !== null && cursor >= reportedTotal)) {
      sourceEndReached = true;
      break;
    }
  }
  // Upstream count precedes the MCP 12-hour check; never claim it is the
  // number of fresh jobs. Resume only at a valid upstream row offset.
  const morePossible = !sourceEndReached && lastWindowFull && cursor > offset &&
    (reportedTotal === null || cursor < reportedTotal);
  const nextOffset = morePossible && cursor <= maxOffset ? cursor : null;
  return {
    jobs,
    scanned_source_rows: scanned,
    reported_total: reportedTotal,
    next_offset: nextOffset,
    // May be true even if the public tool's 500-row offset cap is reached.
    possible_more_source_rows: morePossible,
  };
}
