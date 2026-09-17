import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const repository = readFileSync(new URL('src/lib/documentVaultRepository.ts', root), 'utf8');
const vaultMigration = readFileSync(new URL('supabase/migrations/20260911010500_hc_jobseeker_reusable_document_vault.sql', root), 'utf8');
const storageHardeningMigration = readFileSync(new URL('supabase/migrations/20260913030000_hc_jobseeker_document_storage_policy_acl_v1.sql', root), 'utf8');
const privilegeMigration = readFileSync(new URL('supabase/migrations/20260913030500_hc_jobseeker_document_table_privilege_hardening_v1.sql', root), 'utf8');
const attachmentIntegrityMigration = readFileSync(new URL('supabase/migrations/20260913190000_hc_jobseeker_attachment_object_integrity_v1.sql', root), 'utf8');

const repositoryMarkers = [
  "const BUCKET = 'hc-application-documents'",
  'const MAX_FILE_SIZE = 10 * 1024 * 1024',
  "'application/pdf'",
  "'image/jpeg'",
  "'image/png'",
  'upsert: false',
  'createSignedUrl(',
  'ensureApplicationCopy(document.file_path, destinationPath)',
  'storageObjectExists(destinationPath)',
  '`jobseekers/${ownerId}/${id}/${fileName}`',
  '`${application.organization_id}/${application.facility_id}/${application.id}/vault-${document.id}/${fileName}`',
  "rpc('hc_register_jobseeker_document_attachment'",
];
for (const marker of repositoryMarkers) {
  if (!repository.includes(marker)) throw new Error(`Document vault storage contract missing: ${marker}`);
}

if (repository.includes('getPublicUrl(')) throw new Error('Document vault must never use a public Storage URL.');
if (repository.includes('upsert: true')) throw new Error('Document vault must not allow overwrite-on-upload.');

const vaultMarkers = [
  'alter table public.hc_jobseeker_documents enable row level security',
  "jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub','')",
];
for (const marker of vaultMarkers) {
  if (!vaultMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document vault RLS contract missing: ${marker}`);
}

const storageHardeningMarkers = [
  "parts[1] = 'jobseekers'",
  'parts[2] = v_current_user',
  "parts[4] like 'vault-%'",
  "d.file_path = object_name",
  "o.bucket_id = 'hc-application-documents'",
  'o.name = object_name',
  'revoke all on function ho_private.color_application_document_object_can_read(text) from public, anon',
  'revoke all on function ho_private.color_application_document_object_can_write(text) from public, anon',
  'grant execute on function ho_private.color_application_document_object_can_read(text) to authenticated',
  'grant execute on function ho_private.color_application_document_object_can_write(text) to authenticated',
];
for (const marker of storageHardeningMarkers) {
  if (!storageHardeningMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document vault Storage hardening contract missing: ${marker}`);
}

const hardeningMarkers = [
  'revoke truncate, references, trigger on table public.hc_jobseeker_documents from authenticated',
  'revoke truncate, references, trigger on table public.hc_application_documents from authenticated',
];
for (const marker of hardeningMarkers) {
  if (!privilegeMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document metadata privilege hardening missing: ${marker}`);
}

const integrityChecks = [
  ['pre-registration copy read is limited to exactly five path segments', /array_length\(parts,1\),0\) = 5/i.test(attachmentIntegrityMigration)],
  ['pre-registration path parses source document UUID from vault segment', /substring\(parts\[4\] from 7\)::uuid/i.test(attachmentIntegrityMigration)],
  ['pre-registration path requires source filename', /regexp_replace\(d\.file_path, '\^\.\*\/', ''\) = parts\[5\]/i.test(attachmentIntegrityMigration)],
  ['candidate attachment policy requires source Storage object', /join storage\.objects src[\s\S]*src\.name = d\.file_path/i.test(attachmentIntegrityMigration)],
  ['candidate attachment policy requires destination Storage object', /join storage\.objects dst[\s\S]*dst\.name = hc_application_documents\.file_path/i.test(attachmentIntegrityMigration)],
  ['candidate attachment policy compares source and destination byte size', /\(src\.metadata->>'size'\)::bigint = \(dst\.metadata->>'size'\)::bigint/i.test(attachmentIntegrityMigration)],
  ['candidate attachment policy binds row path to application and source document', /hc_application_documents\.file_path = \([\s\S]*'\/vault-' \|\| d\.id::text/i.test(attachmentIntegrityMigration)],
  ['candidate attachment path depth is exactly five', /array_length\(string_to_array\(file_path, '\/'\), 1\), 0\) = 5/i.test(attachmentIntegrityMigration)],
  ['registration RPC binds caller to source document owner', /where id = p_document_id[\s\S]*jobseeker_clerk_user_id = v_user_id/i.test(attachmentIntegrityMigration)],
  ['registration RPC binds caller to application owner', /where id = p_application_id[\s\S]*jobseeker_clerk_user_id = v_user_id/i.test(attachmentIntegrityMigration)],
  ['registration RPC reconstructs deterministic destination path', /v_expected_path :=[\s\S]*'\/vault-'[\s\S]*v_document\.id::text/i.test(attachmentIntegrityMigration)],
  ['registration RPC rejects noncanonical destination path', /p_destination_path is distinct from v_expected_path/i.test(attachmentIntegrityMigration)],
  ['duplicate registration uses immutable do-nothing semantics', /on conflict \(application_id, source_jobseeker_document_id\)[\s\S]*do nothing/i.test(attachmentIntegrityMigration)],
  ['duplicate registration never updates submitted row timestamp', !/do update set updated_at/i.test(attachmentIntegrityMigration)],
  ['anonymous registration RPC execution is revoked', /revoke all on function public\.hc_register_jobseeker_document_attachment\(uuid, uuid, text\)[\s\S]*from public, anon/i.test(attachmentIntegrityMigration)],
  ['authenticated registration RPC execution is granted', /grant execute on function public\.hc_register_jobseeker_document_attachment\(uuid, uuid, text\)[\s\S]*to authenticated, service_role/i.test(attachmentIntegrityMigration)],
  ['attachment hardening does not touch raw HO Verified snapshots', !/hc_verified_workplace_snapshots/i.test(attachmentIntegrityMigration)],
  ['attachment hardening does not touch raw HF Verified snapshots', !/hc_verified_finance_snapshots/i.test(attachmentIntegrityMigration)],
];

for (const [name, passed] of integrityChecks) {
  if (!passed) throw new Error(`Document vault attachment integrity contract missing: ${name}`);
}

console.log('Hoiku Color jobseeker Document Vault Storage security contract passed.');
