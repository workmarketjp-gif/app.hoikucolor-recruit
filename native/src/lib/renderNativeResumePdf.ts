/**
 * Native-only PDF byte rendering. expo-print renders HTML on-device rather than
 * opening a browser or sending applicant data to any remote PDF service.
 * Both platforms must verify actual A4 output before acceptance.
 */
import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import { buildResumeA4Html, type ResumeA4Kind } from './resumeA4Html';
import type { ResumeReview } from './resumeReviewModel';
import { prepareGeneratedPdfBytes } from './generatedPdfDocument';

export async function renderNativeResumePdf(
  kind: ResumeA4Kind,
  review: ResumeReview,
  photoDataUri: string | null,
  canContinue: () => boolean,
): Promise<ArrayBuffer> {
  if (!canContinue()) throw new Error('DOCUMENT_UPLOAD_QUARANTINED');
  const html = buildResumeA4Html(kind, review, photoDataUri);
  const output = await Print.printToFileAsync({ html, width: 595.28, height: 841.89 });
  if (!output.uri.startsWith('file://')) throw new Error('PDFの一時ファイルを確認できませんでした。');
  const file = new File(output.uri);
  try {
    if (!canContinue()) throw new Error('DOCUMENT_UPLOAD_QUARANTINED');
    const result = prepareGeneratedPdfBytes(await file.arrayBuffer());
    if (!canContinue()) throw new Error('DOCUMENT_UPLOAD_QUARANTINED');
    return result;
  } finally {
    // A PDF contains sensitive candidate data. Do not leave the print export
    // in the OS cache when the flow completes, fails, or the session changes.
    if (file.exists) file.delete();
    if (file.exists) throw new Error('端末の一時PDFを削除できませんでした。');
  }
}
