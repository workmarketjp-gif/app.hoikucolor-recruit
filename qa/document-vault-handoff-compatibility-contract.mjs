import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20260911121000_hc_document_vault_handoff_compatibility_v2.sql', root), 'utf8');
const repository = readFileSync(new URL('src/lib/documentVaultRepository.ts', root), 'utf8');
const profileUi = readFileSync(new URL('src/components/DocumentVaultPanel.tsx', root), 'utf8');
const applicationUi = readFileSync(new URL('src/components/ApplicationMessages.tsx', root), 'utf8');

const migrationMarkers = [
  "where id = 'hc-application-documents'",
  "array['application/pdf','image/jpeg','image/png']::text[]",
  'hc_jobseeker_documents_mime_type_handoff_check',
  'hc_application_documents_mime_type_handoff_check',
  'hc_application_documents_jobseeker_select_own',
  "application_id::text || '/vault-%/%'",
  'join public.hc_application_documents d',
  'd.file_path = object_name',
];
for (const marker of migrationMarkers) {
  if (!migration.toLowerCase().includes(marker.toLowerCase())) {
    throw new Error(`Document vault handoff migration contract missing: ${marker}`);
  }
}

const repositoryMarkers = [
  "'application/pdf'",
  "'image/jpeg'",
  "'image/png'",
  'listSubmittedApplicationDocuments',
  'createAttachedApplicationDocumentSignedUrl',
  '.createSignedUrl(document.file_path, expiresIn)',
];
for (const marker of repositoryMarkers) {
  if (!repository.includes(marker)) throw new Error(`Document vault handoff repository contract missing: ${marker}`);
}

for (const unsupported of ["'image/gif'", "'image/webp'"]) {
  if (repository.includes(unsupported)) throw new Error(`Unsupported HO handoff MIME remains in repository: ${unsupported}`);
}
if (profileUi.includes('image/gif') || profileUi.includes('image/webp')) {
  throw new Error('Document vault file picker still advertises formats that Hoiku Office cannot receive.');
}
if (!profileUi.includes('application/pdf,image/jpeg,image/png')) {
  throw new Error('Document vault picker is not aligned to the HO handoff MIME set.');
}

const submittedUiMarkers = [
  'この応募へ提出済み',
  'listSubmittedApplicationDocuments',
  'createAttachedApplicationDocumentSignedUrl',
  '元ファイルを削除しても、この応募の記録として保持されます',
];
for (const marker of submittedUiMarkers) {
  if (!applicationUi.includes(marker)) throw new Error(`Submitted application document UI contract missing: ${marker}`);
}

console.log('Hoiku Color document vault -> Hoiku Office handoff compatibility contract passed.');
