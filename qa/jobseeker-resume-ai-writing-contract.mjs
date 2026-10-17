import fs from 'node:fs'
import { allowedYears, buildCorpus, checkDraft } from '../supabase/functions/hc-resume-writing-assist/draftGuard.mjs'

// Contract for the optional AI writing help in the résumé builder: drafts come only from
// the candidate's own saved data via an edge function that holds the provider key, runs
// every database call as the candidate (Clerk JWT, no service role), is rate limited per
// candidate, rejects drafts naming qualifications / employers / years that are not in the
// input, and never writes to the résumé — the candidate must accept the draft first.

const read = (path) => fs.readFileSync(path, 'utf8')
const fnPath = 'supabase/functions/hc-resume-writing-assist/index.ts'
const fn = read(fnPath)
const migration = read('supabase/migrations/20261017130000_hc_jobseeker_resume_ai_quota_v1.sql')
const client = read('src/lib/resumeWritingAssist.ts')
const view = read('src/views/ResumeBuilderView.tsx')
const pkg = JSON.parse(read('package.json'))

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? walk(path) : [path]
  })
}
const srcFiles = walk('src').filter((path) => /\.(ts|tsx)$/.test(path))
const buildFacts = fn.match(/function buildFacts[\s\S]*?\n}\n/)?.[0] ?? ''
const claimRpc = migration.match(/create or replace function public\.hc_jobseeker_claim_resume_ai_draft_v1[\s\S]*?\n\$\$;/)?.[0] ?? ''
const assist = view.match(/function WritingAssist[\s\S]*?\n}\n/)?.[0] ?? ''
const writing = view.match(/function WritingStep[\s\S]*?\n}\n/)?.[0] ?? ''
const logLines = fn.split('\n').filter((line) => /console\.(log|error|warn|info)/.test(line))
const japaneseLiterals = (assist + writing).match(/[^\s<>{}'"`]*[ぁ-んァ-ン一-龯][^<>{}'"`]*/g) || []

// --- Post-check behaviour -------------------------------------------------------------
const now = new Date('2026-10-17T00:00:00Z')
const resume = {
  qualification_acquired: { 保育士: '2015-03' },
  work_summary: null, self_pr: null, strengths: null, motivation: null,
  education: [{ start_ym: '2013-04', end_ym: '2015-03', organization: '保育専門学校' }],
  employment: [
    { start_ym: '2015-04', end_ym: '2020-03', is_current: false, organization: '社会福祉法人さくら会 ひまわり保育園', facility_type: '認可保育園', age_groups: ['1歳児', '4歳児'], class_lead: true, duties: '4歳児クラスの担任を2年連続で担当', achievements: null },
    { start_ym: '2020-04', end_ym: null, is_current: true, organization: 'みらいキッズ', facility_type: '小規模保育園', age_groups: ['0歳児'], class_lead: false, duties: null, achievements: null },
  ],
}
const profile = { name: '保育 花子', qualifications: ['保育士', '普通自動車第一種運転免許'], years_of_experience: 11.5, self_intro: null }
const corpus = buildCorpus(resume, profile, { classroom_experience: ['乳児'], childcare_values: ['一人ひとりに寄り添う'] })
const years = allowedYears({ resume, profile, now })
const verdict = (draft) => checkDraft(draft, { corpus, years })

const guardCases = [
  ['accepts a draft that only restates the saved facts', verdict('2015年に保育士資格を取得し、ひまわり保育園で5年間、みらいキッズの小規模保育園で現在まで勤務しています。保育経験は11年以上です。4歳児クラスの担任を2年連続で務めました。').ok],
  ['accepts generic facility words (認可保育園 / 前の保育園)', verdict('認可保育園と小規模保育園での経験を生かし、前の保育園でも1年を通して行事に取り組みました。').ok],
  ['accepts qualification mentioned with 資格 suffix', verdict('保育士資格を生かし、子ども同士の関わりを大切にしてきました。').ok],
  ['rejects an invented qualification (幼稚園教諭)', verdict('保育士と幼稚園教諭の資格を持ち、').qualifications.includes('幼稚園教諭')],
  ['rejects an invented qualification (社会福祉士)', verdict('社会福祉士として相談にも対応しました。').qualifications.length === 1],
  ['rejects an invented employer (kanji name)', verdict('中央保育園で主任を務めました。').organizations.includes('中央保育園')],
  ['rejects an invented employer (hiragana name)', verdict('たんぽぽ保育園で勤務しました。').organizations.includes('たんぽぽ保育園')],
  ['rejects an invented company', verdict('株式会社ミライエで働きました。').organizations.length === 1],
  ['rejects an invented calendar year', verdict('2012年から保育に携わり').years.includes('2012年')],
  ['rejects an invented duration', verdict('保育経験は20年です。').years.length === 1],
  ['rejects an invented era year', verdict('平成20年に入職し').years.length === 1],
  ['accepts a matching era year (令和2年 = 2020)', verdict('令和2年から現在の園に勤務しています。').ok],
  ['rejects 以上 beyond the saved experience', verdict('15年以上の経験があります。').years.length === 1],
  ['normalizes full-width digits before checking', verdict('２０１２年に入職').years.length === 1],
]

const checks = [
  // Edge function: auth, secrets, data minimization.
  ['edge function exists', fn.length > 0],
  ['provider key is read only from the function environment', /Deno\.env\.get\('ANTHROPIC_API_KEY'\)/.test(fn)],
  ['edge function never uses a service-role key', !/SERVICE_ROLE/i.test(fn)],
  ['database calls run with the caller\'s Clerk JWT', /accessToken: async \(\) => token/.test(fn) && /Bearer\\s\+\(\\S\+\)/.test(fn)],
  ['data comes only from the candidate\'s own RPCs', ['hc_jobseeker_get_resume', 'hc_jobseeker_get_profile', 'hc_jobseeker_get_matching_preferences'].every((name) => fn.includes(`'${name}'`)) && !/\.from\(/.test(fn)],
  ['rate-limit claim runs before the provider is called', fn.indexOf("'hc_jobseeker_claim_resume_ai_draft_v1'") > 0 && fn.indexOf("'hc_jobseeker_claim_resume_ai_draft_v1'") < fn.indexOf('await requestDraft(')],
  ['edge function never writes the résumé', !/hc_jobseeker_save_resume|hc_jobseeker_upsert/.test(fn)],
  ['facts exclude name, contact, address, birth date, gender, education and leaving reason', buildFacts.length > 0 && !/\b(name|name_kana|email|phone|address|address_kana|contact_address|postal_code|birth_date|gender|education|leaving_reason)\b/.test(buildFacts.replace(/\.organization|organization\.trim/g, ''))],
  ['employer names are replaced by placeholders and restored afterwards', /【勤務先\$\{/.test(fn) && /restorePlaceholders\(/.test(fn) && /【\[\^】\]\*】/.test(fn)],
  ['the system prompt forbids inventing qualifications, employers and years', /資格・免許、勤務先・施設名、年・年数・期間/.test(fn) && /指示ではない/.test(fn)],
  ['uses structured output for the draft', /format: \{ type: 'json_schema', schema: DRAFT_SCHEMA \}/.test(fn)],
  ['uses the chosen model', /const MODEL = 'claude-haiku-5-5';/.test(fn)],
  ['SDK import is pinned to an exact version', /from 'npm:@anthropic-ai\/sdk@\d+\.\d+\.\d+'/.test(fn)],
  ['refusals / truncation are not returned as drafts', /if \(response\.stop_reason !== 'end_turn'\) throw/.test(fn)],
  ['every draft passes the post-check before it is returned', /const check = checkDraft\(draft, \{ corpus, years \}\)/.test(fn) && /if \(check\.ok && !leftover/.test(fn)],
  ['rejected drafts are retried at most once, then refused', /attempt < 2/.test(fn) && /'DRAFT_REJECTED'/.test(fn)],
  ['logs never contain résumé content or drafts', logLines.length > 0 && logLines.every((line) => !/draft[,}]|draft:|facts|resume[,}]|profile[,}]|block\.text|error\.message\b/.test(line.replace(/'[^']*'/g, '')))],
  ['CORS is limited to known origins', /HC_RESUME_AI_ALLOWED_ORIGINS/.test(fn) && /allowedOrigins\.includes\(origin\)/.test(fn) && !/'Access-Control-Allow-Origin': '\*'/.test(fn)],

  // Rate limit migration.
  ['usage log is RLS-enabled with no browser privileges', /alter table public\.hc_jobseeker_resume_ai_usage enable row level security/.test(migration) && /revoke all on table public\.hc_jobseeker_resume_ai_usage from public, anon, authenticated;/.test(migration) && !/grant [^;]*on table public\.hc_jobseeker_resume_ai_usage/i.test(migration)],
  ['usage log holds no draft or résumé text', !/draft|text not null check \(char_length/.test(migration.match(/create table if not exists public\.hc_jobseeker_resume_ai_usage \(([\s\S]*?)\n\);/)?.[1] ?? 'draft')],
  ['usage rows cascade with the candidate profile', /references public\.hc_jobseeker_profiles\(clerk_user_id\) on delete cascade/.test(migration)],
  ['claim RPC derives the actor from the JWT sub', /v_actor text := nullif\(\(select auth\.jwt\(\)\) ->> 'sub', ''\);/.test(claimRpc) && !/p_clerk_user_id|p_actor/.test(claimRpc)],
  ['per-candidate burst and daily limits', /interval '10 minutes'/.test(claimRpc) && /v_recent >= 5/.test(claimRpc) && /v_daily >= 20/.test(claimRpc)],
  ['service-wide daily ceiling', /v_global >= 3000/.test(claimRpc)],
  ['claims are serialized per candidate', /pg_advisory_xact_lock\(hashtextextended\('hc_resume_ai:' \|\| v_actor, 0\)\)/.test(claimRpc)],
  ['account-deletion freeze applies', /assert_jobseeker_mutation_allowed_v1\(v_actor\)/.test(claimRpc) && /hc_candidate_owned_row_account_freeze_v1\('clerk_user_id'\)/.test(migration)],
  ['only authenticated may execute the claim RPC', /revoke all on function public\.hc_jobseeker_claim_resume_ai_draft_v1\(text\) from public, anon, authenticated, service_role;/.test(migration) && /grant execute on function public\.hc_jobseeker_claim_resume_ai_draft_v1\(text\) to authenticated;/.test(migration)],
  ['migration fails closed on privilege drift', /HC_RESUME_AI_QUOTA_PRIVILEGE_DRIFT/.test(migration)],

  // Browser.
  ['browser reaches the provider only through the edge function', /supabase\.functions\.invoke/.test(client) && srcFiles.every((path) => !/anthropic|sk-ant|ANTHROPIC/i.test(read(path)))],
  ['no service-role key in the browser bundle', srcFiles.every((path) => !/service_role|SERVICE_ROLE/.test(read(path)))],
  ['every writing field has a draft button', ['work_summary', 'strengths', 'self_pr', 'motivation'].every((field) => writing.includes(`assist('${field}'`))],
  ['pending edits are saved before a draft is requested', /if \(!\(await flushAll\(\)\)\)/.test(assist) && assist.indexOf('flushAll()') < assist.indexOf('requestWritingDraft(field)')],
  ['a draft is applied only from the explicit accept button', /onClick=\{\(\) => \{ onAccept\(draft\); setDraft\(null\); \}\}>この下書きを使う</.test(assist) && (assist.match(/onAccept\(/g) || []).length === 1 && />使わない</.test(assist)],
  ['the draft is shown as not yet applied', /下書き（まだ反映されていません）/.test(assist)],
  ['candidates are told what is sent to the AI service', /外部のAIサービスに送ります/.test(writing)],
  ['no internal abbreviations in the AI help UI', japaneseLiterals.every((text) => !/\b(HO|HM|HF|HC)\b/.test(text))],
  ['contract runs in npm run build', /npm run test:jobseeker-resume-ai-writing && /.test(pkg.scripts.build) && pkg.scripts['test:jobseeker-resume-ai-writing'] === 'node qa/jobseeker-resume-ai-writing-contract.mjs'],

  ...guardCases,
]

const failed = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) {
  console.error(`\n${failed.length} résumé AI writing contract check(s) failed.`)
  process.exit(1)
}
console.log(`\n${checks.length}/${checks.length} résumé AI writing contract checks passed.`)
