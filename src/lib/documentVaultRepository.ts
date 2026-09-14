import { hasSupabaseConfig, supabase } from './supabase';

export type JobseekerDocumentType =
  | 'resume'
  | 'work_history'
  | 'nursery_teacher_license'
  | 'kindergarten_license'
  | 'other';

export type JobseekerDocument = {
  id: string;
  jobseeker_clerk_user_id: string;
  document_type: JobseekerDocumentType;
  title: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  is_default: boolean;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
};

export type AttachedApplicationDocument = {
  id: string;
  organization_id: string;
  facility_id: string;
  application_id: string;
  document_type: JobseekerDocumentType;
  title: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  source_jobseeker_document_id: string | null;
  uploaded_by_clerk_user_id: string | null;
  uploaded_at: string;
};

const BUCKET = 'hc-application-documents';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export const documentVaultBackendEnabled = hasSupabaseConfig;

function db() {
  if (!supabase) throw new Error('Supabaseが設定されていません。');
  return supabase;
}

function safeFileName(input: string) {
  const normalized = input
    .normalize('NFKC')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(-120);
  return normalized || 'document';
}

function assertUploadable(file: File) {
  if (!file.size || file.size > MAX_FILE_SIZE) {
    throw new Error('書類は10MB以下のファイルを選択してください。');
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error('PDF、JPEG、PNGのみ保存できます。');
  }
}

const documentColumns =
  'id,jobseeker_clerk_user_id,document_type,title,file_path,mime_type,file_size,is_default,uploaded_at,created_at,updated_at';
const applicationDocumentColumns =
  'id,organization_id,facility_id,application_id,document_type,title,file_path,mime_type,file_size,source_jobseeker_document_id,uploaded_by_clerk_user_id,uploaded_at';

async function storageObjectExists(path: string) {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 30);
  return !error && Boolean(data?.signedUrl);
}

async function ensureUploadedSourceObject(path: string, file: File) {
  const bucket = db().storage.from(BUCKET);
  const upload = () => bucket.upload(path, file, {
    upsert: false,
    contentType: file.type,
  });

  const first = await upload();
  if (!first.error) return;
  if (await storageObjectExists(path)) return;

  const retry = await upload();
  if (!retry.error) return;
  if (await storageObjectExists(path)) return;
  throw retry.error;
}

async function ensureApplicationCopy(sourcePath: string, destinationPath: string) {
  const bucket = db().storage.from(BUCKET);
  const copy = () => bucket.copy(sourcePath, destinationPath);

  const first = await copy();
  if (!first.error) return;

  // A Storage request can commit server-side while the response is lost. The
  // candidate-safe read policy allows probing only this deterministic own path.
  if (await storageObjectExists(destinationPath)) return;

  const retry = await copy();
  if (!retry.error) return;
  if (await storageObjectExists(destinationPath)) return;
  throw retry.error;
}

async function findJobseekerDocumentById(documentId: string): Promise<JobseekerDocument | null> {
  const { data, error } = await db()
    .from('hc_jobseeker_documents')
    .select(documentColumns)
    .eq('id', documentId)
    .maybeSingle();
  if (error) throw error;
  return (data as JobseekerDocument | null) ?? null;
}

async function findAttachedDocument(
  applicationId: string,
  documentId: string,
): Promise<AttachedApplicationDocument | null> {
  const { data, error } = await db()
    .from('hc_application_documents')
    .select(applicationDocumentColumns)
    .eq('application_id', applicationId)
    .eq('source_jobseeker_document_id', documentId)
    .maybeSingle();
  if (error) throw error;
  return (data as AttachedApplicationDocument | null) ?? null;
}

async function cleanupUnregisteredObject(path: string) {
  const { error } = await db().storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function reconcileStaleJobseekerDocumentOrphans(): Promise<number> {
  const { data, error } = await db().rpc('hc_jobseeker_list_stale_document_orphans');
  if (error) throw error;

  const paths = (Array.isArray(data) ? data : [])
    .map((row) => (row && typeof row === 'object' && 'file_path' in row ? row.file_path : null))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  let removed = 0;
  for (const path of paths) {
    // The Storage DELETE policy re-checks ownership and canonical metadata at
    // deletion time. If metadata appeared after the stale-orphan RPC, deletion
    // is denied rather than racing a valid Vault/application record.
    const { error: removeError } = await db().storage.from(BUCKET).remove([path]);
    if (!removeError) removed += 1;
  }
  return removed;
}

let orphanReconciliationPromise: Promise<number> | null = null;
function startOrphanReconciliation() {
  if (orphanReconciliationPromise) return;
  orphanReconciliationPromise = reconcileStaleJobseekerDocumentOrphans().catch(() => 0);
}

export async function listJobseekerDocuments(): Promise<JobseekerDocument[]> {
  // Background-only maintenance: never block the Vault UI on cleanup. The RPC
  // returns only stale, unregistered objects owned by the current candidate.
  startOrphanReconciliation();

  const { data, error } = await db()
    .from('hc_jobseeker_documents')
    .select(documentColumns)
    .order('document_type', { ascending: true })
    .order('is_default', { ascending: false })
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as JobseekerDocument[];
}

export async function uploadJobseekerDocument(
  clerkUserId: string,
  documentType: JobseekerDocumentType,
  file: File,
  options: { title?: string; makeDefault?: boolean } = {},
): Promise<JobseekerDocument> {
  const ownerId = clerkUserId.trim();
  if (!ownerId) throw new Error('ログインユーザーを確認できませんでした。');
  assertUploadable(file);

  const id = crypto.randomUUID();
  const fileName = safeFileName(file.name);
  const path = `jobseekers/${ownerId}/${id}/${fileName}`;
  const title = (options.title?.trim() || file.name || fileName).slice(0, 200);

  await ensureUploadedSourceObject(path, file);

  const { data, error } = await db().rpc('hc_register_jobseeker_document_source', {
    p_document_id: id,
    p_document_type: documentType,
    p_title: title,
    p_file_path: path,
    p_mime_type: file.type,
    p_file_size: file.size,
  });

  let saved = data as JobseekerDocument | null;
  if (error || !saved) {
    try {
      saved = await findJobseekerDocumentById(id);
    } catch {
      // Do not delete an object when the metadata commit result itself is unknown.
      // A later stale-orphan reconciliation can safely remove it only if no
      // canonical row ever appears.
      throw new Error('書類保存の結果を確認できませんでした。画面を再読み込みして確認してください。');
    }

    if (!saved) {
      try {
        await cleanupUnregisteredObject(path);
      } catch {
        throw new Error('書類の保存に失敗し、未登録ファイルの後処理にも失敗しました。もう一度お試しください。');
      }
      if (error) throw error;
      throw new Error('書類を保存できませんでした。');
    }
  }

  if (saved.file_path !== path || saved.jobseeker_clerk_user_id !== ownerId) {
    throw new Error('保存済み書類の整合性を確認できませんでした。');
  }

  if (options.makeDefault) return setDefaultJobseekerDocument(saved.id);
  return saved;
}

export async function setDefaultJobseekerDocument(documentId: string): Promise<JobseekerDocument> {
  const { data, error } = await db().rpc('hc_set_jobseeker_document_default', {
    p_document_id: documentId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('既定書類を更新できませんでした。');
  return data as JobseekerDocument;
}

export async function createJobseekerDocumentSignedUrl(document: JobseekerDocument, expiresIn = 300) {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(document.file_path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('書類を開くURLを作成できませんでした。');
  return data.signedUrl;
}

export async function deleteJobseekerDocument(document: JobseekerDocument) {
  const { data: filePath, error: prepareError } = await db().rpc('hc_prepare_jobseeker_document_delete', {
    p_document_id: document.id,
  });
  if (prepareError) throw prepareError;
  if (typeof filePath !== 'string' || !filePath || filePath !== document.file_path) {
    throw new Error('削除対象の書類を確認できませんでした。');
  }

  const { error: removeError } = await db().storage.from(BUCKET).remove([filePath]);

  // Finalize even when the Storage response failed: the object may already have
  // been removed server-side. The RPC commits metadata deletion only when it can
  // prove that the private object no longer exists.
  const { data: finalized, error: finalizeError } = await db().rpc('hc_finalize_jobseeker_document_delete', {
    p_document_id: document.id,
    p_file_path: filePath,
  });

  if (!finalizeError && finalized === true) return;
  if (removeError) {
    throw new Error('元ファイルの削除を確認できませんでした。書類は一覧に残るため、再度削除できます。');
  }
  if (finalizeError) throw finalizeError;
  throw new Error('書類の削除を完了できませんでした。');
}

export async function listSubmittedApplicationDocuments(applicationId: string): Promise<AttachedApplicationDocument[]> {
  const { data, error } = await db()
    .from('hc_application_documents')
    .select(applicationDocumentColumns)
    .eq('application_id', applicationId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AttachedApplicationDocument[];
}

export async function createAttachedApplicationDocumentSignedUrl(
  document: AttachedApplicationDocument,
  expiresIn = 300,
) {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(document.file_path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('提出済み書類を開くURLを作成できませんでした。');
  return data.signedUrl;
}

export async function listAttachedJobseekerDocumentIds(applicationId: string): Promise<string[]> {
  const submitted = await listSubmittedApplicationDocuments(applicationId);
  return submitted
    .map((row) => row.source_jobseeker_document_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export async function attachJobseekerDocumentToApplication(
  document: JobseekerDocument,
  applicationId: string,
): Promise<AttachedApplicationDocument> {
  const existing = await findAttachedDocument(applicationId, document.id);
  if (existing) return existing;

  const { data: application, error: applicationError } = await db()
    .from('hc_applications')
    .select('id,organization_id,facility_id')
    .eq('id', applicationId)
    .single();
  if (applicationError) throw applicationError;

  const pathParts = document.file_path.split('/');
  const fileName = safeFileName(pathParts[pathParts.length - 1] || document.title);
  const destinationPath = `${application.organization_id}/${application.facility_id}/${application.id}/vault-${document.id}/${fileName}`;

  await ensureApplicationCopy(document.file_path, destinationPath);

  const { data, error } = await db().rpc('hc_register_jobseeker_document_attachment', {
    p_document_id: document.id,
    p_application_id: applicationId,
    p_destination_path: destinationPath,
  });

  if (!error && data && typeof data === 'object') {
    return data as AttachedApplicationDocument;
  }

  let recovered: AttachedApplicationDocument | null;
  try {
    recovered = await findAttachedDocument(applicationId, document.id);
  } catch {
    // The registration request may have committed even if its response was lost.
    // Never delete the destination until we can prove no immutable metadata exists.
    throw new Error('応募書類の登録結果を確認できませんでした。応募管理を再読み込みして確認してください。');
  }

  if (recovered) {
    if (recovered.file_path !== destinationPath) {
      throw new Error('提出済み書類の保存先が一致しません。');
    }
    return recovered;
  }

  try {
    await cleanupUnregisteredObject(destinationPath);
  } catch {
    throw new Error('応募書類への添付に失敗し、未登録コピーの後処理にも失敗しました。もう一度お試しください。');
  }

  if (error) throw error;
  throw new Error('応募書類へ添付できませんでした。');
}