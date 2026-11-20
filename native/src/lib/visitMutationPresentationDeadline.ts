/**
 * A bounded UI wait for one candidate-owned visit request/cancellation stage.
 * Expiry is NOT RPC cancellation or evidence of a failed mutation.
 * The caller must synchronously quarantine its mutation lease on deadline,
 * then withhold retry until a new focused, canonically re-read screen.
 */
export class VisitMutationPresentationDeadlineError extends Error {
  constructor() {
    super('見学・体験の処理結果を時間内に確認できませんでした。');
    this.name = 'VisitMutationPresentationDeadlineError';
  }
}

export const DEFAULT_VISIT_MUTATION_DEADLINE_MS = 15_000;

export function boundedVisitMutationPresentation<T>(
  operation: () => Promise<T>,
  onDeadline: () => void,
  timeoutMs = DEFAULT_VISIT_MUTATION_DEADLINE_MS,
): Promise<T> {
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.max(1, Math.floor(timeoutMs)) : DEFAULT_VISIT_MUTATION_DEADLINE_MS;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Fence the still-running underlying operation BEFORE notifying the UI.
      try {
        onDeadline();
      } catch {
        // A failed fencing callback cannot turn an unknown write into success.
      }
      reject(new VisitMutationPresentationDeadlineError());
    }, duration);
    Promise.resolve().then(operation).then(
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
