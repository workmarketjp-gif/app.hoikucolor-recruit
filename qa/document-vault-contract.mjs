import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20260911010500_hc_jobseeker_reusable_document_vault.sql', root), 'utf8');
const repository = readFileSync(new URL('src/lib/documentVaultRepository.ts', root), 'utf8');
const profileUi = readFileSync(new URL('src/components/DocumentVaultPanel.tsx', root), 'utf8');
const applicationUi = readFileSync(new URL('src/components/ApplicationMessages.tsx', root), 'utf8');

const migrationMarkers = [
  'create table if not exists public.hc_jobseeker_documents',
  "jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub','')",
  'security invoker',
  'hc_register_jobseeker_document_attachment',
  'source_jobseeker_document_id',
  "revoke all on function public.hc_register_jobseeker_document_attachment(uuid,uuid,text) from public, anon",
  "grant execute on function public.hc_register_jobseeker_document_attachment(uuid,uuid,text) to authenticated",
  "parts[1] = 'jobseekers'",
  "parts[4] like 'vault-%'",
];
for (const marker of migrationMarkers) {
  if (!migration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document vault DB contract missing: ${marker}`);
}

const repositoryMarkers = [
  "const BUCKET = 'hc-application-documents'",
  'upsert: false',
  '.createSignedUrl(',
  '.copy(document.file_path, destinationPath)',
  "rpc('hc_register_jobseeker_document_attachment'",
  "source_jobseeker_document_id",
];
for (const marker of repositoryMarkers) {
  if (!repository.includes(marker)) throw new Error(`Document vault repository contract missing: ${marker}`);
}

const uiMarkers = [
  '応募書類',
  '応募時に使う',
  'すでに応募先へ提出済みのコピーは削除されません',
];
for (const marker of uiMarkers) {
  if (!profileUi.includes(marker)) throw new Error(`Document vault profile UI contract missing: ${marker}`);
}
if (!applicationUi.includes('attachJobseekerDocumentToApplication')) throw new Error('Saved documents are not attachable from application management.');
if (!applicationUi.includes('この応募に提出')) throw new Error('Application document submission action is missing.');

const forbidden = [
  'getPublicUrl(',
  'service_role',
  'upsert: true',
];
for (const marker of forbidden) {
  if (repository.includes(marker) || profileUi.includes(marker) || applicationUi.includes(marker)) {
    throw new Error(`Document vault client must not contain: ${marker}`);
  }
}

console.log('Hoiku Color reusable document vault contract passed.');
