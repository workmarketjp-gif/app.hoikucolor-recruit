import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { consumePendingDocumentPickerCache } from './documentPickerCache';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CandidateDocumentAsset = {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
};

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

export type ApplicationDocumentExpectation = {
  id: string;
  application_id: string;
  source_jobseeker_document_id_snapshot: string;
  document_type: JobseekerDocumentType;
  title: string;
  destination_file_path: string;
  captured_at: string;
};

export const DOCUMENT_VAULT_BUCKET = 'hc-application-documents';
export const DOCUMENT_VAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const DOCUMENT_VAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

const allowedMimeTypes = new Set<string>(DOCUMENT_VAULT_ALLOWED_MIME_TYPES);
const documentColumns =
  'id,jobseeker_clerk_user_id,document_type,title,file_path,mime_type,file_size,is_default,uploaded_at,created_at,updated_at';
const applicationDocumentColumns =
  'id,organization_id,facility_id,application_id,document_type,title,file_path,mime_type,file_size,source_jobseeker_document_id,uploaded_by_clerk_user_id,uploaded_at';
const applicationDocumentExpectationColumns =
  'id,application_id,source_jobseeker_document_id_snapshot,document_type,title,destination_file_path,captured_at';

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

function mimeFromAsset(asset: CandidateDocumentAsset): string | null {
  if (asset.mimeType && allowedMimeTypes.has(asset.mimeType)) return asset.mimeType;
  const lower = asset.name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  return null;
}

function bytesMatchMime(bytes: Uint8Array, mime: string) {
  if (mime === 'application/pdf') {
    return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  }
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === 'image/png') {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  return false;
}

function assertHttpsUrl(input: string) {
  const parsed = new URL(input);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('安全な書類URLを確認できませんでした。');
  }
  return parsed.toString();
}

async function readAndValidatePickedAsset(asset: CandidateDocumentAsset, ownerId: string) {
  let validated: { buffer: ArrayBuffer; mimeType: string; size: number } | null = null;
  let validationError: unknown = null;

  try {
    const mimeType = mimeFromAsset(asset);
    if (!mimeType) throw new Error('PDF、JPEG、PNGのみ保存できます。');
    if (asset.size != null && (asset.size <= 0 || asset.size > DOCUMENT_VAULT_MAX_FILE_SIZE)) {
      throw new Error('書類は10MB以下のファイルを選択してください。');
    }

    const file = new File(asset.uri);
    const buffer = await file.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > DOCUMENT_VAULT_MAX_FILE_SIZE) {
      throw new Error('書類は10MB以下のファイルを選択してください。');
    }
    const bytes = new Uint8Array(buffer);
    if (!bytesMatchMime(bytes, mimeType)) {
      throw new Error('ファイル内容と形式が一致しません。PDF、JPEG、PNGを選択してください。');
    }
    validated = { buffer, mimeType, size: buffer.byteLength };
  } catch (error) {
    validationError = error;
  }

  try {
    await consumePendingDocumentPickerCache(ownerId, asset.uri);
  } catch (cleanupError) {
    throw cleanupError;
  }

  if (validationError) throw validationError;
  if (!validated) throw new Error('応募書類を読み込めませんでした。');
  return validated;
}

async function storageObjectExists(client: SupabaseClient, path: string) {
  const { data, error } = await client.storage.from(DOCUMENT_VAULT_BUCKET).createSignedUrl(path, 30);
  return !error && Boolean(data?.signedUrl);
}

async function ensureUploadedSourceObject(client: SupabaseClient, path: string, buffer: ArrayBuffer, mimeType: string) {
  const bucket = client.storage.from(DOCUMENT_VAULT_BUCKET);
  const upload = () => bucket.upload(path, buffer, { upsert: false, contentType: mimeType });
  const first = await upload();
  if (!first.error) return;
  if (await storageObjectExists(client, path)) return;
  const retry = await upload();
  if (!retry.error) return;
  if (await storageObjectExists(client, path)) return;
  throw retry.error;
}

async function ensureApplicationCopy(client: SupabaseClient, sourcePath: string, destinationPath: string) {
  const bucket = client.storage.from(DOCUMENT_VAULT_BUCKET);
  const copy = () => bucket.copy(sourcePath, destinationPath);
  const first = await copy();
  if (!first.error) return;
  if (await storageObjectExists(client, destinationPath)) return;
  const retry = await copy();
  if (!retry.error) return;
  if (await storageObjectExists(client, destinationPath)) return;
  throw retry.error;
}

async function findJobseekerDocumentById(client: SupabaseClient, documentId: string): Promise<JobseekerDocument | null> {
  const { data, error } = await client.from('hc_jobseeker_documents').select(documentColumns).eq('id', documentId).maybeSingle();
  if (error) throw error;
  return (data as JobseekerDocument | null) ?? null;
}

async function findAttachedDocument(client: SupabaseClient, applicationId: string, documentId: string): Promise<AttachedApplicationDocument | null> {
  const { data, error } = await client.from('hc_application_documents').select(applicationDocumentColumns).eq('application_id', applicationId).eq('source_jobseeker_document_id', documentId).maybeSingle();
  if (error) throw error;
  return (data as AttachedApplicationDocument | null) ?? null;
}

async function cleanupUnregisteredObject(client: SupabaseClient, path: string) {
  const { error } = await client.storage.from(DOCUMENT_VAULT_BUCKET).remove([path]);
  if (error) throw error;
}

export async function reconcileStaleJobseekerDocumentOrphans(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('hc_jobseeker_list_stale_document_orphans');
  if (error) throw error;
  const paths = (Array.isArray(data) ? data : []).map((row) => (row && typeof row === 'object' && 'file_path' in row ? row.file_path : null)).filter((value): value is string => typeof value === 'string' && value.length > 0);
  let removed = 0;
  for (const path of paths) {
    const { error: removeError } = await client.storage.from(DOCUMENT_VAULT_BUCKET).remove([path]);
    if (!removeError) removed += 1;
  }
  return removed;
}

const orphanReconciliationClients = new WeakSet<object>();
function startOrphanReconciliation(client: SupabaseClient) {
  const identity = client as unknown as object;
  if (orphanReconciliationClients.has(identity)) return;
  orphanReconciliationClients.add(identity);
  void reconcileStaleJobseekerDocumentOrphans(client).catch(() => 0);
}

export async function listJobseekerDocuments(client: SupabaseClient): Promise<JobseekerDocument[]> {
  startOrphanReconciliation(client);
  const { data, error } = await client.from('hc_jobseeker_documents').select(documentColumns).order('document_type', { ascending: true }).order('is_default', { ascending: false }).order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as JobseekerDocument[];
}

export async function uploadPickedJobseekerDocument(client: SupabaseClient, clerkUserId: string, documentType: JobseekerDocumentType, asset: CandidateDocumentAsset, options: { title?: string; makeDefault?: boolean; canStartUpload?: () => boolean } = {}): Promise<JobseekerDocument> {
  const ownerId = clerkUserId.trim();
  if (!ownerId) throw new Error('ログインユーザーを確認できませんでした。');
  const { buffer, mimeType, size } = await readAndValidatePickedAsset(asset, ownerId);
  if (options.canStartUpload && !options.canStartUpload()) throw new Error('DOCUMENT_UPLOAD_QUARANTINED');
  const id = Crypto.randomUUID();
  const fileName = safeFileName(asset.name);
  const path = `jobseekers/${ownerId}/${id}/${fileName}`;
  const title = (options.title?.trim() || asset.name || fileName).slice(0, 200);
  await ensureUploadedSourceObject(client, path, buffer, mimeType);
  const { data, error } = await client.rpc('hc_register_jobseeker_document_source', { p_document_id: id, p_document_type: documentType, p_title: title, p_file_path: path, p_mime_type: mimeType, p_file_size: size });
  let saved = data as JobseekerDocument | null;
  if (error || !saved) {
    try { saved = await findJobseekerDocumentById(client, id); } catch { throw new Error('書類保存の結果を確認できませんでした。画面を再読み込みして確認してください。'); }
    if (!saved) {
      try { await cleanupUnregisteredObject(client, path); } catch { throw new Error('書類の保存に失敗し、未登録ファイルの後処理にも失敗しました。もう一度お試しください。'); }
      if (error) throw error;
      throw new Error('書類を保存できませんでした。');
    }
  }
  if (saved.file_path !== path || saved.jobseeker_clerk_user_id !== ownerId) throw new Error('保存済み書類の整合性を確認できませんでした。');
  if (options.makeDefault) return setDefaultJobseekerDocument(client, saved.id);
  return saved;
}

export async function setDefaultJobseekerDocument(client: SupabaseClient, documentId: string): Promise<JobseekerDocument> {
  const { data, error } = await client.rpc('hc_set_jobseeker_document_default', { p_document_id: documentId });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('既定書類を更新できませんでした。');
  return data as JobseekerDocument;
}

export async function createJobseekerDocumentSignedUrl(client: SupabaseClient, document: JobseekerDocument, expiresIn = 300) {
  const { data, error } = await client.storage.from(DOCUMENT_VAULT_BUCKET).createSignedUrl(document.file_path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('書類を開くURLを作成できませんでした。');
  return assertHttpsUrl(data.signedUrl);
}

export async function deleteJobseekerDocument(client: SupabaseClient, document: JobseekerDocument) {
  const { data: filePath, error: prepareError } = await client.rpc('hc_prepare_jobseeker_document_delete', { p_document_id: document.id });
  if (prepareError) throw prepareError;
  if (typeof filePath !== 'string' || !filePath || filePath !== document.file_path) throw new Error('削除対象の書類を確認できませんでした。');
  const { error: removeError } = await client.storage.from(DOCUMENT_VAULT_BUCKET).remove([filePath]);
  const { data: finalized, error: finalizeError } = await client.rpc('hc_finalize_jobseeker_document_delete', { p_document_id: document.id, p_file_path: filePath });
  if (!finalizeError && finalized === true) return;
  if (removeError) throw new Error('元ファイルの削除を確認できませんでした。書類は一覧に残るため、再度削除できます。');
  if (finalizeError) throw finalizeError;
  throw new Error('書類の削除を完了できませんでした。');
}

export async function listApplicationDocumentExpectations(client: SupabaseClient, applicationId: string): Promise<ApplicationDocumentExpectation[]> {
  const { data, error } = await client.from('hc_application_document_expectations').select(applicationDocumentExpectationColumns).eq('application_id', applicationId).order('captured_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ApplicationDocumentExpectation[];
}

export async function listSubmittedApplicationDocuments(client: SupabaseClient, applicationId: string): Promise<AttachedApplicationDocument[]> {
  const { data, error } = await client.from('hc_application_documents').select(applicationDocumentColumns).eq('application_id', applicationId).order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AttachedApplicationDocument[];
}

export async function createAttachedApplicationDocumentSignedUrl(client: SupabaseClient, document: AttachedApplicationDocument, expiresIn = 300) {
  const { data, error } = await client.storage.from(DOCUMENT_VAULT_BUCKET).createSignedUrl(document.file_path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('提出済み書類を開くURLを作成できませんでした。');
  return assertHttpsUrl(data.signedUrl);
}

export async function attachJobseekerDocumentToApplication(client: SupabaseClient, document: JobseekerDocument, applicationId: string): Promise<AttachedApplicationDocument> {
  const existing = await findAttachedDocument(client, applicationId, document.id);
  if (existing) return existing;
  const { data: application, error: applicationError } = await client.from('hc_applications').select('id,organization_id,facility_id').eq('id', applicationId).single();
  if (applicationError) throw applicationError;
  const pathParts = document.file_path.split('/');
  const fileName = safeFileName(pathParts[pathParts.length - 1] || document.title);
  const destinationPath = `${application.organization_id}/${application.facility_id}/${application.id}/vault-${document.id}/${fileName}`;
  await ensureApplicationCopy(client, document.file_path, destinationPath);
  const { data, error } = await client.rpc('hc_register_jobseeker_document_attachment', { p_document_id: document.id, p_application_id: applicationId, p_destination_path: destinationPath });
  if (!error && data && typeof data === 'object') return data as AttachedApplicationDocument;
  let recovered: AttachedApplicationDocument | null;
  try { recovered = await findAttachedDocument(client, applicationId, document.id); } catch { throw new Error('応募書類の登録結果を確認できませんでした。応募管理を再読み込みして確認してください。'); }
  if (recovered) {
    if (recovered.file_path !== destinationPath) throw new Error('提出済み書類の保存先が一致しません。');
    return recovered;
  }
  try { await cleanupUnregisteredObject(client, destinationPath); } catch { throw new Error('応募書類への添付に失敗し、未登録コピーの後処理にも失敗しました。もう一度お試しください。'); }
  if (error) throw error;
  throw new Error('応募書類へ添付できませんでした。');
}
