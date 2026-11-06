/**
 * Candidate-owned generated-PDF registration. Only the PDF itself is uploaded;
 * the optional source photo is never uploaded separately. This adapter reuses
 * the existing private document-vault path and registration RPC.
 *
 * A failed/ambiguous registration is reconciled by document ID before cleanup.
 * A changed Clerk session must not start or continue a new registration.
 */
export const GENERATED_PDF_MAX_BYTES = 10 * 1024 * 1024;
export type GeneratedPdfType = 'resume' | 'work_history';

export type GeneratedPdfRecord = {
  id: string;
  jobseeker_clerk_user_id: string;
  document_type: string;
  file_path: string;
  is_default: boolean;
};

type GeneratedPdfOperations<T extends GeneratedPdfRecord> = {
  newId: () => string;
  upload: (path: string, bytes: ArrayBuffer) => Promise<void>;
  register: (args: { id: string; type: GeneratedPdfType; title: string; path: string; size: number }) => Promise<T | null>;
  readback: (id: string) => Promise<T | null>;
  cleanup: (path: string) => Promise<void>;
  setDefault: (id: string) => Promise<T>;
};

export type GeneratedPdfRequest<T extends GeneratedPdfRecord> = {
  ownerId: string;
  type: GeneratedPdfType;
  bytes: Uint8Array | ArrayBuffer;
  title?: string;
  makeDefault?: boolean;
  canContinue?: () => boolean;
  operations: GeneratedPdfOperations<T>;
};

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PDF_EOF = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF

/** Copy bytes to a standalone ArrayBuffer; never trust a caller's shared view. */
export function prepareGeneratedPdfBytes(input: Uint8Array | ArrayBuffer): ArrayBuffer {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (src.byteLength < 16 || src.byteLength > GENERATED_PDF_MAX_BYTES) {
    throw new Error('PDFは10MB以下の有効なファイルを作成してください。');
  }
  if (!PDF_HEADER.every((byte, index) => src[index] === byte)) {
    throw new Error('作成された書類はPDF形式ではありません。');
  }
  // Reject truncated exports; pdf-lib emits %%EOF near the end of the file.
  let eof = false;
  for (let i = Math.max(0, src.length - 1024); i <= src.length - PDF_EOF.length; i += 1) {
    if (PDF_EOF.every((byte, index) => src[i + index] === byte)) { eof = true; break; }
  }
  if (!eof) throw new Error('PDFの作成が完了していません。もう一度作成してください。');
  return Uint8Array.from(src).buffer;
}

function mustBeCurrent(canContinue?: () => boolean) {
  if (canContinue && !canContinue()) throw new Error('DOCUMENT_UPLOAD_QUARANTINED');
}

function validDocument<T extends GeneratedPdfRecord>(record: T | null, id: string, ownerId: string, type: GeneratedPdfType, path: string): record is T {
  return Boolean(record && record.id === id && record.jobseeker_clerk_user_id === ownerId &&
    record.document_type === type && record.file_path === path);
}

/**
 * The upload result alone is not a registered document. Confirm canonical row
 * and owner before presenting success. Never create a second ID on retry.
 */
export async function saveGeneratedPdfWithReadback<T extends GeneratedPdfRecord>(request: GeneratedPdfRequest<T>): Promise<T> {
  const { operations, type, canContinue } = request;
  const ownerId = request.ownerId.trim();
  if (!ownerId || !/^[A-Za-z0-9_\-]+$/.test(ownerId)) throw new Error('ログインユーザーを確認できませんでした。');
  if (type !== 'resume' && type !== 'work_history') throw new Error('書類の種類を確認できませんでした。');
  const bytes = prepareGeneratedPdfBytes(request.bytes);
  mustBeCurrent(canContinue);
  const id = operations.newId();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('書類の識別子を作成できませんでした。');
  }
  const path = 'jobseekers/' + ownerId + '/' + id + '/document.pdf';
  const title = (request.title?.trim() || (type === 'resume' ? '履歴書' : '職務経歴書')).slice(0, 200);
  await operations.upload(path, bytes);
  // A sign-out after upload but before registration must not attach stale files.
  try { mustBeCurrent(canContinue); } catch (error) {
    try { await operations.cleanup(path); } catch { throw new Error('書類の登録を中止しましたが、一時ファイルの削除を確認できませんでした。'); }
    throw error;
  }
  let acknowledged: T | null = null;
  try { acknowledged = await operations.register({ id, type, title, path, size: bytes.byteLength }); }
  catch { /* RPC may have committed before the network failed; reconcile below. */ }
  // Even a successful RPC response must be independently confirmed by the
  // canonical documents table. Never treat upload/registration as readback.
  let saved: T | null;
  try { saved = await operations.readback(id); }
  catch { throw new Error('書類の保存結果を確認できませんでした。書類一覧を再読み込みしてください。'); }
  if (!saved) {
    // If the RPC acknowledged a row, a temporarily empty read cannot justify
    // deleting its Storage object. Leave it for safe reconciliation.
    if (acknowledged) throw new Error('書類の保存結果を確認できませんでした。書類一覧を再読み込みしてください。');
    try { await operations.cleanup(path); }
    catch { throw new Error('書類が登録されず、一時ファイルの削除も確認できませんでした。'); }
    throw new Error('PDFを登録できませんでした。');
  }
  if (!validDocument(saved, id, ownerId, type, path)) throw new Error('保存された書類の所有者・種類・パスが一致しません。');
  mustBeCurrent(canContinue);
  if (request.makeDefault) {
    const selected = await operations.setDefault(saved.id);
    if (!validDocument(selected, id, ownerId, type, path) || !selected.is_default) {
      throw new Error('応募時に使う書類の設定を確認できませんでした。');
    }
    mustBeCurrent(canContinue);
    return selected;
  }
  return saved;
}
