import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260911095000_hc_harden_market_publish_and_job_upsert.sql',
)
const sql = fs.readFileSync(migrationPath, 'utf8')

const checks = [
  ['market publish private implementation', /ho_private\.hc_publish_from_market_job_impl/],
  ['manual job private implementation', /ho_private\.hc_upsert_job_impl/],
  ['market publish public wrapper is invoker', /create or replace function public\.hc_publish_from_market_job[\s\S]*?security invoker/i],
  ['job upsert public wrapper is invoker', /create or replace function public\.hc_upsert_job[\s\S]*?security invoker/i],
  ['market publish anon revoked', /revoke all on function public\.hc_publish_from_market_job\(uuid,uuid\) from public, anon/i],
  ['job upsert anon revoked', /revoke all on function public\.hc_upsert_job\(uuid,jsonb\) from public, anon/i],
  ['market publish authenticated only', /grant execute on function public\.hc_publish_from_market_job\(uuid,uuid\) to authenticated/i],
  ['job upsert authenticated only', /grant execute on function public\.hc_upsert_job\(uuid,jsonb\) to authenticated/i],
  ['market publish keeps facility permission guard', /hc_publish_from_market_job_impl[\s\S]*?recruitment_can_write\(p_facility_id\)/i],
  ['job upsert keeps facility permission guard', /hc_upsert_job_impl[\s\S]*?recruitment_can_write\(p_facility_id\)/i],
  ['synced jobs remain read-only', /SYNCED_JOB_READ_ONLY_USE_PUBLICATION_SWITCH/],
]

for (const [label, pattern] of checks) {
  if (!pattern.test(sql)) throw new Error(`job RPC security contract failed: ${label}`)
}

console.log(`job RPC security contract passed (${checks.length} checks)`)
