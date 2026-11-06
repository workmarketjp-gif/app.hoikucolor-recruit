import test from 'node:test';
import assert from 'node:assert/strict';
import { saveGeneratedPdfWithReadback, prepareGeneratedPdfBytes, GENERATED_PDF_MAX_BYTES } from '../src/lib/generatedPdfDocument.ts';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\ntrailer\n%%EOF\n');
const uuid = '00000000-0000-4000-8000-000000000001';
const owner = 'user_testA';
function fixture(overrides = {}) {
  const events = [];
  let current = true;
  let recorded = null;
  const ops = {
    newId: () => uuid,
    upload: async (path, bytes) => { events.push(['upload',path,bytes.byteLength]); },
    register: async (args) => { events.push(['register',args.type,args.title,args.size]); recorded = { id:uuid, jobseeker_clerk_user_id:owner, document_type: args.type, file_path:args.path, is_default:false }; return recorded; },
    readback: async (id) => { events.push(['readback',id]); return recorded; },
    cleanup: async (path) => { events.push(['cleanup',path]); },
    setDefault: async (id) => { events.push(['default',id]); return { ...recorded, is_default:true }; },
    ...overrides,
  };
  return { events, ops, changeOwner: () => {current = false;}, request: {ownerId:owner,type:'resume',bytes:pdf,canContinue:()=>current,operations:ops} };
}

test('PDF bytes are copied from a subarray view and carry a valid EOF', () => {
  const original = Buffer.concat([Buffer.from('junk'),pdf,Buffer.from('junk')]);
  const copy = prepareGeneratedPdfBytes(original.subarray(4,4+pdf.length));
  assert.equal(Buffer.from(copy).equals(pdf),true);
  original.fill(0);
  assert.equal(Buffer.from(copy).equals(pdf),true);
});
test('rejects spoofed, truncated, oversize and empty PDFs before upload', async () => {
  for (const invalid of [Buffer.from('not-pdf'),Buffer.from('%PDF-1.7\nno EOF'),Buffer.alloc(GENERATED_PDF_MAX_BYTES+1),new Uint8Array()]) {
    const {request,events}=fixture();
    await assert.rejects(saveGeneratedPdfWithReadback({...request,bytes:invalid}));
    assert.deepEqual(events,[]);
  }
});
test('successful canonical registration preserves owner/type/path and uses one ID', async () => {
  const {request,events}=fixture();
  const result=await saveGeneratedPdfWithReadback(request);
  assert.equal(result.jobseeker_clerk_user_id,owner);
  assert.equal(result.file_path,'jobseekers/'+owner+'/'+uuid+'/document.pdf');
  assert.deepEqual(events.map(e=>e[0]),['upload','register','readback']);
  assert.equal(events[1][2],'履歴書');
});
test('ambiguous registration is reconciled against exact ID without resubmission', async () => {
  let stored=null;
  const {request,events}=fixture({register:async a=>{events.push(['register']);stored={id:uuid,jobseeker_clerk_user_id:owner,document_type:a.type,file_path:a.path,is_default:false}; throw new Error('timeout');},readback:async id=>{events.push(['readback']);return stored;}});
  const row=await saveGeneratedPdfWithReadback(request);
  assert.equal(row.id,uuid);assert.deepEqual(events.map(e=>e[0]),['upload','register','readback']);
});
test('unregistered upload is cleaned once after confirmed missing row',async()=>{
  const {request,events}=fixture({register:async()=>null,readback:async()=>null});
  await assert.rejects(saveGeneratedPdfWithReadback(request),/登録できません/);
  assert.deepEqual(events.map(e=>e[0]),['upload','cleanup']);
});
test('failed verification cannot report success or delete an ambiguously committed object',async()=>{
  const {request,events}=fixture({register:async()=>{throw new Error('timeout')},readback:async()=>{throw new Error('no network')}});
  await assert.rejects(saveGeneratedPdfWithReadback(request),/保存結果を確認/);
  assert.deepEqual(events.map(e=>e[0]),['upload']);
});
test('session changes before upload or before registration prohibit stale attachment',async()=>{
  let live=false;
  const before=fixture();
  await assert.rejects(saveGeneratedPdfWithReadback({...before.request,canContinue:()=>live}),/QUARANTINED/);
  assert.deepEqual(before.events,[]);
  const mid=fixture({upload:async()=>{mid.events.push(['upload']);live=false;}});
  live=true;
  await assert.rejects(saveGeneratedPdfWithReadback({...mid.request,canContinue:()=>live}),/QUARANTINED/);
  assert.deepEqual(mid.events.map(e=>e[0]),['upload','cleanup']);
});
test('wrong owner, path, type or invalid identifier fail closed',async()=>{
  for(const field of ['jobseeker_clerk_user_id','document_type','file_path']){
    const f=fixture({register:async a=>({...{id:uuid,jobseeker_clerk_user_id:owner,document_type:a.type,file_path:a.path,is_default:false},[field]:'different'}),readback:async()=>null});
    await assert.rejects(saveGeneratedPdfWithReadback(f.request),/(登録できません|保存結果を確認)/);
  }
  const f=fixture({newId:()=> '../unsafe'});
  await assert.rejects(saveGeneratedPdfWithReadback(f.request),/識別子/);
  assert.deepEqual(f.events,[]);
});
test('explicit default is set only after verified registration and readback',async()=>{
  const f=fixture();
  const row=await saveGeneratedPdfWithReadback({...f.request,type:'work_history',makeDefault:true});
  assert.equal(row.document_type,'work_history');
  assert.deepEqual(f.events.map(e=>e[0]),['upload','register','readback','default']);
  assert.equal(f.events[1][2],'職務経歴書');
});

test('successful registration still requires an independent canonical re-read', async () => {
  const f=fixture({readback:async()=>null});
  await assert.rejects(saveGeneratedPdfWithReadback(f.request),/保存結果を確認/);
  assert.deepEqual(f.events.map(e=>e[0]),['upload','register']);
});
test('default is not acknowledged until server returns is_default=true', async () => {
  const f=fixture({setDefault:async id=>{f.events.push(['default',id]);return {id:uuid, jobseeker_clerk_user_id:owner, document_type:'resume',file_path:'jobseekers/'+owner+'/'+uuid+'/document.pdf',is_default:false};}});
  await assert.rejects(saveGeneratedPdfWithReadback({...f.request,makeDefault:true}),/設定を確認/);
  assert.deepEqual(f.events.map(e=>e[0]),['upload','register','readback','default']);
});

test('canonical readback with incorrect ownership is refused even if registration succeeded', async () => {
  const f=fixture({readback:async () => ({id:uuid,jobseeker_clerk_user_id:'user_other',document_type:'resume',file_path:'jobseekers/'+owner+'/'+uuid+'/document.pdf',is_default:false})});
  await assert.rejects(saveGeneratedPdfWithReadback(f.request),/所有者・種類・パス/);
  assert.deepEqual(f.events.map(e=>e[0]),['upload','register']);
});
