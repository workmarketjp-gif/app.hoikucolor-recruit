/**
 * Bound trusted admission/audit dependencies before any MCP dispatch.
 * Fail closed on timeout, disconnect, or policy error. Abort is cooperative:
 * adapters should forward the signal to their I/O, never assume completion
 * after an aborted check implies permission to dispatch.
 */
export class PublicMcpPolicyError extends Error {
  constructor() { super('PUBLIC_MCP_POLICY_UNAVAILABLE'); }
}

export async function runPolicyWithDeadline(action, { deadlineMs = 2_000, parentSignal } = {}) {
  if (typeof action !== 'function' || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 10_000) {
    throw new Error('MCP_POLICY_DEADLINE_CONFIG_INVALID');
  }
  if (parentSignal?.aborted) throw new PublicMcpPolicyError();
  const controller = new AbortController();
  let timer;
  let onAbort;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PublicMcpPolicyError());
    }, deadlineMs);
  });
  const disconnected = new Promise((_, reject) => {
    onAbort = () => {
      controller.abort();
      reject(new PublicMcpPolicyError());
    };
    parentSignal?.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => action(controller.signal)),
      timeout,
      disconnected,
    ]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onAbort);
  }
}
