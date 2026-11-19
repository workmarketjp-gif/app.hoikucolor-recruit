/**
 * Release a pending picker/camera cache entry if a pre-upload validation fails.
 * Never swallow the original identity/readback failure or leave an abandoned
 * private picker asset accessible to the next candidate session.
 */
export async function runVaultPrewriteWithCleanup(
  verify: () => Promise<void>,
  releasePendingAsset: () => Promise<unknown>,
): Promise<void> {
  try {
    await verify();
  } catch (error) {
    try { await releasePendingAsset(); } catch { /* retain original failure */ }
    throw error;
  }
}
