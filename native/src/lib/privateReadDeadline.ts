/**
 * Bound one candidate-private canonical read so an indefinitely pending RPC
 * cannot leave a Native screen in an unverified spinner forever. This is a
 * presentation deadline: it never retries, changes an RPC, or claims the
 * server stopped processing a request. Promise settlement is always observed
 * even after the deadline, avoiding unhandled late rejections.
 */
export const DEFAULT_PRIVATE_READ_TIMEOUT_MS = 15_000;

export function boundedPrivateRead<T>(
  read: () => Promise<T>,
  timeoutMs = DEFAULT_PRIVATE_READ_TIMEOUT_MS,
): Promise<T> {
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.max(1, Math.floor(timeoutMs))
    : DEFAULT_PRIVATE_READ_TIMEOUT_MS;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('通信がタイムアウトしました。再読み込みしてください。'));
    }, duration);
    Promise.resolve().then(read).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
