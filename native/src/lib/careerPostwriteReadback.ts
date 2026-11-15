import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * A career-condition mutation may already have committed when its acknowledgement
 * or the following canonical read is lost. Bound ONLY the readback, never the
 * write: a timeout must remain an ambiguous write requiring an explicit fresh
 * canonical reload before the next mutation, not a reason to resend.
 *
 * The readback uses the same owner-pinned Supabase client supplied by the
 * caller. The component is responsible for gating the next write and fencing
 * stale owner/session/App Lock results.
 */
export async function confirmSavedCareer<T extends object>(
  readCanonical: () => Promise<T | null>,
  submitted: T,
  timeoutMs?: number,
): Promise<T> {
  const saved = await boundedPrivateRead(readCanonical, timeoutMs);
  const keys = Object.keys(submitted) as (keyof T)[];
  if (!saved || !keys.every((key) => saved[key] === submitted[key])) {
    throw new Error('保存した内容を確認できませんでした。もう一度お試しください。');
  }
  return saved;
}

export async function confirmDeletedCareer(
  readCanonical: () => Promise<unknown>,
  timeoutMs?: number,
): Promise<void> {
  if ((await boundedPrivateRead(readCanonical, timeoutMs)) !== null) {
    throw new Error('保存した条件を削除できませんでした。もう一度お試しください。');
  }
}
