/**
 * Give repeated, visually identical document action buttons an unambiguous
 * screen-reader name without disclosing other candidates or applications.
 * Inputs must come from the current, already-authorized document snapshot.
 */
export function applicationDocumentActionAccessibilityLabel(
  action: 'submit' | 'submitted' | 'open',
  documentTypeLabel: string,
  title: string,
): string {
  const normalize = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/gu, ' ').trim();
  const kind = normalize(documentTypeLabel) || '応募書類';
  const name = normalize(title);
  const documentName = name ? `${kind}「${name}」` : kind;
  if (action === 'submit') return `${documentName}をこの応募に提出`;
  if (action === 'submitted') return `${documentName}は提出済み`;
  return `${documentName}を開く`;
}
