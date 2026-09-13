import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const repository = readFileSync(new URL('src/lib/documentVaultRepository.ts', root), 'utf8');
const migration = readFileSync(new URL('supabase/migrations/20260914102000_hc_jobseeker_document_two_phase_delete_v1.sql', root), 'utf8');

const repositoryMarkers = [
  'storageObjectExists(destinationPath)',
  'ensureApplicationCopy(document.file_path, destinationPath)',
  "rpc('hc_prepare_jobseeker_document_delete'",
  "rpc('hc_finalize_jobseeker_document_delete'",
  'findAttachedDocument(applicationId, document.id)',
  'cleanupUnregisteredObject(destinationPath)',
  'Never delete the destination until we can prove no immutable metadata exists',
];
for (const marker of repositoryMarkers) {
  if (!repository.includes(marker)) throw new Error(`Document Vault failure recovery missing: ${marker}`);
}

if (repository.includes("rpc('hc_delete_jobseeker_document'")) {
  throw new Error('Candidate UI must not use metadata-first Vault deletion.');
}
if (!/ensureApplicationCopy[\s\S]*storageObjectExists\(destinationPath\)[\s\S]*const retry = await copy\(\)/i.test(repository)) {
  throw new Error('Ambiguous application copy must probe the deterministic object before retrying.');
}
if (!/rpc\('hc_register_jobseeker_document_attachment'[\s\S]*findAttachedDocument\(applicationId, document\.id\)[\s\S]*cleanupUnregisteredObject\(destinationPath\)/i.test(repository)) {
  throw new Error('Attachment registration failure must re-read immutable metadata before cleanup.');
}
if (!/removeError[\s\S]*hc_finalize_jobseeker_document_delete[\s\S]*finalized === true/i.test(repository)) {
  throw new Error('Vault delete must finalize after an ambiguous Storage response.');
}

const migrationMarkers = [
  'create table if not exists ho_private.hc_jobseeker_document_delete_intents',
  'revoke all on table ho_private.hc_jobseeker_document_delete_intents from public, anon, authenticated',
  'create or replace function public.hc_prepare_jobseeker_document_delete',
  'create or replace function public.hc_finalize_jobseeker_document_delete',
  'storage object still exists',
  'i.document_id = v_source_document',
  'i.jobseeker_clerk_user_id = v_current_user',
  'revoke all on function public.hc_prepare_jobseeker_document_delete(uuid) from public, anon',
  'revoke all on function public.hc_finalize_jobseeker_document_delete(uuid, text) from public, anon',
];
for (const marker of migrationMarkers) {
  if (!migration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document Vault two-phase delete missing: ${marker}`);
}

if (migration.includes('hc_verified_workplace_snapshots') || migration.includes('hc_verified_finance_snapshots')) {
  throw new Error('Document Vault recovery migration must not change HO/HF Verified snapshots.');
}

console.log('Hoiku Color Document Vault failure-recovery contract passed.');
