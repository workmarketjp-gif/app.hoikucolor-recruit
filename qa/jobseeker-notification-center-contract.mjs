import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260911220539_hc_jobseeker_notification_center_v1.sql'), 'utf8')
const boundarySql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260914030000_hc_jobseeker_notification_read_boundary_v1.sql'), 'utf8')
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

requireMatch(boundarySql, /create or replace function public\.hc_jobseeker_list_notifications\(p_limit integer default 30\)/i, 'candidate notification read-model RPC missing')
requireMatch(boundarySql, /n\.audience\s*=\s*'jobseeker'/i, 'candidate notification read model must hard-bind jobseeker audience')
requireMatch(boundarySql, /n\.recipient_clerk_user_id\s*=\s*ho_private\.current_clerk_user_id\(\)/i, 'candidate notification read model must hard-bind Clerk recipient')
requireMatch(boundarySql, /from public\.hc_applications a[\s\S]*a\.jobseeker_clerk_user_id\s*=\s*ho_private\.current_clerk_user_id\(\)/i, 'application-linked notifications must require an owned live application')
requireMatch(boundarySql, /from public\.hc_scout_invitations s[\s\S]*jobseeker:scout:/i, 'scout notifications must require a live owned scout target')
requireMatch(boundarySql, /from public\.hc_visit_reservations v[\s\S]*jobseeker:visit:/i, 'visit notifications must require a live owned visit target')
requireMatch(boundarySql, /from public\.hc_spot_assignments s[\s\S]*jobseeker:spot:/i, 'spot notifications must require a live owned spot target')
requireMatch(boundarySql, /create or replace function public\.hc_jobseeker_mark_notification_read\(p_notification_id uuid\)/i, 'candidate-only single notification acknowledgement RPC missing')
requireMatch(boundarySql, /create or replace function public\.hc_jobseeker_mark_all_notifications_read\(\)/i, 'candidate-only mark-all notification RPC missing')
requireMatch(boundarySql, /where n\.id = p_notification_id[\s\S]*n\.audience = 'jobseeker'[\s\S]*n\.recipient_clerk_user_id = ho_private\.current_clerk_user_id\(\)/i, 'single acknowledgement must never cross recipient or audience')
requireMatch(boundarySql, /where n\.read_at is null[\s\S]*n\.audience = 'jobseeker'[\s\S]*n\.recipient_clerk_user_id = ho_private\.current_clerk_user_id\(\)/i, 'mark-all acknowledgement must never cross recipient or audience')
requireMatch(boundarySql, /revoke all on function public\.hc_jobseeker_mark_all_notifications_read\(\) from public, anon/i, 'candidate mark-all must reject anon/public')
requireMatch(boundarySql, /grant execute on function public\.hc_jobseeker_mark_all_notifications_read\(\) to authenticated/i, 'candidate mark-all authenticated grant missing')

for (const trigger of [
  'hc_applications_notify_jobseeker',
  'hc_interviews_notify_jobseeker',
  'hc_messages_notify_jobseeker',
  'hc_visit_reservations_notify_jobseeker',
  'hc_spot_assignments_notify_jobseeker',
]) {
  if (!sql.includes(trigger)) throw new Error(`${trigger}: workflow notification trigger missing`)
}

requireMatch(repo, /rpc\('hc_jobseeker_list_notifications'/, 'frontend must use candidate-only notification read model')
requireMatch(repo, /rpc\('hc_jobseeker_mark_notification_read'/, 'candidate-only single notification read RPC not used')
requireMatch(repo, /rpc\('hc_jobseeker_mark_all_notifications_read'/, 'candidate-only mark-all notification RPC not used')
if (/rpc\('hc_mark_notification_read'/.test(repo)) throw new Error('jobseeker frontend must not use shared single notification acknowledgement RPC')
if (/rpc\('hc_mark_all_notifications_read'/.test(repo)) throw new Error('jobseeker frontend must not use shared mark-all notification acknowledgement RPC')
if (/\.from\('hc_notifications'\)/.test(repo)) throw new Error('jobseeker frontend must use the candidate notification read model instead of direct table reads')

requireMatch(component, /ALLOWED_PATHS/, 'notification navigation allow-list missing')
requireMatch(component, /window\.setInterval\(refreshWhenVisible,\s*60_000\)/, 'notification refresh interval missing')
requireMatch(component, /document\.visibilityState\s*!==\s*'visible'/, 'notification polling must remain suppressed while hidden')
requireMatch(component, /window\.addEventListener\('focus',\s*refreshWhenVisible\)/, 'notification state must refresh on browser focus')
requireMatch(component, /window\.addEventListener\('pageshow',\s*refreshWhenVisible\)/, 'notification state must refresh after mobile/back-forward cache restore')
requireMatch(component, /document\.addEventListener\('visibilitychange',\s*refreshWhenVisible\)/, 'notification state must refresh when a hidden tab becomes visible')
requireMatch(component, /window\.removeEventListener\('focus',\s*refreshWhenVisible\)/, 'notification focus listener must be cleaned up')
requireMatch(component, /window\.removeEventListener\('pageshow',\s*refreshWhenVisible\)/, 'notification pageshow listener must be cleaned up')
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
