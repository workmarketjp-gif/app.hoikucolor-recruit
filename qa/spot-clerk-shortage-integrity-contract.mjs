import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8')

const clerk = read('20260911112000_hc_spot_clerk_identity_boundary.sql')
const compat = read('20260911112500_ho_shift_shortage_class_compat.sql')
const mapping = read('20260911113000_hc_spot_shift_age_group_mapping.sql')
const resolution = read('20260911113500_hc_spot_shortage_resolution_on_confirm.sql')
const boundary = read('20260911114000_hc_spot_private_impl_execution_boundary.sql')

const checks = [
  ['canonical confirmation uses Clerk subject helper', /v_actor text := ho_private\.current_clerk_user_id\(\)/i, clerk],
  ['canonical confirmation does not gate on auth uid', /if\s+auth\.uid\(\)/i, clerk, true],
  ['canonical break is reread from HO spot source', /select d\.break_minutes[\s\S]*?ho_spot_job_drafts/i, clerk],
  ['free-form class does not overwrite legacy age enum', /age_group_or_class[\s\S]*?in \('0','1','2','3','4','5'\)/i, compat],
  ['named class clears incompatible legacy age', /else\s+new\.age_group := null/i, compat],
  ['spot shift maps class label to numeric age group', /\^\[0-5\]歳/i, mapping],
  ['spot confirmation decrements shortage immediately', /shortage_count = greatest\(coalesce\(ss\.shortage_count, 0\) - 1, 0\)/i, resolution],
  ['spot confirmation resolves filled shortage', /status = case when coalesce\(ss\.shortage_count, 0\) <= 1 then 'resolved'/i, resolution],
  ['private implementation is revoked from app roles', /revoke all on function ho_private\.hc_confirm_spot_assignment_impl\(uuid, uuid, integer\)[\s\S]*?from public, anon, authenticated/i, boundary],
]

for (const [label, pattern, source, invert = false] of checks) {
  const matched = pattern.test(source)
  if (invert ? matched : !matched) throw new Error(`spot Clerk/shortage integrity contract failed: ${label}`)
}

console.log(`spot Clerk/shortage integrity contract passed (${checks.length} checks)`)
