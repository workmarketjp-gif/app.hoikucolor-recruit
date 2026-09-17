import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260912110500_hc_jobseeker_interview_response_v1.sql'), 'utf8')
const repo = fs.readFileSync(path.join(root, 'src', 'lib', 'recruitRepository.ts'), 'utf8')
const detail = fs.readFileSync(path.join(root, 'src', 'components', 'ApplicationDetail.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src', 'components', 'ApplicationDetail.css'), 'utf8')

const requireMatch = (source, expression, message) => {
  if (!expression.test(source)) throw new Error(message)
}

requireMatch(sql, /create table if not exists public\.hc_interview_candidate_responses/i, 'structured candidate interview response table missing')
requireMatch(sql, /response_status text not null check \(response_status in \('accepted','reschedule_requested'\)\)/i, 'interview response status constraint missing')
requireMatch(sql, /alter table public\.hc_interview_candidate_responses enable row level security/i, 'interview response RLS missing')
requireMatch(sql, /revoke all on table public\.hc_interview_candidate_responses from public, anon, authenticated/i, 'candidate direct table access must stay revoked')
requireMatch(sql, /create or replace function public\.hc_jobseeker_respond_interview/i, 'candidate interview response RPC missing')
requireMatch(sql, /security definer[\s\S]*ho_private\.current_clerk_user_id\(\)/i, 'candidate response RPC must bind to current Clerk subject')
requireMatch(sql, /a\.jobseeker_clerk_user_id\s*=\s*v_actor/i, 'candidate must only answer their own interview')
requireMatch(sql, /v_interview\.status\s*<>\s*'scheduled'/i, 'non-scheduled interviews must be immutable to candidate')
requireMatch(sql, /v_status = 'reschedule_requested' and v_message is null/i, 'reschedule requests must include candidate availability')
requireMatch(sql, /char_length\(v_message\) > 1000/i, 'candidate interview message length guard missing')
requireMatch(sql, /perform public\.hc_send_message/i, 'structured response must remain visible in the existing facility message workflow')
requireMatch(sql, /revoke all on function public\.hc_jobseeker_respond_interview\(uuid,text,text\) from public, anon/i, 'candidate response RPC anon/public revoke missing')
requireMatch(sql, /grant execute on function public\.hc_jobseeker_respond_interview\(uuid,text,text\) to authenticated/i, 'candidate response RPC authenticated grant missing')
if (/update\s+public\.hc_interviews/i.test(sql)) throw new Error('candidate response must not mutate facility-owned interview schedule/status')

for (const [expression, label] of [
  [/['"]note['"]\s*,\s*i\.note/i, 'facility-only interview note'],
  [/['"]result['"]\s*,\s*i\.result/i, 'facility-only interview result'],
  [/['"]interviewer['"]\s*,\s*i\.interviewer/i, 'internal interviewer identity'],
]) {
  if (expression.test(sql)) throw new Error(`${label} must not be projected to the candidate detail RPC`)
}
requireMatch(sql, /'candidate_response_status',\s*r\.response_status/i, 'candidate response status missing from candidate detail read model')
requireMatch(sql, /'candidate_response_message',\s*r\.candidate_message/i, 'candidate response message missing from candidate detail read model')

requireMatch(repo, /rpc\('hc_jobseeker_respond_interview'/, 'frontend interview response must use candidate-safe RPC')
requireMatch(repo, /candidate_response_status:\s*JobseekerInterviewResponseStatus \| null/, 'frontend interview response type missing')
requireMatch(detail, /この日時でOK/, 'candidate interview acceptance action missing')
requireMatch(detail, /日程変更を希望/, 'candidate reschedule action missing')
requireMatch(detail, /maxLength=\{1000\}/, 'candidate reschedule message limit missing in UI')
requireMatch(detail, /interview\.status === 'scheduled'/, 'candidate UI must close responses after interview status changes')
requireMatch(css, /\.interview-response-panel/, 'candidate interview response styles missing')
requireMatch(css, /@media\(max-width:620px\)[\s\S]*interview-response-actions/, 'candidate interview response mobile layout guard missing')

console.log('jobseeker interview response contract passed')
