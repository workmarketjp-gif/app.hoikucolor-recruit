/** A native confirmation must never delete a different history row after edits/reorder/reload. */
export type ResumeRemovalLease = {
  owner: string;
  generation: number;
  draftRevision: number;
  index: number;
  item: { id: string };
};

export type ResumeRemovalCurrent = {
  owner: string | null;
  generation: number;
  draftRevision: number;
  privateAllowed: boolean;
  item: { id: string } | null;
};

/** Capture the exact row displayed when the user opens the destructive dialog. */
export function captureResumeRemoval(
  owner: string | null,
  generation: number,
  draftRevision: number,
  index: number,
  entries: readonly { id: string }[],
): ResumeRemovalLease | null {
  const item = entries[index];
  if (!owner || !item || !Number.isSafeInteger(index) || index < 0) return null;
  return { owner, generation, draftRevision, index, item };
}

/** Require both the original edit generation and the *same object at that index*. */
export function isResumeRemovalStillCurrent(
  captured: ResumeRemovalLease,
  current: ResumeRemovalCurrent,
): boolean {
  return current.privateAllowed && current.owner === captured.owner &&
    current.generation === captured.generation &&
    current.draftRevision === captured.draftRevision &&
    current.item === captured.item;
}
