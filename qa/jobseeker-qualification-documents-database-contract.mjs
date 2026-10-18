// Applies 20261017101147_hc_jobseeker_qualification_documents_v1 to a
// production-shaped PGlite database, exercises it as real roles
// (anon / authenticated with chosen JWT claims), then runs the rollback and
// checks that catalog and pre-existing data are back to the baseline.
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const baselineSql = read('qa/fixtures/qualification-documents-baseline.sql');
const migrationSql = read('supabase/migrations/20261017101147_hc_jobseeker_qualification_documents_v1.sql');
const rollbackSql = read('supabase/ops/rollback-20261017101147-qualification-documents.sql');

const failures = [];
const passes = [];
const check = (condition, message) => { (condition ? passes : failures).push(message); };

const ORG = '00000000-0000-4000-8000-0000000000aa';
const FACILITY = '00000000-0000-4000-8000-0000000000f1';
const OTHER_FACILITY = '00000000-0000-4000-8000-0000000000f2';
const HM_JOB = '00000000-0000-4000-8000-00000000c0de';
const JOB = '00000000-0000-4000-8000-0000000000b1';
const JOB_OTHER = '00000000-0000-4000-8000-0000000000b2';
const JOB_DRAFT = '00000000-0000-4000-8000-0000000000b3';
const EXISTING_APP = '00000000-0000-4000-8000-0000000000a1';
const A = 'user_candidate_a';
const B = 'user_candidate_b';
const C = 'user_candidate_c';
const NURSERY = { sub: 'user_nursery', facility_admin_of: [FACILITY] };
const NURSERY_READONLY = { sub: 'user_nursery_ro', facility_admin_of: [FACILITY], read_only: true };
const STRANGER = { sub: 'user_other_nursery', facility_admin_of: [OTHER_FACILITY] };

const db = new PGlite();
await db.exec(baselineSql);
await db.exec(rollbackSql); // creates the production v1 implementation + register function on the baseline
await db.exec(`
create or replace function public.hc_jobseeker_submit_application(p_job_id uuid, p_applicant_name text, p_applicant_name_kana text default null::text, p_email text default null::text, p_phone text default null::text, p_qualifications text default null::text, p_years_of_experience numeric default null::numeric, p_desired_start_date date default null::date, p_message text default null::text)
returns uuid language sql security definer set search_path to '' as $function$
  select ho_private.hc_jobseeker_submit_application_impl(p_job_id, p_applicant_name, p_applicant_name_kana, p_email, p_phone, p_qualifications, p_years_of_experience, p_desired_start_date, p_message);
$function$;
revoke all on function public.hc_jobseeker_submit_application(uuid,text,text,text,text,text,numeric,date,text) from public, anon;
grant execute on function public.hc_jobseeker_submit_application(uuid,text,text,text,text,text,numeric,date,text) to authenticated;
revoke all on function public.hc_register_jobseeker_document_source(uuid,text,text,text,text,bigint) from public, anon;
grant execute on function public.hc_register_jobseeker_document_source(uuid,text,text,text,text,bigint) to authenticated;
`);

// ---------- Seed data shaped like production ----------
const docId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const vault = [
  [docId(1), A, 'resume', true], [docId(2), A, 'work_history', true], [docId(3), A, 'nursery_teacher_license', true],
  [docId(4), A, 'resume', false], [docId(5), B, 'resume', true], [docId(6), B, 'kindergarten_license', false],
  [docId(7), C, 'other', true],
];
await db.exec(`
insert into public.ho_facilities values ('${FACILITY}', '${ORG}', 'ポピー保育園', 'active'), ('${OTHER_FACILITY}', '${ORG}', '別の園', 'active');
insert into public.hc_jobs (id, organization_id, facility_id, source_type, source_id, title, status, published_at) values
  ('${JOB}', '${ORG}', '${FACILITY}', 'market', '${HM_JOB}', '保育士（正職員）', 'published', now()),
  ('${JOB_OTHER}', '${ORG}', '${OTHER_FACILITY}', 'manual', null, '別園の求人', 'published', now()),
  ('${JOB_DRAFT}', '${ORG}', '${FACILITY}', 'manual', null, '下書き', 'draft', null);
insert into public.hc_applications (id, organization_id, facility_id, job_id, applicant_name, status, source_type, jobseeker_clerk_user_id)
  values ('${EXISTING_APP}', '${ORG}', '${FACILITY}', '${JOB_OTHER}', '既存 応募者', 'reviewing', 'hoiku_color_jobseeker', '${B}');
`);
for (const [id, owner, type, isDefault] of vault) {
  const filePath = `jobseekers/${owner}/${id}/document.pdf`;
  await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('hc-application-documents', $1, '{"size": 100}')`, [filePath]);
  await db.query(`insert into public.hc_jobseeker_documents (id, jobseeker_clerk_user_id, document_type, title, file_path, mime_type, file_size, is_default) values ($1,$2,$3,$4,$5,'application/pdf',100,$6)`, [id, owner, type, `${type}.pdf`, filePath, isDefault]);
}
await db.exec(`
insert into public.hc_application_document_expectations (application_id, jobseeker_clerk_user_id, source_jobseeker_document_id_snapshot, document_type, title, destination_file_path)
  values ('${EXISTING_APP}', '${B}', '${docId(5)}', 'resume', 'resume.pdf', '${ORG}/${OTHER_FACILITY}/${EXISTING_APP}/vault-${docId(5)}/document.pdf');
insert into public.hc_application_documents (organization_id, facility_id, application_id, document_type, title, file_path, mime_type, file_size, source_jobseeker_document_id, uploaded_by_clerk_user_id)
  values ('${ORG}', '${OTHER_FACILITY}', '${EXISTING_APP}', 'resume', 'resume.pdf', '${ORG}/${OTHER_FACILITY}/${EXISTING_APP}/vault-${docId(5)}/document.pdf', 'application/pdf', 100, '${docId(5)}', '${B}');
`);

// ---------- Snapshots ----------
const dataTables = ['hc_jobseeker_documents', 'hc_application_documents', 'hc_application_document_expectations', 'hc_applications', 'hc_jobs'];
async function dataSnapshot(filter = '') {
  const out = {};
  for (const table of dataTables) {
    const { rows } = await db.query(`select to_jsonb(t) as row from public.${table} t ${filter} order by id`);
    out[table] = JSON.stringify(rows.map((r) => r.row));
  }
  return out;
}
async function catalogSnapshot() {
  const { rows } = await db.query(`
    select 'con:' || conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid) as item from pg_constraint where connamespace = 'public'::regnamespace
    union all select 'fn:' || p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','ho_private') and p.prokind = 'f'
    union all select 'pol:' || polrelid::regclass::text || ':' || polname from pg_policy
    union all select 'tbl:' || relname || ':rls=' || relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
    union all select 'acl:' || p.oid::regprocedure::text || ':' || coalesce(array_to_string(p.proacl, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    order by 1`);
  return rows.map((r) => r.item);
}
const baselineData = await dataSnapshot();
const baselineCatalog = await catalogSnapshot();

// ---------- Helpers ----------
async function as(claims, sql, params = []) {
  await db.exec('begin');
  try {
    if (claims) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await db.exec('set local role authenticated');
    } else {
      await db.exec('set local role anon');
    }
    const result = await db.query(sql, params);
    await db.exec('commit');
    return { rows: result.rows };
  } catch (error) {
    await db.exec('rollback');
    return { error };
  }
}
const submitV1 = (sub, job = JOB) => as({ sub }, `select public.hc_jobseeker_submit_application($1, '応募 太郎') as id`, [job]);
const submitV2 = (sub, ids, job = JOB) => as({ sub }, `select public.hc_jobseeker_submit_application_v2($1, '応募 太郎', p_document_ids => $2::uuid[]) as id`, [job, ids]);
const errorText = (r) => String(r.error?.message ?? '');

// ---------- Apply ----------
await db.exec(migrationSql);
await db.exec(`insert into supabase_migrations.schema_migrations values ('20261017101147', 'hc_jobseeker_qualification_documents_v1')`);
check(JSON.stringify(await dataSnapshot()) === JSON.stringify(baselineData), 'apply: every existing document, application, expectation and job row is byte-identical');

const { rows: cons } = await db.query(`select conrelid::regclass::text t, pg_get_constraintdef(oid) d from pg_constraint where conname like '%document_type_check' and convalidated`);
check(cons.length === 4 && cons.every((c) => c.d.includes('assistant_nurse_license') && c.d.includes('kindergarten_license')), 'apply: all document_type CHECKs (3 existing + requirements) are validated and include old and new types');

// RLS / privileges on the new table and RPCs.
check(Boolean((await as({ sub: A }, 'select * from public.hc_job_document_requirements')).error), 'RLS: a signed-in candidate cannot read the requirement table directly');
check(Boolean((await as(NURSERY, `insert into public.hc_job_document_requirements (job_id, document_type, requirement) values ('${JOB}', 'resume', 'required')`)).error), 'RLS: a nursery cannot write the requirement table directly');
check(Boolean((await as(null, `select public.hc_jobseeker_get_job_document_requirements('${JOB}')`)).error), 'anon cannot read job requirements');
check(Boolean((await as(null, `select public.hc_employer_get_market_job_document_requirements('${HM_JOB}')`)).error), 'anon cannot call the nursery settings RPC');
check(Boolean((await as(null, `select public.hc_jobseeker_submit_application_v2('${JOB}', 'x')`)).error), 'anon cannot submit');
check(Boolean((await as({ sub: A }, `select ho_private.hc_jobseeker_submit_application_v2_impl('${JOB}','x',null,null,null,null,null,null,null,'{}')`)).error), 'candidates cannot call the private implementation');
const otherVault = await as({ sub: A }, `select count(*)::int n from public.hc_jobseeker_documents where jobseeker_clerk_user_id = '${B}'`);
check(otherVault.rows?.[0]?.n === 0, 'RLS unchanged: candidate A still cannot see candidate B documents');

// Not configured → identical v1 behaviour (expectations = 応募時に使う documents).
const unconfigured = await as({ sub: A }, `select * from public.hc_jobseeker_get_job_document_requirements('${JOB}')`);
check(unconfigured.rows?.length === 0, 'unconfigured job returns no requirements');
const v1Plain = await submitV1(C);
check(Boolean(v1Plain.rows?.[0]?.id), 'v1 on an unconfigured job still succeeds');
const { rows: cExp } = await db.query(`select source_jobseeker_document_id_snapshot::text s from public.hc_application_document_expectations where application_id = $1`, [v1Plain.rows?.[0]?.id]);
check(cExp.length === 1 && cExp[0].s === docId(7), 'v1 still snapshots exactly the 応募時に使う documents');

// Nursery settings through the Poppy job id.
check(Boolean((await as(STRANGER, `select public.hc_employer_set_market_job_document_requirements('${HM_JOB}', '[{"document_type":"resume","requirement":"required"}]')`)).error), 'another facility cannot change this job\'s settings');
check(Boolean((await as(NURSERY_READONLY, `select public.hc_employer_set_market_job_document_requirements('${HM_JOB}', '[{"document_type":"resume","requirement":"required"}]')`)).error), 'a read-only nursery account cannot change settings');
const readOnlyView = await as(NURSERY_READONLY, `select public.hc_employer_get_market_job_document_requirements('${HM_JOB}') r`);
check(readOnlyView.rows?.[0]?.r?.linked === true, 'a read-only nursery account can view settings');
check(Boolean((await as(NURSERY, `select public.hc_employer_set_market_job_document_requirements('${HM_JOB}', '[{"document_type":"resume","requirement":"always"}]')`)).error), 'invalid requirement levels are rejected');
check(Boolean((await as(NURSERY, `select public.hc_employer_set_market_job_document_requirements('${HM_JOB}', '[{"document_type":"resume","requirement":"required"},{"document_type":"resume","requirement":"optional"}]')`)).error), 'duplicate document types are rejected');
const unlinked = await as(NURSERY, `select public.hc_employer_get_market_job_document_requirements('00000000-0000-4000-8000-00000000dead') r`);
check(unlinked.rows?.[0]?.r?.linked === false, 'a Poppy job not synced to Hoiku Color reports linked=false');
const saved = await as(NURSERY, `select public.hc_employer_set_market_job_document_requirements('${HM_JOB}', '[{"document_type":"resume","requirement":"required"},{"document_type":"nurse_license","requirement":"required","note":"写しで可"},{"document_type":"work_history","requirement":"optional"}]') r`);
check(saved.rows?.[0]?.r?.items?.length === 3, 'nursery saves required/optional settings for its job');
const resaved = await as(NURSERY, `select public.hc_employer_set_market_job_document_requirements('${HM_JOB}', '[{"document_type":"resume","requirement":"required"},{"document_type":"nurse_license","requirement":"required","note":"写しで可"}]') r`);
check(resaved.rows?.[0]?.r?.items?.length === 2, 'removing a document from the list removes its requirement');

const candidateView = await as({ sub: A }, `select document_type, requirement, note from public.hc_jobseeker_get_job_document_requirements('${JOB}') order by document_type`);
check(JSON.stringify(candidateView.rows) === JSON.stringify([{ document_type: 'nurse_license', requirement: 'required', note: '写しで可' }, { document_type: 'resume', requirement: 'required', note: null }]), 'candidates see the published job\'s requirements');
await db.exec(`insert into public.hc_job_document_requirements (job_id, document_type, requirement) values ('${JOB_DRAFT}', 'resume', 'required')`);
check((await as({ sub: A }, `select * from public.hc_jobseeker_get_job_document_requirements('${JOB_DRAFT}')`)).rows?.length === 0, 'requirements of unpublished jobs are not readable');

// Server-side enforcement — same rule for v1 and v2.
const v1Blocked = await submitV1(A);
check(errorText(v1Blocked).includes('required documents missing'), 'v1 (old Native) is blocked when a required document is missing');
const v2Blocked = await submitV2(A, [docId(1)]);
check(errorText(v2Blocked).includes('required documents missing'), 'v2 is blocked when a required document is missing');
check((await db.query(`select count(*)::int n from public.hc_applications where job_id = '${JOB}' and jobseeker_clerk_user_id = '${A}'`)).rows[0].n === 0, 'a blocked submission creates no application');
check(errorText(await submitV2(A, [docId(1), docId(5)])).includes('document not found'), 'another candidate\'s document cannot be selected');
check(errorText(await submitV2(A, [docId(1), docId(4)])).includes('one document per type'), 'two documents of the same type are rejected');

// Upload a new licence type (register RPC) and apply with it.
const nurseId = docId(9);
const nursePath = `jobseekers/${A}/${nurseId}/document.png`;
await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('hc-application-documents', $1, '{"size": 70}')`, [nursePath]);
const registered = await as({ sub: A }, `select (public.hc_register_jobseeker_document_source($1, 'nurse_license', '看護師免許証.png', $2, 'image/png', 70)).id::text id`, [nurseId, nursePath]);
check(registered.rows?.[0]?.id === nurseId, 'a 看護師免許証 can be registered after the migration');
check(errorText(await as({ sub: A }, `select public.hc_register_jobseeker_document_source($1, 'driver_license', 'x', $2, 'image/png', 70)`, [docId(10), `jobseekers/${A}/${docId(10)}/document.png`])).includes('invalid document type'), 'unknown document types are still rejected');
const v2Ok = await submitV2(A, [docId(1), nurseId]);
const appId = v2Ok.rows?.[0]?.id;
check(Boolean(appId), 'v2 succeeds once every required document is selected');
const { rows: aExp } = await db.query(`select document_type from public.hc_application_document_expectations where application_id = $1 order by document_type`, [appId]);
check(JSON.stringify(aExp.map((r) => r.document_type)) === JSON.stringify(['nurse_license', 'resume']), 'the expectation snapshot records exactly the selected documents');
const again = await submitV2(A, []);
check(again.rows?.[0]?.id === appId, 'resubmitting returns the same application (idempotent)');
check(errorText(await submitV1(B)).includes('required documents missing'), 'v1 for a candidate whose defaults lack a required type is blocked');

// ---------- Rollback ----------
const blocked = await db.exec(rollbackSql).then(() => null, (error) => error);
check(String(blocked?.message ?? '').includes('ROLLBACK_BLOCKED_NEW_DOCUMENT_TYPES_IN_USE'), 'rollback refuses to run while a new licence type is in use (no data is deleted)');
await db.exec('rollback').catch(() => {});

// Test-only cleanup of rows this test created, then rollback.
await db.exec(`
delete from public.hc_application_document_expectations where application_id in (select id from public.hc_applications where id <> '${EXISTING_APP}');
delete from public.hc_applications where id <> '${EXISTING_APP}';
delete from public.hc_jobseeker_documents where id = '${nurseId}';
delete from storage.objects where name = '${nursePath}';
`);
await db.exec(rollbackSql);
check(JSON.stringify(await dataSnapshot()) === JSON.stringify(baselineData), 'rollback: pre-existing data is unchanged');
const afterCatalog = await catalogSnapshot();
const added = afterCatalog.filter((x) => !baselineCatalog.includes(x));
const removed = baselineCatalog.filter((x) => !afterCatalog.includes(x));
check(added.length === 0 && removed.length === 0, `rollback: catalog identical to baseline${added.length || removed.length ? ` (added ${added.join(' | ')}; removed ${removed.join(' | ')})` : ''}`);
check((await db.query(`select count(*)::int n from supabase_migrations.schema_migrations where version = '20261017101147'`)).rows[0].n === 0, 'rollback removes the migration history row');

// Re-apply after rollback works (idempotent forward path).
const reapply = await db.exec(migrationSql).then(() => true, () => false);
check(reapply, 'migration can be applied again after a rollback');

await db.close();
for (const message of passes) console.log(`ok - ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`not ok - ${message}`);
  process.exit(1);
}
console.log(`jobseeker-qualification-documents-database-contract: ${passes.length} checks passed`);
