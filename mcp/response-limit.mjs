/**
 * Read an untrusted public API JSON response without trusting Content-Length.
 * Node/Workers Fetch Responses expose byte streams; on oversized chunked
 * transfers reject before decoding or allocating the complete JSON value.
 */
const MAX_PUBLIC_RESPONSE_BYTES = 2_000_000;

export async function readBoundedPublicJson(response) {
  const declared = response.headers?.get?.('content-length');
  if (declared != null && (!/^\d+$/.test(declared) || Number(declared) > MAX_PUBLIC_RESPONSE_BYTES)) {
    try { await response.body?.cancel?.(); } catch { /* already consumed */ }
    throw new Error('PUBLIC_JOB_SOURCE_TOO_LARGE');
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    // Fetch Response always has a stream at runtime; this branch supports
    // older test doubles in our repository without additional dependencies.
    try { return await response.json(); }
    catch { throw new Error('PUBLIC_JOB_SOURCE_INVALID_JSON'); }
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
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
    if (error?.message === 'PUBLIC_JOB_SOURCE_TOO_LARGE') throw error;
    throw new Error('PUBLIC_JOB_SOURCE_INVALID_JSON');
  } finally {
    try { await reader.cancel(); } catch { /* stream already closed */ }
    reader.releaseLock();
  }
}
