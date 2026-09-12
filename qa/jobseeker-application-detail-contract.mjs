import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260912000442_hc_jobseeker_application_detail_v1.sql'), 'utf8')
const repo = fs.readFileSync(path.join(root, 'src', 'lib', 'recruitRepository.ts'), 'utf8')
const detail = fs.readFileSync(path.join(root, 'src', 'components', 'ApplicationDetail.tsx'), 'utf8')
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
requireMatch(app, /application_id/, 'application detail query parameter routing missing')
requireMatch(app, /<ApplicationDetail applicationId=\{selectedApplicationId\}/, 'application detail is not connected to App')
if (/import \{ ApplicationMessages \}/.test(app)) throw new Error('application list must not mount message/document components for every row')
requireMatch(notifications, /item\.application_id[\s\S]*applications\?application_id=/, 'notification application deep link missing')
requireMatch(css, /@media\(max-width:620px\)/, 'application detail mobile layout guard missing')

console.log('jobseeker application detail contract passed')
