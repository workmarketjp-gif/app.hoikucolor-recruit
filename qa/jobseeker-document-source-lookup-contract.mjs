import fs from 'node:fs'

const lookupMigrationPath = 'supabase/migrations/20260913150000_hc_jobseeker_document_source_lookup_hardening_v1.sql'
const canonicalMigrationPath = 'supabase/migrations/20260913180000_hc_jobseeker_document_canonical_path_v1.sql'
const deleteMigrationPath = 'supabase/migrations/20260913180500_hc_jobseeker_document_delete_rpc_v1.sql'
const repositoryPath = 'src/lib/documentVaultRepository.ts'

const lookupMigration = fs.readFileSync(lookupMigrationPath, 'utf8')
const canonicalMigration = fs.readFileSync(canonicalMigrationPath, 'utf8')
const deleteMigration = fs.readFileSync(deleteMigrationPath, 'utf8')
const repository = fs.readFileSync(repositoryPath, 'utf8')

const checks = [
  ['standalone source-document index exists', /create index if not exists hc_application_documents_source_jobseeker_document_idx[\s\S]*source_jobseeker_document_id/i.test(lookupMigration)],
  ['source-document index is partial', /where source_jobseeker_document_id is not null/i.test(lookupMigration)],
  ['source path extracts canonical UUID segment', /v_source_document\s*:=\s*parts\[3\]::uuid/i.test(lookupMigration)],
  ['source object is candidate-owner bound', /parts\[2\]\s*<>\s*v_current_user/i.test(lookupMigration)],
  ['linked-copy lookup uses canonical FK', /d\.source_jobseeker_document_id\s*=\s*v_source_document/i.test(lookupMigration)],
  ['leading-wildcard application path query removed', !/and\s+d\.file_path\s+like\s*\(\s*'%\/vault-'/i.test(lookupMigration)],
  ['application vault copies remain separately recognized', /parts\[4\]\s+like\s+'vault-%'/i.test(lookupMigration)],
  ['submitted copy overwrite stays denied after object exists', /storage\.objects[\s\S]*bucket_id\s*=\s*'hc-application-documents'[\s\S]*o\.name\s*=\s*object_name/i.test(lookupMigration)],
  ['facility write authorization preserved', /ho_private\.recruitment_can_write\(v_facility\)/i.test(lookupMigration)],
  ['tenant write guard preserved', /ho_private\.tenant_writes_allowed\(v_org,\s*v_facility\)/i.test(lookupMigration)],
  ['canonical metadata path binds owner and row UUID', /file_path like \('jobseekers\/' \|\| jobseeker_clerk_user_id \|\| '\/' \|\| id::text \|\| '\/%'\)/i.test(canonicalMigration)],
  ['canonical source path requires exactly four segments', /array_length\(string_to_array\(file_path, '\/'\), 1\)[\s\S]*= 4/i.test(canonicalMigration)],
  ['Storage read helper rejects noncanonical source depth', /color_application_document_object_can_read[\s\S]*array_length\(parts,1\),0\) <> 4/i.test(canonicalMigration)],
  ['Storage write helper rejects noncanonical source depth', /color_application_document_object_can_write[\s\S]*array_length\(parts,1\),0\) <> 4/i.test(canonicalMigration)],
  ['Storage read and write helpers both validate source UUID', (canonicalMigration.match(/parts\[3\]::uuid/g) || []).length >= 2],
  ['authenticated helper execution retained for Storage RLS', (canonicalMigration.match(/grant execute on function ho_private\.color_application_document_object_can_(?:read|write)\(text\) to authenticated/gi) || []).length === 2],
  ['delete RPC is owner-bound', /delete from public\.hc_jobseeker_documents d[\s\S]*d\.id = p_document_id[\s\S]*d\.jobseeker_clerk_user_id = v_user_id/i.test(deleteMigration)],
  ['delete RPC returns database-owned file path', /returning d\.file_path into v_file_path/i.test(deleteMigration)],
  ['delete RPC stays SECURITY INVOKER', /security invoker/i.test(deleteMigration)],
  ['anonymous delete RPC execution revoked', /revoke all on function public\.hc_delete_jobseeker_document\(uuid\) from public, anon/i.test(deleteMigration)],
  ['authenticated delete RPC execution granted', /grant execute on function public\.hc_delete_jobseeker_document\(uuid\) to authenticated/i.test(deleteMigration)],
  ['client source path keeps document UUID as segment 3', /jobseekers\/\$\{ownerId\}\/\$\{id\}\/\$\{fileName\}/.test(repository)],
  ['application-copy path carries source document UUID', /vault-\$\{document\.id\}/.test(repository)],
  ['client deletion uses owner-bound RPC', /rpc\('hc_delete_jobseeker_document'[\s\S]*p_document_id:\s*document\.id/i.test(repository)],
  ['client removes Storage object only from RPC-returned path', /storage\.from\(BUCKET\)\.remove\(\[filePath\]\)/.test(repository)],
  ['client deletion no longer trusts document.file_path', !/deleteJobseekerDocument[\s\S]{0,1000}remove\(\[document\.file_path\]\)/.test(repository)],
  ['client deletion no longer pre-queries application-document links', !/deleteJobseekerDocument[\s\S]{0,1000}source_jobseeker_document_id/.test(repository)],
  ['release hardening does not mutate raw HO Verified snapshots', !/hc_verified_workplace_snapshots/i.test(canonicalMigration + deleteMigration)],
  ['release hardening does not mutate raw HF Verified snapshots', !/hc_verified_finance_snapshots/i.test(canonicalMigration + deleteMigration)],
]

const failed = checks.filter(([, passed]) => !passed)

for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
}

if (failed.length) {
  console.error(`\n${failed.length} Document Vault source/delete contract check(s) failed.`)
  process.exit(1)
}

console.log(`\n${checks.length}/${checks.length} Document Vault source/delete contract checks passed.`)
