/**
 * Bounded public RPC JSON response reader. Limits both streamed bytes and
 * wall-clock body completion, independently of the upstream fetch signal.
 * An upstream proxy/stream must not hold the MCP tool open indefinitely.
 */
const MAX_PUBLIC_RESPONSE_BYTES = 2_000_000;
const DEFAULT_BODY_DEADLINE_MS = 8_000;

export async function readBoundedPublicJson(response, { deadlineMs = DEFAULT_BODY_DEADLINE_MS } = {}) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30_000) {
    throw new Error('PUBLIC_BODY_DEADLINE_INVALID');
  }
  let timer;
  let reader;
  let complete = false;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('PUBLIC_JOB_SOURCE_BODY_TIMEOUT')), deadlineMs);
  });
  try {
    const declared = response.headers?.get?.('content-length');
    if (declared != null && (!/^\d+$/.test(declared) || Number(declared) > MAX_PUBLIC_RESPONSE_BYTES)) {
      // Do not await an untrusted stream's cancellation; it may also stall.
      try { void response.body?.cancel?.()?.catch?.(() => {}); } catch { /* already consumed */ }
      throw new Error('PUBLIC_JOB_SOURCE_TOO_LARGE');
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      // Legacy test doubles: still bound completion, despite no byte stream.
      const value = await Promise.race([Promise.resolve().then(() => response.json()), deadline]);
      // This code path is not used by Node/Workers Fetch Responses; do not
      // mistake JSON size in characters for a dependable streamed byte cap.
      return value;
    }
    reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { complete = true; break; }
      if (!(value instanceof Uint8Array)) throw new Error('PUBLIC_JOB_SOURCE_INVALID_JSON');
      received += value.byteLength;
      if (received > MAX_PUBLIC_RESPONSE_BYTES) throw new Error('PUBLIC_JOB_SOURCE_TOO_LARGE');
      chunks.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error?.message === 'PUBLIC_JOB_SOURCE_TOO_LARGE' ||
        error?.message === 'PUBLIC_JOB_SOURCE_BODY_TIMEOUT') throw error;
    throw new Error('PUBLIC_JOB_SOURCE_INVALID_JSON');
  } finally {
    clearTimeout(timer);
    if (reader) {
      if (!complete) {
        try { void reader.cancel().catch(() => {}); } catch { /* already cancelled */ }
      }
      try { reader.releaseLock(); } catch { /* pending read after cancellation */ }
    }
  }
}
