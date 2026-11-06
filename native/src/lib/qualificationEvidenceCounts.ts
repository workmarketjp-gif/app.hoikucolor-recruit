/** Counts only candidate-owned, freshly re-read vault rows passed by the caller.
 * This is storage evidence, never licence verification by a nursery. */
export function qualificationEvidenceCounts<T extends string>(
  evidenceTypes: readonly T[],
  documents: readonly { document_type: string }[],
): { type: T; savedCount: number }[] {
  return evidenceTypes.map((type) => ({
    type,
    savedCount: documents.reduce((count, document) => count + (document.document_type === type ? 1 : 0), 0),
  }));
}
