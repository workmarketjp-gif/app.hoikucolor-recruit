import { boundedPrivateRead } from './privateReadDeadline.ts';
import { updateSavedJobAndConfirm } from './savedJobsReadback.ts';

/**
 * A saved-heart RPC or canonical readback can hang. Stop the UI spinner after
 * a bounded interval, but NEVER cancel, retry or assume the mutation failed.
 * A timeout or session loss is an UNKNOWN saved state: the caller must hide
 * the heart and require explicit candidate-scoped canonical reload.
 *
 * No canonical read is started once this deadline has been reached, even if
 * the original server acknowledgement arrives much later. The RPC itself may
 * have committed and remains the source of truth.
 */
export async function confirmSavedJobMutationWithinDeadline(
  jobId: string,
  shouldBeSaved: boolean,
  mutateCanonical: () => Promise<void>,
  rereadCanonical: () => Promise<string[]>,
  isCurrent: () => boolean,
  timeoutMs?: number,
): Promise<string[]> {
  let active = true;
  const requireCurrent = () => {
    if (!active || !isCurrent()) {
      throw new Error('安全なログイン状態を確認できませんでした。');
    }
  };
  requireCurrent();
  try {
    const ids = await boundedPrivateRead(
      () => updateSavedJobAndConfirm(jobId, shouldBeSaved,
        () => {
          requireCurrent();
          return mutateCanonical();
        },
        () => {
          requireCurrent();
          return rereadCanonical();
        },
      ), timeoutMs,
    );
    requireCurrent();
    return ids;
  } finally {
    // Also fences a late ack from triggering a new canonical private RPC.
    active = false;
  }
}
