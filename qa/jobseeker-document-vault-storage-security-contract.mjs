import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const repository = readFileSync(new URL('src/lib/documentVaultRepository.ts', root), 'utf8');
const vaultMigration = readFileSync(new URL('supabase/migrations/20260911010500_hc_jobseeker_reusable_document_vault.sql', root), 'utf8');
const aclMigration = readFileSync(new URL('supabase/migrations/20260913030000_hc_jobseeker_document_storage_policy_acl_v1.sql', root), 'utf8');
const privilegeMigration = readFileSync(new URL('supabase/migrations/20260913030500_hc_jobseeker_document_table_privilege_hardening_v1.sql', root), 'utf8');

const repositoryMarkers = [
  "const BUCKET = 'hc-application-documents'",
  'const MAX_FILE_SIZE = 10 * 1024 * 1024',
  "'application/pdf'",
  "'image/jpeg'",
  "'image/png'",
  'upsert: false',
  'createSignedUrl(',
  '.copy(document.file_path, destinationPath)',
  '`jobseekers/${ownerId}/${id}/${fileName}`',
  '`$\{application.organization_id\}/$\{application.facility_id\}/$\{application.id\}/vault-$\{document.id\}/$\{fileName\}`'.replaceAll('\\$', '$'),
];
for (const marker of repositoryMarkers) {
  if (!repository.includes(marker)) throw new Error(`Document vault storage contract missing: ${marker}`);
}

if (repository.includes('getPublicUrl(')) throw new Error('Document vault must never use a public Storage URL.');
if (repository.includes('upsert: true')) throw new Error('Document vault must not allow overwrite-on-upload.');

const vaultMarkers = [
  'alter table public.hc_jobseeker_documents enable row level security',
  "jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub','')",
  "parts[1] = 'jobseekers'",
  "parts[2] = v_current_user",
  "parts[4] like 'vault-%'",
  "bucket_id = 'hc-application-documents'",
];
for (const marker of vaultMarkers) {
  if (!vaultMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document vault RLS contract missing: ${marker}`);
}

const aclMarkers = [
  'revoke all on function ho_private.color_application_document_object_can_read(text) from public, anon',
  'revoke all on function ho_private.color_application_document_object_can_write(text) from public, anon',
  'grant execute on function ho_private.color_application_document_object_can_read(text) to authenticated',
  'grant execute on function ho_private.color_application_document_object_can_write(text) to authenticated',
];
for (const marker of aclMarkers) {
  if (!aclMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document vault Storage predicate ACL missing: ${marker}`);
}

const hardeningMarkers = [
  'revoke truncate, references, trigger on table public.hc_jobseeker_documents from authenticated',
  'revoke truncate, references, trigger on table public.hc_application_documents from authenticated',
];
for (const marker of hardeningMarkers) {
  if (!privilegeMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document metadata privilege hardening missing: ${marker}`);
}

console.log('Hoiku Color jobseeker Document Vault Storage security contract passed.');
