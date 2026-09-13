import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260913150000_hc_jobseeker_document_source_lookup_hardening_v1.sql'
const repositoryPath = 'src/lib/documentVaultRepository.ts'

const migration = fs.readFileSync(migrationPath, 'utf8')
const repository = fs.readFileSync(repositoryPath, 'utf8')

const checks = [
  ['standalone source-document index exists', /create index if not exists hc_application_documents_source_jobseeker_document_idx[\s\S]*source_jobseeker_document_id/i.test(migration)],
  ['source-document index is partial', /where source_jobseeker_document_id is not null/i.test(migration)],
  ['source path extracts canonical UUID segment', /v_source_document\s*:=\s*parts\[3\]::uuid/i.test(migration)],
  ['source object is candidate-owner bound', /parts\[2\]\s*<>\s*v_current_user/i.test(migration)],
  ['linked-copy lookup uses canonical FK', /d\.source_jobseeker_document_id\s*=\s*v_source_document/i.test(migration)],
  ['leading-wildcard application path query removed', !/and\s+d\.file_path\s+like\s*\(\s*'%\/vault-'/i.test(migration)],
  ['application vault copies remain separately recognized', /parts\[4\]\s+like\s+'vault-%'/i.test(migration)],
  ['submitted copy overwrite stays denied after object exists', /storage\.objects[\s\S]*bucket_id\s*=\s*'hc-application-documents'[\s\S]*o\.name\s*=\s*object_name/i.test(migration)],
  ['facility write authorization preserved', /ho_private\.recruitment_can_write\(v_facility\)/i.test(migration)],
  ['tenant write guard preserved', /ho_private\.tenant_writes_allowed\(v_org,\s*v_facility\)/i.test(migration)],
  ['anonymous helper execution revoked', /revoke all on function ho_private\.color_application_document_object_can_write\(text\) from public, anon/i.test(migration)],
  ['authenticated helper execution retained for Storage RLS', /grant execute on function ho_private\.color_application_document_object_can_write\(text\) to authenticated/i.test(migration)],
  ['migration fails closed if index disappears', /Document Vault source-document index is missing/.test(migration)],
  ['migration fails closed if wildcard lookup returns', /Document Vault source-object lookup hardening is incomplete/.test(migration)],
  ['client source path keeps document UUID as segment 3', /jobseekers\/\$\{ownerId\}\/\$\{id\}\/\$\{fileName\}/.test(repository)],
  ['application-copy path carries source document UUID', /vault-\$\{document\.id\}/.test(repository)],
  ['client linkage query uses source_jobseeker_document_id', /\.eq\('source_jobseeker_document_id',\s*document\.id\)/.test(repository)],
  ['migration does not mutate raw HO Verified snapshots', !/hc_verified_workplace_snapshots/i.test(migration)],
  ['migration does not mutate raw HF Verified snapshots', !/hc_verified_finance_snapshots/i.test(migration)],
]

const failed = checks.filter(([, passed]) => !passed)

for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
}

if (failed.length) {
  console.error(`\n${failed.length} Document Vault source lookup contract check(s) failed.`)
  process.exit(1)
}

console.log(`\n${checks.length}/${checks.length} Document Vault source lookup contract checks passed.`)
