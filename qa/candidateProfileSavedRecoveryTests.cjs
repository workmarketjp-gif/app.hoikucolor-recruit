// Tests the complete real module with mocked data transport. No live user writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const filename=path.join(root,'src/lib/recruitRepository.ts');
const source=fs.readFileSync(process.env.CANDIDATE_RECOVERY_BASELINE||filename,'utf8');
const parsed=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
assert.equal(parsed.parseDiagnostics.length,0);
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const profile=(extra={})=>({clerk_user_id:'server-actor',email:'one@example.invalid',name:'テスト',name_kana:null,phone:null,prefecture:'山形',desired_positions:['保育士'],desired_employment_types:[],qualifications:[],years_of_experience:0,desired_start_date:null,self_intro:null,...extra});
let count=0;async function test(name,fn){await fn();console.log(`ok ${++count} - ${name}`);}
function fixture(responses={}){
 const calls=[],exports={};const transport={from(){throw Error('Forbidden direct table access');},rpc:async(name,args)=>{calls.push({name,args});const result=responses[name];if(typeof result==='function')return result(args,calls);return result===undefined?{data:null,error:null}:result;}};
 vm.runInNewContext(code,{exports,console,Error,Map,Set,Date,Number,Array,URLSearchParams,Promise,require:name=>{
  if(name==='./supabase')return{supabase:transport};
  if(name==='./documentVaultRepository')return{listJobseekerDocuments:async()=>[],attachJobseekerDocumentToApplication:async()=>{}};
  throw Error(name);
 }});return{...exports,calls};
}
const response=data=>({data,error:null});
(async()=>{
 await test('list uses actor-scoped RPC with no client identity',async()=>{const c=fixture({hc_jobseeker_list_saved_job_ids:response([{job_id:A,saved_at:'now',hidden:'private'},{job_id:B}])});assert.deepEqual(Array.from(await c.listSavedJobIds()),[A,B]);assert.equal(c.calls[0].name,'hc_jobseeker_list_saved_job_ids');assert.equal(c.calls[0].args,undefined);});
 await test('empty list remains empty',async()=>{const c=fixture({hc_jobseeker_list_saved_job_ids:response([])});assert.equal((await c.listSavedJobIds()).length,0);});
 await test('duplicate list IDs do not duplicate saved cards',async()=>{const c=fixture({hc_jobseeker_list_saved_job_ids:response([{job_id:A},{job_id:A}])});assert.equal((await c.listSavedJobIds()).length,1);});
 for(const bad of [null,{},[null],[{}],[{job_id:'invalid'}],[{job_id:1}]])await test('malformed saved list is an error',async()=>{const c=fixture({hc_jobseeker_list_saved_job_ids:response(bad)});await assert.rejects(c.listSavedJobIds());});
 for(const value of [true,false]){
  await test(`save ${value} succeeds only with persisted state`,async()=>{const c=fixture({hc_jobseeker_save_job:response(value),hc_jobseeker_list_saved_job_ids:response([{job_id:A}])});await c.saveJob(A,'caller-must-not-be-used');assert.deepEqual(JSON.parse(JSON.stringify(c.calls)),[{name:'hc_jobseeker_save_job',args:{p_job_id:A}},{name:'hc_jobseeker_list_saved_job_ids'}]);});
  await test(`unsave ${value} succeeds only with persisted absence`,async()=>{const c=fixture({hc_jobseeker_unsave_job:response(value),hc_jobseeker_list_saved_job_ids:response([])});await c.unsaveJob(A);assert.deepEqual(JSON.parse(JSON.stringify(c.calls)),[{name:'hc_jobseeker_unsave_job',args:{p_job_id:A}},{name:'hc_jobseeker_list_saved_job_ids'}]);});
 }
 for(const [method,rpc] of [['saveJob','hc_jobseeker_save_job'],['unsaveJob','hc_jobseeker_unsave_job']]){
  await test(method+' rejects bad job before transport',async()=>{const c=fixture();await assert.rejects(c[method]('bad','caller'));assert.equal(c.calls.length,0);});
  await test(method+' propagates backend errors without readback',async()=>{const error={message:'permission denied',code:'42501'};const c=fixture({[rpc]:{data:null,error}});await assert.rejects(c[method](A,'caller'),e=>e===error);assert.equal(c.calls.length,1);});
  await test(method+' rejects malformed success',async()=>{const c=fixture({[rpc]:response({ok:true})});await assert.rejects(c[method](A,'caller'));assert.equal(c.calls.length,1);});
  await test(method+' detects inconsistent readback',async()=>{const c=fixture({[rpc]:response(true),hc_jobseeker_list_saved_job_ids:response(method==='saveJob'?[]:[{job_id:A}])});await assert.rejects(c[method](A,'caller'),/確認できません/);});
  await test(method+' surfaces failed readback',async()=>{const c=fixture({[rpc]:response(true),hc_jobseeker_list_saved_job_ids:{data:null,error:{message:'read failure'}}});await assert.rejects(c[method](A,'caller'));});
 }
 await test('profile read null is first-use no-profile',async()=>{const c=fixture({hc_jobseeker_get_profile:response(null)});assert.equal(await c.getProfile(),null);assert.equal(c.calls[0].args,undefined);});
 await test('profile read uses explicit field projection',async()=>{const c=fixture({hc_jobseeker_get_profile:response(profile({admin_memo:'hidden',organization_id:'hidden'}))});const p=await c.getProfile();assert.equal(p.name,'テスト');assert.equal(p.years_of_experience,0);assert.equal(p.phone,null);assert(!JSON.stringify(p).includes('hidden'));assert.equal(Object.keys(p).length,12);});
 for(const bad of [undefined,[],{},profile({clerk_user_id:''}),profile({name:4}),profile({qualifications:'text'}),profile({desired_positions:[null]}),profile({years_of_experience:Infinity}),profile({years_of_experience:'2'})])await test('malformed profile read fails',async()=>{const c=fixture({hc_jobseeker_get_profile:response(bad)});await assert.rejects(c.getProfile());});
 await test('profile upsert sends only eleven allowed parameters, never identity',async()=>{const c=fixture({hc_jobseeker_upsert_profile:response(profile())});await c.upsertProfile(profile({clerk_user_id:'attacker',updated_at:'fake',role:'admin',extra:true}));const call=c.calls[0];assert.equal(call.name,'hc_jobseeker_upsert_profile');assert.equal(Object.keys(call.args).length,11);assert.deepEqual(JSON.parse(JSON.stringify(call.args)),{p_email:'one@example.invalid',p_name:'テスト',p_name_kana:null,p_phone:null,p_prefecture:'山形',p_desired_positions:['保育士'],p_desired_employment_types:[],p_qualifications:[],p_years_of_experience:0,p_desired_start_date:null,p_self_intro:null});assert(!JSON.stringify(call.args).includes('attacker'));assert(!JSON.stringify(call.args).includes('fake'));});
 await test('profile compatibility keeps empty array defaults',async()=>{const c=fixture({hc_jobseeker_upsert_profile:response(profile())});await c.upsertProfile(profile({desired_positions:null,desired_employment_types:undefined,qualifications:null}));for(const key of ['p_desired_positions','p_desired_employment_types','p_qualifications'])assert.deepEqual(Array.from(c.calls[0].args[key]),[]);});
 await test('null experience is not silently zero',async()=>{const c=fixture({hc_jobseeker_upsert_profile:response(profile({years_of_experience:null}))});await c.upsertProfile(profile({years_of_experience:null}));assert.equal(c.calls[0].args.p_years_of_experience,null);});
 for(const bad of [null,{},true,profile({qualifications:null})])await test('profile write requires a persisted row response',async()=>{const c=fixture({hc_jobseeker_upsert_profile:response(bad)});await assert.rejects(c.upsertProfile(profile()));});
 for(const method of ['getProfile','upsertProfile'])await test(method+' preserves backend failure',async()=>{const err={message:'PROFILE_ERROR'};const c=fixture({[method==='getProfile'?'hc_jobseeker_get_profile':'hc_jobseeker_upsert_profile']:{data:null,error:err}});await assert.rejects(c[method](profile()),e=>e===err);});
 await test('network rejection is propagated',async()=>{const c=fixture({hc_jobseeker_upsert_profile:async()=>{throw Error('offline');}});await assert.rejects(c.upsertProfile(profile()),/offline/);});
 await test('existing application-safe-read RPC remains unchanged',async()=>{const c=fixture({hc_jobseeker_list_applications:response([{id:A}])});assert.equal((await c.listApplications())[0].id,A);assert.equal(c.calls[0].name,'hc_jobseeker_list_applications');});
 console.log(`PASS ${count} actual-module isolated tests. No live database writes, model calls, or browser E2E.`);
})().catch(e=>{console.error(e);process.exit(1);});
