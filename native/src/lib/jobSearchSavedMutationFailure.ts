/**
 * A saved-heart mutation can commit even if acknowledgement or canonical
 * readback fails. This is a SAVED-STATE uncertainty, not a job-search failure.
 * Preserve already verified search rows and count; quarantine only hearts.
 * A late failure cannot present an old candidate/session's warning.
 */
export type SavedMutationFailureGate = Readonly<{
  attemptedOwnerKey: string | null;
  currentOwnerKey: string | null;
  attemptedSequence: number;
  currentSequence: number;
  requestGeneration: number;
  currentGeneration: number;
  privateAllowed: boolean;
}>;

export function savedJobMutationFailureNotice(input: SavedMutationFailureGate):
  { ownerKey: string; value: string } | null {
  if (!input.attemptedOwnerKey || input.attemptedOwnerKey !== input.currentOwnerKey ||
      input.attemptedSequence !== input.currentSequence ||
      input.requestGeneration !== input.currentGeneration || !input.privateAllowed) return null;
  return {
    ownerKey: input.attemptedOwnerKey,
    value: '気になるへの保存結果を確認できませんでした。重複操作を避けるため、保存状況を再確認してください。',
  };
}
