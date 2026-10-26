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
    // Keep the preexisting public API contract for an empty FIRST page.
    // An empty later page at a nonzero offset does not establish total = 0.
    if (offset === 0 && cursor === 0 && rows.length === 0) reportedTotal = 0;
    if (reportedTotal === null && rows.length) {
      // SQL count may be an integer or a decimal string (PostgREST bigint).
      // null, blank strings and booleans mean UNKNOWN, not zero: Number(null)
      // would otherwise cut off pagination after a full page of public jobs.
      const rawTotal = rows[0]?.total_count;
      if ((typeof rawTotal === 'number' && Number.isSafeInteger(rawTotal)) ||
          (typeof rawTotal === 'string' && /^(?:0|[1-9][0-9]*)$/.test(rawTotal))) {
        const total = Number(rawTotal);
        if (Number.isSafeInteger(total) && total >= 0) reportedTotal = total;
      }
    }
    lastWindowFull = rows.length === limit;
    for (const row of rows) {
      const visible = project(row);
      cursor++;
      scanned++;
      if (visible) jobs.push(visible);
      if (jobs.length === limit) break;
    }
    // total_count is an upstream snapshot, not an authorization or end-of-feed
    // signal. On a full page with too few fresh jobs, keep looking even when
    // that snapshot claims exhaustion: concurrent updates or stale counts
    // must not turn available jobs into an apparently empty MCP response.
    // A reported total smaller than the actual row cursor is provably stale.
    // It must never suppress pagination even after enough fresh jobs are found.
    if (!lastWindowFull) {
      sourceEndReached = true;
      break;
    }
  }
  // Upstream count precedes the MCP 12-hour check; never claim it is the
  // number of fresh jobs. Resume only at a valid upstream row offset.
  // total_count is advisory. An exact equality can also be stale during a
  // concurrent publication or upstream cache refresh. A full page ALWAYS
  // offers a bounded continuation so eligible jobs are not silently lost.
  // The next request will determine actual exhaustion via a short/empty page.
  const morePossible = !sourceEndReached && lastWindowFull && cursor > offset;
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
