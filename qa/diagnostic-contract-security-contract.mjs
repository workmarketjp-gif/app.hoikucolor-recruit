import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260911110000_hc_diagnostic_contract_execution_boundary.sql',
)
const sql = fs.readFileSync(migrationPath, 'utf8')

const checks = [
  ['hiring handoff public/anon/authenticated revoked', /revoke all on function public\.hc_hiring_handoff_integrity_contract\(\)[\s\S]*?from public, anon, authenticated/i],
  ['hiring handoff service role only', /grant execute on function public\.hc_hiring_handoff_integrity_contract\(\)[\s\S]*?to service_role/i],
  ['tenant reference public/anon/authenticated revoked', /revoke all on function public\.hc_tenant_reference_build_contract\(\)[\s\S]*?from public, anon, authenticated/i],
  ['tenant reference service role only', /grant execute on function public\.hc_tenant_reference_build_contract\(\)[\s\S]*?to service_role/i],
]

for (const [label, pattern] of checks) {
  if (!pattern.test(sql)) throw new Error(`diagnostic contract security contract failed: ${label}`)
}

console.log(`diagnostic contract security contract passed (${checks.length} checks)`)
