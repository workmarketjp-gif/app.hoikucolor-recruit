import fs from 'node:fs'

// Contract for the 履歴書 / 職務経歴書 builder: structured data owned by the Clerk `sub`,
// written only through JWT-owned RPCs, PDFs generated lazily on the device and saved into
// the existing private document vault, and the optional photo never uploaded on its own.

const read = (path) => fs.readFileSync(path, 'utf8')
const migrationPath = 'supabase/migrations/20261017055551_hc_jobseeker_resume_builder_v1.sql'
const migration = read(migrationPath)
const indexFix = read('supabase/migrations/20261017120000_hc_jobseeker_resume_entries_drop_duplicate_index_v1.sql')
const repository = read('src/lib/resumeRepository.ts')
const documentModel = read('src/lib/resumeDocument.ts')
const pdf = read('src/lib/resumePdf.ts')
const fontkitAdapter = read('src/lib/pdfFontkit.ts')
const photoStore = read('src/lib/resumePhotoStore.ts')
const view = read('src/views/ResumeBuilderView.tsx')
const app = read('src/App.tsx')
const router = read('src/lib/router.ts')
const vaultPanel = read('src/components/DocumentVaultPanel.tsx')
const pkg = JSON.parse(read('package.json'))
const fontPath = 'public/fonts/biz-udgothic-jp-subset-v1.ttf'

const resumeTable = migration.match(/create table if not exists public\.hc_jobseeker_resumes \(([\s\S]*?)\n\);/)?.[1] ?? ''
const entryTable = migration.match(/create table if not exists public\.hc_jobseeker_resume_entries \(([\s\S]*?)\n\);/)?.[1] ?? ''
const saveRpc = migration.match(/create or replace function public\.hc_jobseeker_save_resume[\s\S]*?\n\$\$;/)?.[0] ?? ''
const getRpc = migration.match(/create or replace function public\.hc_jobseeker_get_resume[\s\S]*?\n\$\$;/)?.[0] ?? ''

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? walk(path) : [path]
  })
}
const srcFiles = walk('src').filter((path) => /\.(ts|tsx)$/.test(path))
const staticPdfImporters = srcFiles.filter((path) => {
  const source = read(path)
  return /from ['"](pdf-lib|fontkit|@pdf-lib\/fontkit)['"]/.test(source) || /from ['"][./]+(lib\/)?resumePdf['"]/.test(source)
})
const japaneseLiterals = (view.match(/>[^<>{}]*[ぁ-んァ-ン一-龯][^<>{}]*</g) || []).concat(view.match(/'[^'\n]*[ぁ-んァ-ン一-龯][^'\n]*'/g) || [])

const checks = [
  // Schema: only missing data, owner-scoped, cascades with the candidate profile.
  ['migration file exists', migration.length > 0],
  ['résumé row is keyed by the candidate profile and cascades on account deletion', /clerk_user_id text primary key\s+references public\.hc_jobseeker_profiles\(clerk_user_id\) on delete cascade/.test(resumeTable)],
  ['entries cascade with the résumé row', /references public\.hc_jobseeker_resumes\(clerk_user_id\) on delete cascade/.test(entryTable)],
  ['profile data is not duplicated (name / kana / contact / qualifications / experience)', !/\n\s*(name|name_kana|email|phone|qualifications|years_of_experience|classroom_experience|leadership_roles)\s/.test(resumeTable)],
  ['education and employment history are structured entries', /kind text not null check \(kind in \('education','employment'\)\)/.test(entryTable)],
  ['childcare detail per position: age groups, class lead, management role', /age_groups text\[\]/.test(entryTable) && /class_lead boolean/.test(entryTable) && /management_role text/.test(entryTable)],
  ['summary, self-PR, strengths and motivation columns exist', ['work_summary', 'self_pr', 'strengths', 'motivation'].every((column) => new RegExp(`\\n\\s*${column} text`).test(resumeTable))],
  ['year-month values are validated', (entryTable.match(/\^\(19\|20\)\[0-9\]\{2\}-\(0\[1-9\]\|1\[0-2\]\)\$/g) || []).length >= 2],
  ['optional photo is not stored in the database', !/photo/i.test(resumeTable + entryTable)],

  // RLS / privileges.
  ['RLS enabled on both tables', /alter table public\.hc_jobseeker_resumes enable row level security/.test(migration) && /alter table public\.hc_jobseeker_resume_entries enable row level security/.test(migration)],
  ['browser roles lose every table privilege first', /revoke all on table public\.hc_jobseeker_resumes from public, anon, authenticated/.test(migration) && /revoke all on table public\.hc_jobseeker_resume_entries from public, anon, authenticated/.test(migration)],
  ['authenticated gets SELECT only', /grant select on table public\.hc_jobseeker_resumes to authenticated;/.test(migration) && /grant select on table public\.hc_jobseeker_resume_entries to authenticated;/.test(migration) && !/grant (insert|update|delete|all)[^;]*hc_jobseeker_resume/i.test(migration)],
  ['owner policies use the Clerk sub via initplan-safe auth.jwt()', (migration.match(/using \(clerk_user_id = nullif\(\(\(select auth\.jwt\(\)\) ->> 'sub'\), ''\)\)/g) || []).length === 2],
  ['account-deletion write freeze covers both tables', (migration.match(/hc_candidate_owned_row_account_freeze_v1\('clerk_user_id'\)/g) || []).length === 2],
  ['redundant owner index is dropped (the unique constraint already covers it)', /drop index if exists public\.hc_jobseeker_resume_entries_owner_idx;/.test(indexFix) && /hc_jobseeker_resume_entries_order_unique/.test(indexFix)],
  ['migration fails closed on privilege drift', /HC_RESUME_BUILDER_PRIVILEGE_DRIFT/.test(migration)],

  // RPC boundary.
  ['get RPC derives the actor from the JWT', /v_actor text := nullif\(\(select auth\.jwt\(\)\) ->> 'sub', ''\)/.test(getRpc)],
  ['save RPC derives the actor from the JWT', /v_actor text := nullif\(\(select auth\.jwt\(\)\) ->> 'sub', ''\)/.test(saveRpc)],
  ['RPCs accept no caller-supplied identity', !/p_clerk|p_user|p_owner|p_jobseeker/i.test(getRpc + saveRpc)],
  ['RPCs are SECURITY DEFINER with an empty search_path', /security definer\s+set search_path = ''/.test(getRpc) && /security definer\s+set search_path = ''/.test(saveRpc)],
  ['save RPC honours the account-deletion freeze', /hc_private\.assert_jobseeker_mutation_allowed_v1\(v_actor\)/.test(saveRpc)],
  ['save RPC rejects stale revisions instead of overwriting', /p_expected_revision is distinct from v_current[\s\S]*HC_RESUME_REVISION_CONFLICT/.test(saveRpc)],
  ['save RPC only deletes the actor\'s own entries', /delete from public\.hc_jobseeker_resume_entries e where e\.clerk_user_id = v_actor;/.test(saveRpc)],
  ['save RPC caps entries and payload size', /HC_RESUME_TOO_MANY_ENTRIES/.test(saveRpc) && /pg_column_size\(p_resume\) > 200000/.test(saveRpc)],
  ['RPC execute revoked from anon and granted to authenticated', /revoke all on function public\.hc_jobseeker_save_resume\(integer, jsonb\) from public, anon, authenticated, service_role;\s*grant execute on function public\.hc_jobseeker_save_resume\(integer, jsonb\) to authenticated;/.test(migration) && /revoke all on function public\.hc_jobseeker_get_resume\(\) from public, anon, authenticated, service_role;\s*grant execute on function public\.hc_jobseeker_get_resume\(\) to authenticated;/.test(migration)],
  ['private helpers are not executable by browser roles', /revoke all on function hc_private\.jobseeker_resume_json_v1\(text\) from public, anon, authenticated/.test(migration) && /revoke all on function hc_private\.resume_text_v1\(jsonb, integer\) from public, anon, authenticated/.test(migration)],

  // Client repository.
  ['client reads through the owner RPC', /rpc\('hc_jobseeker_get_resume'\)/.test(repository)],
  ['client writes through the owner RPC with the expected revision', /rpc\('hc_jobseeker_save_resume', \{\s*p_expected_revision: resume\.revision,/.test(repository)],
  ['client never writes the tables directly', !/\.from\('hc_jobseeker_resume/.test(repository + view)],
  ['client never sends a Clerk identity in the résumé payload', !/clerk_user_id/.test(repository)],
  ['document model only uses entered data and keeps the profile as source', /profile\.qualifications/.test(documentModel) && /profile\.years_of_experience/.test(documentModel) && /data\.classroomExperience/.test(documentModel)],

  // PDF generation: lazy, Japanese font, vault reuse.
  ['PDF module is loaded only on demand', /await import\('\.\.\/lib\/resumePdf'\)/.test(view)],
  ['no screen statically imports pdf-lib / fontkit / resumePdf', staticPdfImporters.every((path) => /src[\\/]lib[\\/](resumePdf|pdfFontkit)\.ts$/.test(path))],
  ['builder screen itself is lazy-loaded', /const ResumeBuilderView = lazy\(\(\) => import\('\.\/views\/ResumeBuilderView'\)/.test(app)],
  ['route /resume registered under My Page', /resume: '\/resume'/.test(router) && /resume: 'profile'/.test(app)],
  ['PDF dependencies are pinned', pkg.dependencies['pdf-lib'] === '1.17.1' && pkg.dependencies.fontkit === '2.0.4' && !pkg.dependencies['@pdf-lib/fontkit']],
  ['fontkit adapter recreates encodeStream for pdf-lib subsetting', /subset\.encodeStream = \(\) =>/.test(fontkitAdapter) && /subset\.encode\(\)/.test(fontkitAdapter)],
  ['Japanese font is subset-embedded', /embedFont\(await loadFontBytes\(\), \{ subset: true \}\)/.test(pdf)],
  ['font is a versioned static asset', pdf.includes("'/fonts/biz-udgothic-jp-subset-v1.ttf'") && fs.existsSync(fontPath)],
  ['font asset stays under 3 MB', fs.existsSync(fontPath) && fs.statSync(fontPath).size < 3 * 1024 * 1024],
  ['font license ships with the font', fs.existsSync('public/fonts/BIZUDGothic-OFL.txt') && /SIL Open Font License/.test(read('public/fonts/BIZUDGothic-OFL.txt'))],
  ['pages are A4', /const PAGE_W = 210 \* MM;/.test(pdf) && /const PAGE_H = 297 \* MM;/.test(pdf)],
  ['text wraps with Japanese line-start rules and breaks pages', /NO_LINE_START/.test(pdf) && /ensure\(height: number\)/.test(pdf) && /（つづき）/.test(pdf)],
  ['unsupported characters are reported, never silently dropped', /missingCharacters/.test(pdf) && /item\.missing\.length > 0/.test(view)],
  ['PDFs are saved through the existing vault upload as resume / work_history', /uploadJobseekerDocument\(ownerId, type, file, \{/.test(view) && /type: 'resume' \| 'work_history'|create\('resume'\)/.test(view) && /create\('work_history'\)/.test(view)],
  ['pending edits are saved before a PDF is created', /if \(!\(await flushAll\(\)\)\)/.test(view)],
  ['manual upload stays available next to the builder link', /fileRef\.current\?\.click\(\)/.test(vaultPanel) && /href="\/resume"/.test(vaultPanel)],

  // Photo privacy.
  ['photo store never talks to Supabase or the network', !/supabase|fetch\(|upload/i.test(photoStore.replace(/\/\*\*[\s\S]*?\*\//, ''))],
  ['photo is re-encoded (drops EXIF) and cropped to 3:4', /canvas\.toBlob\(resolve, 'image\/jpeg'/.test(photoStore) && /WIDTH \/ HEIGHT/.test(photoStore)],

  // Product rules.
  ['no internal abbreviations in builder UI text', japaneseLiterals.every((text) => !/\b(HO|HM|HF|HC)\b/.test(text))],
  ['no AI provider was added', !/openai|anthropic|gemini|generativelanguage/i.test(view + repository + documentModel)],
  ['no service-role key in the browser bundle', srcFiles.every((path) => !/service_role|SERVICE_ROLE/.test(read(path)))],
]

const failed = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) {
  console.error(`\n${failed.length} résumé builder contract check(s) failed.`)
  process.exit(1)
}
console.log(`\n${checks.length}/${checks.length} résumé builder contract checks passed.`)
