/**
 * PDF generation reads candidate data and a local, optional photo through
 * asynchronous boundaries. A photo picker/removal invalidates the PDF snapshot
 * immediately (even if the OS picker is later cancelled). Never register a
 * document rendered from a different photo selection than the current screen.
 */
export type ResumePdfPhotoSnapshot = {
  ownerKey: string;
  generation: number;
  draftRevision: number;
  photoRevision: number;
};

export type ResumePdfPhotoCurrentState = ResumePdfPhotoSnapshot & {
  canAccessPrivateData: boolean;
  photoMutationInFlight: boolean;
};

export function isResumePdfPhotoSnapshotCurrent(
  started: ResumePdfPhotoSnapshot,
  current: ResumePdfPhotoCurrentState,
): boolean {
  return Boolean(
    started.ownerKey &&
    started.ownerKey === current.ownerKey &&
    started.generation === current.generation &&
    started.draftRevision === current.draftRevision &&
    started.photoRevision === current.photoRevision &&
    current.canAccessPrivateData &&
    !current.photoMutationInFlight
  );
}
