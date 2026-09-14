import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const repository = readFileSync(new URL('src/lib/documentVaultRepository.ts', root), 'utf8');
const migration = readFileSync(new URL('supabase/migrations/20260914102000_hc_jobseeker_document_two_phase_delete_v1.sql', root), 'utf8');
const orphanMigration = readFileSync(new URL('supabase/migrations/20260914110000_hc_jobseeker_document_orphan_reconciliation_v1.sql', root), 'utf8');
const concurrencyMigration = readFileSync(new URL('supabase/migrations/20260914120000_hc_jobseeker_document_concurrency_lock_v1.sql', root), 'utf8');

const repositoryMarkers = [
  'storageObjectExists(destinationPath)',
  'ensureApplicationCopy(document.file_path, destinationPath)',
  "rpc('hc_prepare_jobseeker_document_delete'",
  "rpc('hc_finalize_jobseeker_document_delete'",
  "rpc('hc_register_jobseeker_document_source'",
  "rpc('hc_jobseeker_list_stale_document_orphans'",
  'reconcileStaleJobseekerDocumentOrphans',
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
if (/uploadJobseekerDocument[\s\S]*\.from\('hc_jobseeker_documents'\)[\s\S]*\.insert\(/i.test(repository)) {
  throw new Error('Vault upload metadata must be registered through the Storage-existence-checking RPC.');
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
if (!/startOrphanReconciliation\(\)[\s\S]*from\('hc_jobseeker_documents'\)/i.test(repository)) {
  throw new Error('Vault list must schedule stale-orphan reconciliation without replacing canonical reads.');
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

const orphanMarkers = [
  'create or replace function public.hc_register_jobseeker_document_source',
  "raise exception 'storage object missing'",
  'create or replace function public.hc_register_jobseeker_document_attachment',
  'create or replace function public.hc_jobseeker_list_stale_document_orphans()',
  "coalesce(o.updated_at, o.created_at) < now() - interval '1 hour'",
  "o.name like ('jobseekers/' || v_user_id || '/%')",
  "a.jobseeker_clerk_user_id = v_user_id",
  'not exists (',
  'limit 50',
  'revoke all on function public.hc_jobseeker_list_stale_document_orphans() from public, anon',
];
for (const marker of orphanMarkers) {
  if (!orphanMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document Vault orphan reconciliation missing: ${marker}`);
}

if (orphanMigration.includes('hc_verified_workplace_snapshots') || orphanMigration.includes('hc_verified_finance_snapshots')) {
  throw new Error('Document Vault orphan reconciliation must not change HO/HF Verified snapshots.');
}
if (!/storage\.objects[\s\S]*o\.name = p_file_path[\s\S]*insert into public\.hc_jobseeker_documents/i.test(orphanMigration)) {
  throw new Error('Source metadata registration must prove the Storage object exists before insert.');
}
if (!/storage\.objects[\s\S]*o\.name = p_destination_path[\s\S]*insert into public\.hc_application_documents/i.test(orphanMigration)) {
  throw new Error('Application metadata registration must prove the immutable copy exists before insert.');
}

const concurrencyMarkers = [
  'create or replace function ho_private.color_document_object_xact_lock',
  'pg_advisory_xact_lock',
  "hashtextextended('hc-color-document:' || p_object_name, 0)",
  'revoke all on function ho_private.color_document_object_xact_lock(text) from public, anon, authenticated',
  'perform ho_private.color_document_object_xact_lock(p_file_path)',
  'perform ho_private.color_document_object_xact_lock(p_destination_path)',
  'create or replace function ho_private.color_application_document_object_can_delete',
  'perform ho_private.color_document_object_xact_lock(object_name)',
];
for (const marker of concurrencyMarkers) {
  if (!concurrencyMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Document Vault concurrency guard missing: ${marker}`);
}
if (!/o\.name = p_file_path\s+for update/i.test(concurrencyMigration)) {
  throw new Error('Source registration must hold the Storage row lock until canonical metadata commits.');
}
if (!/o\.name = p_destination_path\s+for update/i.test(concurrencyMigration)) {
  throw new Error('Application attachment registration must hold the Storage row lock until immutable metadata commits.');
}
if (!/color_application_document_object_can_delete[\s\S]*returns boolean[\s\S]*language plpgsql\s+volatile/i.test(concurrencyMigration)) {
  throw new Error('Candidate Storage delete predicate must remain volatile because it takes a transaction lock.');
}
if (concurrencyMigration.includes('hc_verified_workplace_snapshots') || concurrencyMigration.includes('hc_verified_finance_snapshots')) {
  throw new Error('Document Vault concurrency migration must not change HO/HF Verified snapshots.');
}

console.log('Hoiku Color Document Vault failure-recovery contract passed.');
