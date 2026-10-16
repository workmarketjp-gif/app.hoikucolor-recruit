/**
 * Bound MCP SDK dispatch independently of rate admission, audit and body reads.
 * The response is discarded when the HTTP caller disconnects or the tool exceeds
 * its budget. Cancellation is advisory: downstream fetch/DB clients must honor
 * Request.signal to stop consuming resources after this helper returns.
 */
export class PublicMcpDispatchError extends Error {
  constructor() { super('MCP_DISPATCH_UNAVAILABLE'); this.name = 'PublicMcpDispatchError'; }
}

export async function dispatchWithDeadline(handler, request, { deadlineMs = 8_000 } = {}) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 100 || deadlineMs > 30_000 ||
      typeof handler?.fetch !== 'function' || !(request instanceof Request)) {
    throw new TypeError('MCP_DISPATCH_CONFIG_INVALID');
  }
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const forwarded = new Request(request, { signal });
  let timeout;
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new PublicMcpDispatchError());
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new PublicMcpDispatchError());
    }, deadlineMs);
  });
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => {
        if (signal.aborted) throw new PublicMcpDispatchError();
        return handler.fetch(forwarded);
      }),
      aborted,
      timedOut,
    ]);
    if (signal.aborted || !(result instanceof Response)) throw new PublicMcpDispatchError();
    return result;
  } catch { throw new PublicMcpDispatchError(); }
  finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}
