import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sql = fs.readFileSync(path.join(here, '..', 'supabase', 'migrations', '20260911101000_hc_harden_document_handoff_context.sql'), 'utf8')

const checks = [
  ['private implementation exists', /ho_private\.hc_document_handoff_context_impl/],
  ['public wrapper uses security invoker', /create or replace function public\.hc_document_handoff_context[\s\S]*?security invoker/i],
  ['public anon execution revoked', /revoke all on function public\.hc_document_handoff_context\(uuid\) from public, anon/i],
  ['public authenticated execution granted', /grant execute on function public\.hc_document_handoff_context\(uuid\) to authenticated/i],
  ['facility recruitment permission enforced', /recruitment_can_write\(d\.facility_id\)/],
  ['tenant write policy enforced', /tenant_writes_allowed\(d\.organization_id, d\.facility_id\)/],
  ['application tenant match enforced', /organization_id = d\.organization_id and facility_id = d\.facility_id/],
  ['hire required before handoff', /a\.hired_staff_id is null/],
  ['staff tenant match enforced', /id = a\.hired_staff_id and organization_id = d\.organization_id and facility_id = d\.facility_id/],
]

for (const [label, pattern] of checks) {
  if (!pattern.test(sql)) throw new Error(`document handoff security contract failed: ${label}`)
}
console.log(`document handoff security contract passed (${checks.length} checks)`)
