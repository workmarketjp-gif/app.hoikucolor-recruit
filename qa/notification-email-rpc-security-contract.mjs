import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sql = fs.readFileSync(path.join(here, '..', 'supabase', 'migrations', '20260911102000_hc_harden_notification_email_rpc_boundaries.sql'), 'utf8')
const names = ['hc_email_outbox_summary','hc_email_worker_status','hc_mark_notification_read','hc_retry_failed_emails']
for (const name of names) {
  if (!sql.includes(`ho_private.${name}_impl`)) throw new Error(`${name}: private implementation missing`)
  const wrapper = new RegExp(`create or replace function public\\.${name}[\\s\\S]*?security invoker`, 'i')
  if (!wrapper.test(sql)) throw new Error(`${name}: public wrapper must be SECURITY INVOKER`)
  const revoke = new RegExp(`revoke all on function public\\.${name}\\(uuid\\) from public,anon`, 'i')
  if (!revoke.test(sql)) throw new Error(`${name}: anon/public execution must be revoked`)
  const grant = new RegExp(`grant execute on function public\\.${name}\\(uuid\\) to authenticated`, 'i')
  if (!grant.test(sql)) throw new Error(`${name}: authenticated wrapper execution must be explicit`)
}
if (!/recruitment_can_read\(p_facility_id\)/.test(sql)) throw new Error('read-side facility permission guard missing')
if (!/recruitment_can_write\(p_facility_id\)/.test(sql)) throw new Error('retry write-side facility permission guard missing')
if (!/recipient_clerk_user_id=ho_private\.current_clerk_user_id\(\)/.test(sql)) throw new Error('notification recipient ownership guard missing')
console.log('notification/email RPC security contract passed')
