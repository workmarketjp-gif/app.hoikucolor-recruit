import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260911220539_hc_jobseeker_notification_center_v1.sql'), 'utf8')
const repo = fs.readFileSync(path.join(root, 'src', 'lib', 'notificationRepository.ts'), 'utf8')
const component = fs.readFileSync(path.join(root, 'src', 'components', 'NotificationCenter.tsx'), 'utf8')
const messages = fs.readFileSync(path.join(root, 'src', 'components', 'ApplicationMessages.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src', 'components', 'NotificationCenter.css'), 'utf8')
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')

const requireMatch = (source, expression, message) => {
  if (!expression.test(source)) throw new Error(message)
}

requireMatch(sql, /audience\s+text\s+not\s+null\s+default\s+'facility'/i, 'notification audience column missing')
requireMatch(sql, /recipient_clerk_user_id\s*=\s*ho_private\.current_clerk_user_id\(\)/i, 'recipient ownership RLS guard missing')
requireMatch(sql, /audience\s*=\s*'jobseeker'/i, 'jobseeker audience RLS path missing')
requireMatch(sql, /create unique index if not exists hc_notifications_event_key_uidx/i, 'idempotent notification event key missing')
requireMatch(sql, /revoke insert, update, delete on public\.hc_notifications from authenticated/i, 'browser direct notification writes must remain revoked')
requireMatch(sql, /grant select on public\.hc_notifications to authenticated/i, 'authenticated notification read grant missing')
requireMatch(sql, /grant execute on function public\.hc_mark_notification_read\(uuid\) to authenticated/i, 'single-read RPC grant missing')
requireMatch(sql, /grant execute on function public\.hc_mark_all_notifications_read\(\) to authenticated/i, 'mark-all RPC grant missing')

for (const trigger of [
  'hc_applications_notify_jobseeker',
  'hc_interviews_notify_jobseeker',
  'hc_messages_notify_jobseeker',
  'hc_visit_reservations_notify_jobseeker',
  'hc_spot_assignments_notify_jobseeker',
]) {
  if (!sql.includes(trigger)) throw new Error(`${trigger}: workflow notification trigger missing`)
}

requireMatch(repo, /\.eq\('audience',\s*'jobseeker'\)/, 'frontend must explicitly request jobseeker notifications only')
requireMatch(repo, /rpc\('hc_mark_notification_read'/, 'single notification read RPC not used')
requireMatch(repo, /rpc\('hc_mark_all_notifications_read'/, 'mark-all notification RPC not used')
if (/\.from\('hc_notifications'\)[\s\S]*?\.(insert|update|delete)\(/.test(repo)) throw new Error('frontend must not write hc_notifications directly')

requireMatch(component, /ALLOWED_PATHS/, 'notification navigation allow-list missing')
requireMatch(component, /setInterval\([\s\S]*60_000/, 'notification refresh interval missing')
requireMatch(component, /aria-expanded=\{open\}/, 'notification trigger expanded state missing')
requireMatch(component, /すべて既読/, 'mark-all affordance missing')
requireMatch(component, /const target = safeTarget\(item\)/, 'notification target must be validated before read handling')
requireMatch(component, /deferReadToMessagePanel\s*=\s*item\.notification_type\s*===\s*'message_received'/, 'facility-message notifications must defer read acknowledgement')
requireMatch(component, /!item\.read_at\s*&&\s*!deferReadToMessagePanel/, 'message notification click must not mark read before message content loads')
requireMatch(component, /target\.endsWith\('#application-messages'\)/, 'deferred message read must be limited to the owned application-message deep-link')
requireMatch(messages, /load\(\{ acknowledge: true \}\)/, 'message panel must acknowledge only after loading message content')
requireMatch(messages, /hc:application-messages-viewed/, 'message panel must emit explicit viewed event after successful load')
requireMatch(css, /@media\(max-width:760px\)[\s\S]*\.notification-popover\{position:fixed/, 'mobile notification layout guard missing')
requireMatch(app, /<NotificationCenter\s+onNavigate=/, 'notification center is not connected to the header')

console.log('jobseeker notification center contract passed')
