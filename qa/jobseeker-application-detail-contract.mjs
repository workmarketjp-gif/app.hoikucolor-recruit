import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260912000442_hc_jobseeker_application_detail_v1.sql'), 'utf8')
const repo = fs.readFileSync(path.join(root, 'src', 'lib', 'recruitRepository.ts'), 'utf8')
const detail = fs.readFileSync(path.join(root, 'src', 'components', 'ApplicationDetail.tsx'), 'utf8')
const messages = fs.readFileSync(path.join(root, 'src', 'components', 'ApplicationMessages.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src', 'components', 'ApplicationDetail.css'), 'utf8')
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')
const notifications = fs.readFileSync(path.join(root, 'src', 'components', 'NotificationCenter.tsx'), 'utf8')

const requireMatch = (source, expression, message) => {
  if (!expression.test(source)) throw new Error(message)
}

requireMatch(sql, /create or replace function public\.hc_jobseeker_list_applications\(\)/i, 'candidate application history RPC missing')
requireMatch(sql, /create or replace function public\.hc_jobseeker_get_application_detail\(p_application_id uuid\)/i, 'candidate application detail RPC missing')
const callerGuards = sql.match(/jobseeker_clerk_user_id\s*=\s*ho_private\.current_clerk_user_id\(\)/gi) || []
if (callerGuards.length < 3) throw new Error('candidate identity guards are incomplete')
requireMatch(sql, /revoke all on function public\.hc_jobseeker_list_applications\(\) from public, anon/i, 'list RPC anon/public revoke missing')
requireMatch(sql, /revoke all on function public\.hc_jobseeker_get_application_detail\(uuid\) from public, anon/i, 'detail RPC anon/public revoke missing')
requireMatch(sql, /grant execute on function public\.hc_jobseeker_list_applications\(\) to authenticated/i, 'list RPC authenticated grant missing')
requireMatch(sql, /grant execute on function public\.hc_jobseeker_get_application_detail\(uuid\) to authenticated/i, 'detail RPC authenticated grant missing')

for (const [expression, label] of [
  [/['"]note['"]\s*,\s*i\.note/i, 'interview note'],
  [/['"]result['"]\s*,\s*i\.result/i, 'interview result'],
  [/['"]created_by['"]\s*,\s*i\.created_by/i, 'interview creator'],
  [/['"]interviewer['"]\s*,\s*i\.interviewer/i, 'interviewer identity'],
  [/['"]facility_note['"]\s*,\s*r\.facility_note/i, 'facility visit note'],
  [/['"]admin_memo['"]\s*,\s*a\.admin_memo/i, 'application admin memo'],
  [/['"]hired_staff_id['"]\s*,\s*a\.hired_staff_id/i, 'internal hired staff id'],
]) {
  if (expression.test(sql)) throw new Error(`${label} must not be exposed to jobseekers`)
}

requireMatch(repo, /rpc\('hc_jobseeker_list_applications'/, 'frontend application list must use candidate-safe RPC')
requireMatch(repo, /rpc\('hc_jobseeker_get_application_detail'/, 'frontend application detail must use candidate-safe RPC')
requireMatch(detail, /<ApplicationMessages applicationId=\{application\.id\}/, 'messages/documents must be scoped to selected application detail')
requireMatch(detail, /safeHttpUrl\(interview\.meeting_url\)/, 'meeting URL protocol guard missing')
requireMatch(detail, /const load = useCallback\(async \(quiet = false\) =>/, 'application detail must have a quiet refresh path')
requireMatch(detail, /window\.setInterval\(refreshWhenVisible,\s*60_000\)/, 'application detail must refresh periodically while visible')
requireMatch(detail, /window\.addEventListener\('focus',\s*refreshWhenVisible\)/, 'application detail must refresh on browser focus')
requireMatch(detail, /window\.addEventListener\('pageshow',\s*refreshWhenVisible\)/, 'application detail must refresh after mobile/back-forward cache restore')
requireMatch(detail, /document\.addEventListener\('visibilitychange',\s*refreshWhenVisible\)/, 'application detail must refresh when a hidden tab becomes visible')
requireMatch(detail, /window\.addEventListener\('hc:application-detail-refresh',\s*refreshWhenVisible\)/, 'application detail must support explicit same-session refresh')
requireMatch(detail, /focusedTargetRef\.current === targetId/, 'background detail refresh must not repeatedly steal focus to a deep-link target')
requireMatch(detail, /await onRespond\(true\)/, 'interview response must refresh detail quietly')
requireMatch(detail, /new CustomEvent\('hc:attention-refresh'\)/, 'interview response must refresh attention counts immediately')
requireMatch(messages, /if \(!open\) return;/, 'message auto-refresh must run only while the communication panel is open')
requireMatch(messages, /load\(\{ acknowledge: true, quiet: true \}\)/, 'visible open message panel must quietly refresh and acknowledge only after content loads')
requireMatch(messages, /window\.setInterval\(refreshWhenVisible,\s*60_000\)/, 'open message panel must refresh periodically')
requireMatch(messages, /window\.addEventListener\('focus',\s*refreshWhenVisible\)/, 'open message panel must refresh on browser focus')
requireMatch(messages, /window\.addEventListener\('pageshow',\s*refreshWhenVisible\)/, 'open message panel must refresh after mobile/back-forward cache restore')
requireMatch(messages, /document\.visibilityState\s*!==\s*'visible'/, 'open message polling must be suppressed while hidden')
requireMatch(app, /application_id/, 'application detail query parameter routing missing')
requireMatch(app, /<ApplicationDetail applicationId=\{selectedApplicationId\}/, 'application detail is not connected to App')
if (/import \{ ApplicationMessages \}/.test(app)) throw new Error('application list must not mount message/document components for every row')
requireMatch(notifications, /item\.application_id[\s\S]*applications\?application_id=/, 'notification application deep link missing')
requireMatch(css, /@media\(max-width:620px\)/, 'application detail mobile layout guard missing')

console.log('jobseeker application detail contract passed')
