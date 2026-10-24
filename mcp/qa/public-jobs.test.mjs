import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicChildcareJob, listPublicChildcareJobFilters, searchPublicChildcareJobs, publicJobToolDefinitions, publicCatalogToolHandlers } from '../public-jobs.mjs';
const t = Date.parse('2026-10-16T03:00:00Z');
const uid = '11111111-1111-4111-8111-000000000001';
const job = {
  id: uid, facility_name: '公開園', organization_name: '公開法人', title: '保育士募集', description: '通常の仕事内容',
  prefecture: '東京都', city: '新宿区', employment_type: 'full_time', salary_min: 210000, salary_max: 300000,
  published_at: '2026-10-10T00:00:00Z', closing_at: '2026-10-31T00:00:00Z',
  source_last_verified_at: null, is_external: false, verified_workplace: { verified_metric_count: 2 },
  applicant_email: 'PRIVATE@example.com', service_role_key: 'NEVER_EMIT', candidate_notes: 'private',
};
const makeFetch = (rows, status = 200, opts = {}) => async (url, init) => {
  opts.calls?.push({ url, init });
  return { ok: status === 200, status, headers: { get: () => null }, json: async () => rows };
};
const config = (rows, opts = {}) => ({
  supabaseUrl: 'https://kcmmpjyngcysdfbumchk.supabase.co',
  publishableKey: 'sb_publishable_mock_public_key',
  fetcher: makeFetch(rows, opts.status ?? 200, opts), now: () => t,
});

test('read-only tool schemas advertise no write actions', () => {
  assert.deepEqual(publicJobToolDefinitions.map(x => x.name), ['search_public_childcare_jobs','list_public_childcare_job_filters','get_public_childcare_job']);
  for (const tool of publicJobToolDefinitions) assert.equal(tool.annotations.readOnlyHint, true);
  assert.deepEqual(Object.keys(publicCatalogToolHandlers(config([]))), ['search_public_childcare_jobs','list_public_childcare_job_filters','get_public_childcare_job']);
});
test('uses public v2 RPC only with published anon key and bounded filters', async () => {
  const calls=[]; const result = await searchPublicChildcareJobs({keyword:'保育士',prefecture:'東京都',employment_type:'full_time',limit:10,offset:3},config([{ ...job, total_count: 245 }], {calls}));
  assert.equal(result.reported_total,245); assert.equal(result.returned,1);
  const req=calls[0]; assert.equal(new URL(req.url).pathname,'/rest/v1/rpc/hc_public_search_jobs_v2');
  assert.match(new URL(req.url).searchParams.get('select'),/total_count/);
  assert.deepEqual(JSON.parse(req.init.body),{p_query:'保育士',p_prefecture:'東京都',p_employment_type:'full_time',p_ho_verified:false,p_limit:10,p_offset:3});
  assert.equal(req.init.headers.apikey,'sb_publishable_mock_public_key');assert.equal(req.init.headers.Authorization,undefined);
  assert.equal(JSON.stringify(result).includes('PRIVATE@example.com'),false);
  assert.equal(JSON.stringify(result).includes('NEVER_EMIT'),false);
  assert.equal(JSON.stringify(result).includes('candidate_notes'),false);
  assert.equal(result.jobs[0].url,`https://hoikucolor.jp/jobs/${uid}`);
});
test('rejects broad or invalid input instead of silently widening query', async () => {
  const checks=[{limit:100},{limit:0},{offset:-1},{offset:1001},{keyword:'x'.repeat(101)},{keyword:'a\nb'},{prefecture:99},{other:'x'}];
  for (const arg of checks) await assert.rejects(searchPublicChildcareJobs(arg,config([])));
  await assert.rejects(getPublicChildcareJob({job_id:'../../admin'},config([])));
});
test('fails closed on source errors and cannot use secret/service-role keys', async () => {
  await assert.rejects(searchPublicChildcareJobs({},config([], {status:503})),/PUBLIC_JOB_SOURCE_HTTP_503/);
  await assert.rejects(searchPublicChildcareJobs({}, {...config([]),publishableKey:'sb_secret_forbidden'}),/PUBLIC_KEY_MUST_BE_ANON/);
  await assert.rejects(searchPublicChildcareJobs({}, {...config([]),supabaseUrl:'http://internal.example.org'}),/SUPABASE_URL_NOT_ALLOWED/);
  await assert.rejects(searchPublicChildcareJobs({}, {...config([]),supabaseUrl:'https://evil.supabase.co.evil.test'}),/SUPABASE_URL_NOT_ALLOWED/);
  await assert.rejects(searchPublicChildcareJobs({}, {...config([]),fetcher:async()=>{throw Error('network')}}),/PUBLIC_JOB_SOURCE_UNAVAILABLE/);
  await assert.rejects(searchPublicChildcareJobs({}, {...config([]),fetcher:makeFetch({ok:true})}),/PUBLIC_JOB_SOURCE_INVALID_SHAPE/);
});
test('suppresses expired, unpublished and stale external rows', async () => {
  const expired={...job,id:'11111111-1111-4111-8111-000000000002',closing_at:'2026-10-01T00:00:00Z'};
  const future={...job,id:'11111111-1111-4111-8111-000000000003',published_at:'2026-10-30T00:00:00Z'};
  const staleExternal={...job,id:'11111111-1111-4111-8111-000000000004',is_external:true,source_last_verified_at:'2026-10-13T00:00:00Z'};
  const recentExternal={...job,id:'11111111-1111-4111-8111-000000000005',is_external:true,source_name:'ハローワーク',source_last_verified_at:'2026-10-16T01:00:00Z'};
  const result=await searchPublicChildcareJobs({},config([{...job,total_count:6},expired,future,staleExternal,recentExternal]));
  assert.equal(result.returned,2);assert.equal(result.reported_total,6);
  assert.deepEqual(result.jobs.map(j=>j.id),[uid,recentExternal.id]);
  assert.equal(result.jobs[1].source_name,'ハローワーク');
});
test('never promotes expired external info with missing verification time',async()=>{
  const row={...job,is_external:true,source_last_verified_at:null};
  assert.equal((await searchPublicChildcareJobs({},config([row]))).returned,0);
});
test('exact lookup is public-only, uuid-restricted and has no private data', async () => {
  const calls=[];
  const result=await getPublicChildcareJob({job_id:uid},config([job],{calls}));
  assert.equal(result.job.id,uid);assert.equal(result.job.description,'通常の仕事内容');
  const request=calls[0];assert.equal(request.init.method,'GET');assert.equal(new URL(request.url).pathname,'/rest/v1/hc_public_job_feed_v2');
  assert.equal(new URL(request.url).searchParams.get('id'),`eq.${uid}`);
  assert.equal(new URL(request.url).searchParams.get('select').includes('verified_workplace'),false);
  assert.equal(new URL(request.url).searchParams.get('select').includes('total_count'),false);
  assert.equal(JSON.stringify(result).includes('PRIVATE@example.com'),false);
});
test('nonexistent, expired and unknown-status details return null', async () => {
  assert.equal((await getPublicChildcareJob({job_id:uid},config([]))).job,null);
  assert.equal((await getPublicChildcareJob({job_id:uid},config([{...job,closing_at:'2026-10-01T00:00:00Z'}]))).job,null);
  assert.equal((await getPublicChildcareJob({job_id:uid},config([{...job,is_external:null}]))).job,null);
});
test('empty public results are preserved as empty, without synthetic fixtures', async () => {
  const result=await searchPublicChildcareJobs({},config([]));
  assert.deepEqual(result.jobs,[]);assert.equal(result.reported_total,0);
});
test('verified metadata outputs boolean only, not any private workforce metrics', async () => {
  const data={...job,verified_workplace:{verified_metric_count:7,verified_metrics:{salary:'SECRET'}}};
  const result=await searchPublicChildcareJobs({},config([data]));
  assert.equal(result.jobs[0].has_verified_workplace_metrics,true);
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
});

test('detail without verified profile projection does not falsely report unverified', async () => {
  const { verified_workplace: _hidden, ...viewRow } = job;
  const result = await getPublicChildcareJob({job_id:uid},config([viewRow]));
  assert.equal(result.job.has_verified_workplace_metrics,null);
});

test('public facets tool uses existing anonymous v2 RPC and excludes unexpected data', async () => {
  const calls=[];
  const data={prefectures:['東京都','大阪府','東京都'],employment_types:['full_time','part_time'],email:'SECRET@internal.test'};
  const result=await listPublicChildcareJobFilters({},config(data,{calls}));
  assert.deepEqual(result.prefectures,['東京都','大阪府']);
  assert.deepEqual(result.employment_types,['full_time','part_time']);
  assert.equal(JSON.stringify(result).includes('SECRET@internal.test'),false);
  assert.equal(new URL(calls[0].url).pathname,'/rest/v1/rpc/hc_public_job_search_facets_v2');
  assert.equal(calls[0].init.method,'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body),{});
  assert.equal(calls[0].init.headers.Authorization,undefined);
});

test('facets accept one-row table, empty rows and zero active job catalog', async () => {
  const r=await listPublicChildcareJobFilters({},config([{prefectures:[],employment_types:[]}]));
  assert.deepEqual(r.prefectures,[]);
  assert.deepEqual((await listPublicChildcareJobFilters({},config([]))).employment_types,[]);
});

test('facets reject malformed data, admin keys and arbitrary model arguments', async () => {
  const bad=[{prefectures:'Tokyo',employment_types:[]},{prefectures:['東京都\nABC'],employment_types:[]},
    {prefectures:Array.from({length:48},(_,i)=>'県'+i),employment_types:[]},{prefectures:[],employment_types:['x'.repeat(51)]},
    {prefectures:[],employment_types:[],count:1}];
  for (const item of bad.slice(0,4)) await assert.rejects(listPublicChildcareJobFilters({},config(item)));
  // Extra backend fields must be ignored; model arguments must not override config.
  assert.deepEqual((await listPublicChildcareJobFilters({},config(bad[4]))).prefectures,[]);
  await assert.rejects(listPublicChildcareJobFilters({serviceKey:'malicious'},config([])),/UNSUPPORTED_ARGUMENT/);
  await assert.rejects(listPublicChildcareJobFilters({}, {...config([]),publishableKey:'sb_secret_forbidden'}),/PUBLIC_KEY_MUST_BE_ANON/);
});
