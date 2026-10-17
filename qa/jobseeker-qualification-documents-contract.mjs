import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

// documentTypes.ts has type-only imports, so Node's TypeScript type stripping can run it as-is.
const types = await import(pathToFileURL(path.join(root, 'src/lib/documentTypes.ts')).href);

const ALL_TYPES = [
  'resume', 'work_history', 'nursery_teacher_license', 'kindergarten_license',
  'registered_dietitian_license', 'dietitian_license', 'cook_license',
  'nurse_license', 'assistant_nurse_license', 'other',
];
const EXPECTED_LABELS = {
  nursery_teacher_license: '保育士証',
  kindergarten_license: '幼稚園教諭免許状',
  registered_dietitian_license: '管理栄養士免許証',
  dietitian_license: '栄養士免許証',
  cook_license: '調理師免許証',
  nurse_license: '看護師免許証',
  assistant_nurse_license: '准看護師免許証',
  other: 'その他',
};

// ---------- 1. One type list everywhere ----------
check(JSON.stringify(types.DOCUMENT_TYPE_ORDER) === JSON.stringify(ALL_TYPES), 'DOCUMENT_TYPE_ORDER must list exactly the 10 supported types');
for (const [type, label] of Object.entries(EXPECTED_LABELS)) {
  check(types.DOCUMENT_TYPE_LABELS[type] === label, `label for ${type} must be ${label}`);
}
for (const file of ['src/lib/documentVaultRepository.ts', 'native/src/lib/documentVaultApi.ts']) {
  const source = read(file);
  for (const type of ALL_TYPES) check(source.includes(`| '${type}'`), `${file} JobseekerDocumentType must include ${type}`);
}
const nativeVault = read('native/src/components/DocumentVaultSection.tsx');
for (const label of Object.values(EXPECTED_LABELS)) check(nativeVault.includes(`'${label}'`), `Native document vault must label ${label}`);

// ---------- 2. Migration is additive and keeps the security boundary ----------
const migration = read('supabase/migrations/20261017120000_hc_jobseeker_qualification_documents_v1.sql');
const sql = migration.replace(/--[^\n]*/g, '');
const typeList = `('${ALL_TYPES.join("','")}')`;
const flatSql = sql.replace(/\s+/g, ' ');
for (const table of ['hc_jobseeker_documents', 'hc_application_documents', 'hc_application_document_expectations']) {
  check(flatSql.includes(`alter table public.${table} add constraint ${table}_document_type_check check (document_type in ${typeList}) not valid;`), `${table} CHECK must be widened to the full list (NOT VALID)`);
  check(new RegExp(`validate constraint ${table}_document_type_check`, 'i').test(sql), `${table} CHECK must be validated after widening`);
}
check(!/\bupdate\s+public\.hc_(jobseeker|application)_documents\b/i.test(sql), 'migration must never rewrite existing document rows');
check(!/\bdelete\s+from\s+public\.hc_(jobseeker_documents|application_documents|application_document_expectations|applications|jobs)\b/i.test(sql) && !/\btruncate\b/i.test(sql), 'migration must not delete candidate or job data (only the nursery settings RPC replaces its own requirement rows)');
check(/create or replace function ho_private\.hc_jobseeker_submit_application_impl\([\s\S]*?hc_jobseeker_submit_application_v2_impl\(/i.test(sql), 'v1 implementation must delegate to the shared v2 rule');
check(/ho_private\.recruitment_can_write\(j\.facility_id\)/.test(sql) && /hc_employer_set_market_job_document_requirements/.test(sql), 'nursery settings must be authorised by the existing recruitment write check');
check(!/create\s+or\s+replace\s+function\s+public\.hc_jobseeker_submit_application\s*\(/i.test(sql), 'public v1 submit wrapper signature must stay untouched (old Native builds call it)');
check(/ho_private\.hc_jobseeker_document_type_is_valid\(p_document_type\)/.test(sql), 'source registration must validate against the canonical type list');
check(/create table if not exists public\.hc_job_document_requirements/i.test(sql), 'per-job requirement table must exist');
check(/requirement in \('required','optional','requested_later','not_applicable'\)/.test(sql), 'requirement levels must be required/optional/requested_later/not_applicable');
check(/alter table public\.hc_job_document_requirements enable row level security/i.test(sql), 'requirement table must have RLS enabled');
check(/revoke all on table public\.hc_job_document_requirements from public, anon, authenticated/i.test(sql), 'browsers must not read or write the requirement table directly');
check(!/grant[^;]+on table public\.hc_job_document_requirements/i.test(sql), 'no browser grant on the requirement table');
check(!/service_role/i.test(sql), 'this migration must not involve service_role');
for (const fn of ['hc_jobseeker_get_job_document_requirements(uuid)', 'hc_jobseeker_submit_application_v2(uuid,text,text,text,text,text,numeric,date,text,uuid[])']) {
  const escaped = fn.replace(/[()[\]]/g, (c) => `\\${c}`);
  check(new RegExp(`revoke all on function public\\.${escaped} from public, anon;`, 'i').test(sql), `${fn} must not be executable by anon`);
  check(new RegExp(`grant execute on function public\\.${escaped} to authenticated;`, 'i').test(sql), `${fn} must be executable by signed-in candidates`);
}
for (const impl of ['hc_jobseeker_get_job_document_requirements_impl(uuid)', 'hc_jobseeker_submit_application_v2_impl(uuid,text,text,text,text,text,numeric,date,text,uuid[])']) {
  const escaped = impl.replace(/[()[\]]/g, (c) => `\\${c}`);
  check(new RegExp(`revoke all on function ho_private\\.${escaped} from public, anon, authenticated;`, 'i').test(sql), `${impl} must not be browser-executable`);
}
check(/j\.status = 'published'[\s\S]*f\.status = 'active'/.test(sql.slice(sql.indexOf('hc_jobseeker_get_job_document_requirements_impl'))), 'requirements are readable only for published jobs at active facilities');
check(/d\.jobseeker_clerk_user_id = v_user_id\s+for share/.test(sql), 'v2 must lock the selected documents and check ownership');
check(/raise exception 'required documents missing'/.test(sql), 'v2 must reject submissions missing a required document');
check(/raise exception 'one document per type'/.test(sql), 'v2 must allow at most one document per type');

// ---------- 3. Declared qualifications stay separate from evidence ----------
check(JSON.stringify(types.evidenceTypesForQualification('看護師')) === '["nurse_license"]', '看護師 → 看護師免許証');
check(JSON.stringify(types.evidenceTypesForQualification('准看護師')) === '["assistant_nurse_license"]', '准看護師 must not be treated as 看護師');
check(JSON.stringify(types.evidenceTypesForQualification('管理栄養士')) === '["registered_dietitian_license"]', '管理栄養士 must not be treated as 栄養士');
check(JSON.stringify(types.evidenceTypesForQualification('栄養士')) === '["dietitian_license"]', '栄養士 → 栄養士免許証');
check(types.evidenceTypesForQualification('子育て支援員').length === 0, 'unmapped qualifications have no evidence type');

const panel = read('src/components/DocumentVaultPanel.tsx');
const applyStep = read('src/components/ApplyDocumentsStep.tsx');
const app = read('src/App.tsx');
check(app.includes('<DocumentVaultPanel qualifications={initial.qualifications} />'), 'profile must pass declared qualifications to the document panel');
check(panel.includes('資格と証明書類') && panel.includes('ご本人の申告'), 'panel must label qualifications as self-declared');
check(panel.includes('確認済みになるわけではありません'), 'panel must say an upload is not verification');
for (const [file, source] of [['DocumentVaultPanel', panel], ['ApplyDocumentsStep', applyStep]]) {
  const withoutDisclaimer = source.replace('確認済みになるわけではありません', '');
  check(!/確認済み|認証済み|検証済み|verified/i.test(withoutDisclaimer), `${file} must not claim a qualification is verified`);
  check(!/[>'"「（\s](HO|HM|HF|HC)[\s」）'"<]/.test(source), `${file} must not show internal abbreviations`);
}

// ---------- 4. Apply plan: what is shown, preselected and blocking ----------
const doc = (id, type, isDefault, uploadedAt = '2026-10-01T00:00:00Z') => ({
  id, jobseeker_clerk_user_id: 'u', document_type: type, title: `${id}.pdf`, file_path: `jobseekers/u/${id}/document.pdf`,
  mime_type: 'application/pdf', file_size: 1, is_default: isDefault, uploaded_at: uploadedAt, created_at: uploadedAt, updated_at: uploadedAt,
});
const vault = [
  doc('resume-old', 'resume', false, '2026-01-01T00:00:00Z'),
  doc('resume-default', 'resume', true, '2026-02-01T00:00:00Z'),
  doc('nurse-new', 'nurse_license', false, '2026-09-01T00:00:00Z'),
  doc('nurse-older', 'nurse_license', false, '2026-03-01T00:00:00Z'),
  doc('work-default', 'work_history', true),
];

// Not configured: identical to the old flow (every 「応募時に使う」 file, nothing blocks).
const legacyRows = types.buildApplyDocumentRows({ configured: false, items: [] }, vault);
check(JSON.stringify(legacyRows.map((row) => [row.type, row.level])) === JSON.stringify([['resume', 'optional'], ['work_history', 'optional']]), 'unconfigured job shows saved defaults as optional');
const legacySelection = types.initialApplySelection(legacyRows);
check(JSON.stringify(types.selectedDocumentIds(legacyRows, legacySelection)) === JSON.stringify(['resume-default', 'work-default']), 'unconfigured job preselects saved defaults');
check(types.missingRequiredDocuments(legacyRows, {}).length === 0, 'unconfigured job never blocks');

const requirements = {
  configured: true,
  items: types.normalizeRequirements([
    { document_type: 'resume', requirement: 'required', note: null },
    { document_type: 'nurse_license', requirement: 'required', note: '  写しで可  ' },
    { document_type: 'cook_license', requirement: 'required', note: null },
    { document_type: 'work_history', requirement: 'optional', note: null },
    { document_type: 'kindergarten_license', requirement: 'requested_later', note: null },
    { document_type: 'other', requirement: 'not_applicable', note: null },
    { document_type: 'unknown_type', requirement: 'required', note: null },
    { document_type: 'resume', requirement: 'optional', note: null },
  ]),
};
check(requirements.items.length === 6, 'normalizeRequirements drops unknown types and duplicates');
const rows = types.buildApplyDocumentRows(requirements, vault);
check(!rows.some((row) => row.type === 'other'), 'not_applicable rows are hidden');
check(rows.find((row) => row.type === 'nurse_license')?.note === '写しで可', 'facility note is kept (trimmed)');
const selection = types.initialApplySelection(rows);
check(selection.resume === 'resume-default', 'required type preselects the saved default');
check(selection.nurse_license === 'nurse-new', 'required type without default preselects the newest file');
check(selection.work_history === 'work-default', 'optional type preselects the saved default');
check(selection.kindergarten_license === null, 'requested-later type starts unselected');
check(JSON.stringify(types.missingRequiredDocuments(rows, selection)) === JSON.stringify(['cook_license']), 'only the required type with no file blocks');
check(types.joinDocumentLabels(['cook_license', 'resume']) === '「調理師免許証」と「履歴書」', 'missing documents are named in plain Japanese');
const optionalCleared = { ...selection, work_history: null, cook_license: 'cook-uploaded' };
const withUpload = types.buildApplyDocumentRows(requirements, [...vault, doc('cook-uploaded', 'cook_license', true)]);
check(types.missingRequiredDocuments(withUpload, optionalCleared).length === 0, 'an inline upload clears the block; skipping optional documents never blocks');
check(types.missingRequiredDocuments(rows, { ...selection, resume: 'deleted-id' }).includes('resume'), 'a selection that no longer exists counts as missing');
check(!types.selectedDocumentIds(rows, { ...selection, resume: 'someone-elses-id' }).includes('someone-elses-id'), 'only ids from the candidate vault are sent');

// ---------- 5. Wiring ----------
const jobCard = read('src/components/JobCard.tsx');
const repository = read('src/lib/recruitRepository.ts');
const requirementRepository = read('src/lib/jobDocumentRequirementRepository.ts');
check(jobCard.includes('<ApplyDocumentsStep jobId={job.id} profile={applyProfile}'), 'job card must open the document step before submitting');
check(applyStep.includes('getJobDocumentRequirements(jobId)') && applyStep.includes('listJobseekerDocuments()'), 'apply step must load this job\'s requirements and the saved documents');
check(applyStep.includes('uploadJobseekerDocument(userId, type, file'), 'apply step must allow uploading a missing document inline');
check(applyStep.includes('if (missing.length || busy) return;'), 'apply step must block only on missing required documents');
check(applyStep.includes('submitApplication(jobId, profile, { documentIds: selectedDocumentIds(rows, selection) })'), 'apply step must submit the chosen documents');
check(applyStep.includes('はこの求人の応募に必要です'), 'blocking reason must be explained in plain Japanese');
check(repository.includes("rpc('hc_jobseeker_submit_application_v2'") && repository.includes('isMissingRpcError(v2.error)'), 'v2 submit must fall back to v1 only when the migration is not applied');
check(repository.includes('await handoffDefaultDocuments(data);'), 'callers without a selection keep the default-document handoff');
check(requirementRepository.includes("rpc('hc_jobseeker_get_job_document_requirements'") && requirementRepository.includes("code === 'PGRST202'"), 'requirement lookup must treat a missing RPC as not configured');
check(!/service_role|SERVICE_ROLE/.test(applyStep + requirementRepository + repository), 'browser code must never use the service role');

// ---------- 6. Native uses the same rules ----------
check(read('src/lib/documentTypes.ts') === read('native/src/lib/documentTypes.ts'), 'Native documentTypes.ts must be byte-identical to Web');
const nativeApi = read('native/src/lib/applicationJourneyApi.ts');
const nativeJob = read('native/src/app/job/[id].tsx');
const nativePanel = read('native/src/components/ApplyDocumentsPanel.tsx');
const nativeRequirementApi = read('native/src/lib/jobDocumentRequirementApi.ts');
check(nativeApi.includes("rpc('hc_jobseeker_submit_application_v2'") && nativeApi.includes('isMissingRpcError(error)'), 'Native submits through v2 (v1 only when the migration is not applied)');
check(nativeJob.includes('<ApplyDocumentsPanel jobId={job.id}') && nativeJob.includes('submitApplication(pinned.client, jobId, profile, { documentIds })'), 'Native job screen confirms documents before submitting');
check(nativePanel.includes('missingRequiredDocuments(rows, selection)') && nativePanel.includes('if (missing.length || submitting) return;'), 'Native blocks only on missing required documents');
check(nativePanel.includes('<DocumentVaultSection initialType={row.type} onDocumentsChanged={onVaultChanged} />'), 'Native inline upload reuses the existing vault component');
const webRequirementRepo = requirementRepository;
const messageOf = (source) => source.slice(source.indexOf('required documents missing'), source.indexOf('one document per type'));
check(messageOf(nativeRequirementApi).includes('この求人に必要な書類がそろっていません') && messageOf(repository).includes('この求人に必要な書類がそろっていません'), 'Web and Native show the same message for a missing required document');
check(webRequirementRepo.includes("code === 'PGRST202'") && nativeRequirementApi.includes("code === 'PGRST202'"), 'Web and Native treat a missing RPC the same way');

if (failures.length) {
  console.error('jobseeker-qualification-documents-contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('jobseeker-qualification-documents-contract: ok');
