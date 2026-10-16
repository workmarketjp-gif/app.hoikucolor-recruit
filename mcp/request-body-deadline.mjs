/**
 * Read anonymous MCP JSON request bodies within a total wall-clock deadline.
 * The SDK's byte cap is kept as defence in depth; a Content-Length check alone
 * cannot stop chunked / slowloris clients that never finish sending a body.
 * This helper does not parse, log, or inspect caller-controlled JSON content.
 */
export class PublicMcpBodyError extends Error {
  constructor(status) {
    super('PUBLIC_MCP_BODY_REJECTED');
    this.status = status;
  }
}

export async function readBoundedPublicMcpBody(request, { maxBytes = 65_536, deadlineMs = 5_000 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1_048_576 ||
      !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30_000) {
    throw new Error('MCP_BODY_READER_CONFIG_INVALID');
  }
  if (!request?.body || request.bodyUsed || request.signal?.aborted) {
    throw new PublicMcpBodyError(400);
  }

  const reader = request.body.getReader();
  const chunks = [];
  let byteLength = 0;
  let completed = false;
  let timeoutId;
  let onAbort;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new PublicMcpBodyError(408)), deadlineMs);
  });
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new PublicMcpBodyError(400));
    request.signal?.addEventListener('abort', onAbort, { once: true });
  });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline, aborted]);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) throw new PublicMcpBodyError(400);
      byteLength += part.value.byteLength;
      if (byteLength > maxBytes) throw new PublicMcpBodyError(413);
      chunks.push(part.value);
    }
    const result = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    completed = true;
    return result;
  } finally {
    clearTimeout(timeoutId);
    request.signal?.removeEventListener('abort', onAbort);
    if (!completed) void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* pending read after cancellation */ }
  }
}
