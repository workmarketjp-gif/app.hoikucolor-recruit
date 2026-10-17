import { useEffect, useRef, useState, type ReactNode } from 'react';
import './PrivateRecruitmentTest.css';

export type TestJob = { id: string; title: string; description: string; conditions: Record<string, string>; presentation: 'standard' | 'original'; site_payload: unknown; accepting: boolean };
type TestApplication = { id: string; job_id: string; applicant_name: string; status: string };
type TestMessage = { id: string; application_id: string; sender_role: string; body: string };
type Snapshot = { scope: { id: string; label: string; facility_id: string }; role: 'candidate' | 'nursery'; jobs: TestJob[]; applications: TestApplication[]; messages: TestMessage[] };
export type TestRpc = (args: { p_action: string; p_scope_id: string; p_job_id?: string; p_application_id?: string; p_body?: Record<string, unknown> }) => Promise<unknown>;
const labels: Record<string, string> = {new:'応募済み',reviewing:'書類確認中',interview:'面接予定',offered:'内定',rejected:'選考終了',withdrawn:'辞退'};
const next: Record<string,string[]> = {new:['reviewing','rejected'],reviewing:['interview','rejected'],interview:['offered','rejected']};
export function privateTestScope(path: string) {
 return path.match(/\/(?:jobs|color)\/test\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i)?.[1] || null;
}
export function PrivateRecruitmentTest({ scopeId, rpc, expectedRole, name = '', original }: {
 scopeId: string; rpc: TestRpc; expectedRole: 'candidate'|'nursery'; name?: string; original?: (job: TestJob, applied: boolean) => ReactNode;
}) {
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [error,setError]=useState('');
 const [pending,setPending]=useState(false);
 const [jobId,setJobId]=useState(new URLSearchParams(location.search).get('job_id')||'');
 const [appId,setAppId]=useState('');
 const [applicant,setApplicant]=useState(name);
 const [message,setMessage]=useState('');
 const [status,setStatus]=useState('');
 const nonce=useRef<string|null>(null);
 const busy=useRef(false);
 const mounted=useRef(true);
 const revision=useRef(0);
 const refresh=async()=>{
  const version=++revision.current;
  try{
   const value=await rpc({p_action:'snapshot',p_scope_id:scopeId}) as Snapshot;
   if(value.role!==expectedRole || value.scope.id!==scopeId || !Array.isArray(value.jobs) || !Array.isArray(value.applications) || !Array.isArray(value.messages))throw Error('Invalid snapshot');
   if(mounted.current && version===revision.current){setSnapshot(value);setError('');}
  }catch{if(mounted.current && version===revision.current){setSnapshot(null);setError('表示できませんでした。利用権限と接続を確認して、もう一度お試しください。');}}
 };
 useEffect(()=>{
  mounted.current=true;
  const robots=document.createElement('meta');robots.name='robots';robots.content='noindex,nofollow,noarchive';document.head.append(robots);
  document.title='非公開の採用テスト';
  void refresh();
  const timer=setInterval(()=>{if(!busy.current)void refresh();},15000);
  return()=>{mounted.current=false;revision.current++;clearInterval(timer);robots.remove();};
 // The authenticated route is remounted whenever identity or scope changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scopeId,rpc,expectedRole]);
 const mutate=async(action:string,body:Record<string,unknown>)=>{
  if(busy.current)return;
  busy.current=true;setPending(true);setError('');
  try{
   const result=await rpc({p_action:action,p_scope_id:scopeId,p_job_id:job?.id,p_application_id:application?.id,p_body:body}) as {application_id?:string};
   if(result.application_id)setAppId(result.application_id);
   if(action==='send'){setMessage('');nonce.current=null;}
   setStatus('');await refresh();
  }catch{setError('操作を完了できませんでした。更新して現在の状態を確認してください。');}
  finally{busy.current=false;if(mounted.current)setPending(false);}
 };
 const job=snapshot?.jobs.find(j=>j.id===jobId) || snapshot?.jobs[0];
 const applications=snapshot?.applications.filter(a=>expectedRole==='nursery'||a.job_id===job?.id)||[];
 const application=applications.find(a=>a.id===appId)||applications[0];
 return <main className="recruitment-test">
  <header><p className="recruitment-test-label">非公開テスト・正式な応募集計には含まれません</p><h1>{snapshot?.scope.label||'採用テスト'}</h1>
   <button type="button" disabled={pending} onClick={()=>void refresh()}>更新する</button></header>
  {error&&<p role="alert">{error}</p>}
  {!snapshot&&!error&&<p role="status">確認しています…</p>}
  {snapshot&&<>
   {expectedRole==='candidate'&&<>
    <label>募集要項<select aria-label="募集要項" value={job?.id||''} onChange={e=>{setJobId(e.target.value);setAppId('');setStatus('');setMessage('');nonce.current=null;}}>{snapshot.jobs.map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></label>
    {job&&<section aria-label="募集要項">
     {job.presentation==='original'&&original ? original(job,Boolean(application)) : <><h2>{job.title}</h2><p className="recruitment-test-copy">{job.description}</p><dl>{Object.entries(job.conditions).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></>}
     {!application&&<form onSubmit={e=>{e.preventDefault();void mutate('apply',{applicant_name:applicant});}}>
      <label>お名前<input value={applicant} onChange={e=>setApplicant(e.target.value)} required maxLength={100} autoComplete="name"/></label>
      <button disabled={pending||!job.accepting||!applicant.trim()}>{job.accepting?'このテスト求人に応募する':'受付を終了しました'}</button>
     </form>}
    </section>}
   </>}
   {expectedRole==='nursery'&&<section><h2>テスト応募の受信一覧</h2>
    {!applications.length&&<p>テスト応募はまだありません。</p>}
    {applications.map(a=><button type="button" key={a.id} aria-pressed={application?.id===a.id} onClick={()=>{setAppId(a.id);setMessage('');nonce.current=null;setStatus('');}}>
      {a.applicant_name} ／ {snapshot.jobs.find(j=>j.id===a.job_id)?.title} ／ {labels[a.status]}</button>)}
   </section>}
   {application&&<section aria-label="テスト応募の詳細"><h2>{application.applicant_name}さんの応募</h2><p role="status">選考状況：{labels[application.status]}</p>
    {expectedRole==='nursery'&&next[application.status]&&<form onSubmit={e=>{e.preventDefault();void mutate('status',{status,expected_status:application.status});}}>
     <label>次の選考状況<select aria-label="次の選考状況" required value={status} onChange={e=>setStatus(e.target.value)}><option value="">選択してください</option>{next[application.status].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label>
     <button disabled={pending||!status}>選考状況を変更する</button></form>}
    <h3>メッセージ</h3><ol className="recruitment-test-messages">{snapshot.messages.filter(m=>m.application_id===application.id).map(m=><li key={m.id}><strong>{m.sender_role==='nursery'?'園から':'応募者から'}</strong><p>{m.body}</p></li>)}</ol>
    {!['rejected','withdrawn'].includes(application.status)&&<form onSubmit={e=>{e.preventDefault();nonce.current ||= crypto.randomUUID();void mutate('send',{message,client_message_id:nonce.current});}}>
     <label>メッセージ<textarea value={message} onChange={e=>{setMessage(e.target.value);nonce.current=null;}} required maxLength={4000}/></label>
     <button disabled={pending||!message.trim()}>メッセージを送る</button></form>}
   </section>}
  </>}
 </main>;
}
