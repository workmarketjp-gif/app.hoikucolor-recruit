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
  'image/gif',
  'image/webp',
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
    throw new Error('PDF、JPEG、PNG、GIF、WebPのみ保存できます。');
  }
}

const documentColumns =
  'id,jobseeker_clerk_user_id,document_type,title,file_path,mime_type,file_size,is_default,uploaded_at,created_at,updated_at';

export async function listJobseekerDocuments(): Promise<JobseekerDocument[]> {
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

  const { error: uploadError } = await db().storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await db()
    .from('hc_jobseeker_documents')
    .insert({
      id,
      jobseeker_clerk_user_id: ownerId,
      document_type: documentType,
      title,
      file_path: path,
      mime_type: file.type,
      file_size: file.size,
      is_default: false,
    })
    .select(documentColumns)
    .single();

  if (error) {
    await db().storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }

  const saved = data as JobseekerDocument;
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
  const { data: links, error: linkError } = await db()
    .from('hc_application_documents')
    .select('id')
    .eq('source_jobseeker_document_id', document.id)
    .limit(1);
  if (linkError) throw linkError;

  if ((links ?? []).length > 0) {
    const { error: deleteMetadataError } = await db()
      .from('hc_jobseeker_documents')
      .delete()
      .eq('id', document.id);
    if (deleteMetadataError) throw deleteMetadataError;
    const { error: removeError } = await db().storage.from(BUCKET).remove([document.file_path]);
    if (removeError) throw new Error('書類庫からは削除しましたが、元ファイルの後処理に失敗しました。');
    return;
  }

  const { error: removeError } = await db().storage.from(BUCKET).remove([document.file_path]);
  if (removeError) throw removeError;
  const { error: deleteMetadataError } = await db()
    .from('hc_jobseeker_documents')
    .delete()
    .eq('id', document.id);
  if (deleteMetadataError) throw deleteMetadataError;
}

export async function attachJobseekerDocumentToApplication(
  document: JobseekerDocument,
  applicationId: string,
): Promise<AttachedApplicationDocument> {
  const { data: existing, error: existingError } = await db()
    .from('hc_application_documents')
    .select('id,organization_id,facility_id,application_id,document_type,title,file_path,mime_type,file_size,source_jobseeker_document_id,uploaded_by_clerk_user_id,uploaded_at')
    .eq('application_id', applicationId)
    .eq('source_jobseeker_document_id', document.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing as AttachedApplicationDocument;

  const { data: application, error: applicationError } = await db()
    .from('hc_applications')
    .select('id,organization_id,facility_id')
    .eq('id', applicationId)
    .single();
  if (applicationError) throw applicationError;

  const fileName = safeFileName(document.file_path.split('/').at(-1) || document.title);
  const destinationPath = `${application.organization_id}/${application.facility_id}/${application.id}/vault-${document.id}/${fileName}`;

  const { error: copyError } = await db().storage.from(BUCKET).copy(document.file_path, destinationPath);
  if (copyError) throw copyError;

  const { data, error } = await db().rpc('hc_register_jobseeker_document_attachment', {
    p_document_id: document.id,
    p_application_id: applicationId,
    p_destination_path: destinationPath,
  });

  if (error) {
    await db().storage.from(BUCKET).remove([destinationPath]).catch(() => undefined);
    throw error;
  }
  if (!data || typeof data !== 'object') {
    await db().storage.from(BUCKET).remove([destinationPath]).catch(() => undefined);
    throw new Error('応募書類へ添付できませんでした。');
  }

  return data as AttachedApplicationDocument;
}
