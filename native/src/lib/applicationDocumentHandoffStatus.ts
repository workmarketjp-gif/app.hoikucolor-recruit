import type { ApplicationDocumentHandoffState } from './applicationJourneyApi';

/**
 * A failed/unauthorized document read is NOT proof that every required
 * document was handed off. Only the canonical server response can confirm it.
 * No error details or private document metadata are retained on failure.
 */
export function classifyApplicationDocumentHandoff(
  state: ApplicationDocumentHandoffState | null,
): 'unverified' | 'missing' | 'confirmed' {
  if (state === null) return 'unverified';
  return state.missingSourceDocumentIds.length > 0 ? 'missing' : 'confirmed';
}

/** An optional document-status failure must not disable message/interview views. */
export async function readApplicationDocumentHandoff(
  read: () => Promise<ApplicationDocumentHandoffState>,
): Promise<ApplicationDocumentHandoffState | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}
