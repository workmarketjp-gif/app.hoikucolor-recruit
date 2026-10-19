/**
 * Single-process, anonymous public-catalog admission control for local QA.
 * This is deliberately a GLOBAL limiter, not an IP limiter: caller-supplied
 * X-Forwarded-For/CF-Connecting-IP must never select a security principal.
 * Production gateways must inject a distributed limiter at a trusted edge.
 */
export function createLocalAnonymousLimiter({ limit = 30, windowMs = 60_000, now = Date.now } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1_000 || windowMs > 86_400_000 ||
      typeof now !== 'function') throw new Error('MCP_RATE_LIMIT_CONFIG_INVALID');
  let bucketStart = null;
  let used = 0;
  return async () => {
    const current = now();
    if (!Number.isFinite(current)) throw new Error('MCP_RATE_LIMIT_CLOCK_INVALID');
    // Clock rollback invalidates the bucket instead of granting an unbounded pass.
    if (bucketStart === null || current - bucketStart >= windowMs) {
      bucketStart = current;
      used = 0;
    }
    if (current < bucketStart) throw new Error('MCP_RATE_LIMIT_CLOCK_ROLLBACK');
    if (used >= limit) return false;
    used++;
    return true;
  };
}

/**
 * Explicitly bounded audit metadata; tool arguments, source content,
 * candidate identifiers, authorization headers, and IPs are never logged.
 */
export function createLocalPublicMcpAudit({ write = (line) => process.stderr.write(`${line}\n`) } = {}) {
  if (typeof write !== 'function') throw new Error('MCP_AUDIT_WRITER_INVALID');
  return async ({ decision }) => {
    if (!['accepted', 'rate_limited'].includes(decision)) throw new Error('MCP_AUDIT_DECISION_INVALID');
    await write(JSON.stringify({ source: 'hoiku-color-public-mcp', decision }));
  };
}
