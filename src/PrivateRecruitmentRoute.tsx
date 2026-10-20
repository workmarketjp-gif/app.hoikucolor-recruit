import { useCallback, useEffect, useRef } from 'react';
import { PrivateRecruitmentTest, privateTestScope, type TestApplyResult, type TestDocument, type TestJob, type TestRpc } from './private-recruitment/PrivateRecruitmentTest';
import { supabase, hasActiveSession } from './lib/supabase';
import {recruitmentTestOrigin} from './private-recruitment/testOrigins';
import { ApplyDocumentsStep } from './components/ApplyDocumentsStep';
import { copyVaultDocumentToTestApplication, listJobseekerDocuments } from './lib/documentVaultRepository';
import { documentTypeLabel, normalizeRequirements } from './lib/documentTypes';
const poppyOrigin=recruitmentTestOrigin(import.meta.env.VITE_HOIKU_POPPY_URL,'https://app.hoikupoppy.ai');
export { privateTestScope };
const rpc: TestRpc = async args => {
 if (!supabase || !hasActiveSession()) throw Error('Authentication unavailable');
 const {data,error}=await supabase.rpc('hc_recruitment_test',args);
 if(error)throw error;
 return data;
};
export function OriginalRecruitmentTest({job,applied}:{job:TestJob;applied:boolean}) {
 const frame=useRef<HTMLIFrameElement>(null);
 useEffect(()=>{
  const send=()=>frame.current?.contentWindow?.postMessage({kind:'poppy-test-render',job:{title:job.title,description:job.description,conditions:job.conditions},payload:job.site_payload,applied},poppyOrigin);
  const receive=(event:MessageEvent)=>{
   if(event.origin!==poppyOrigin||event.source!==frame.current?.contentWindow)return;
   if(event.data?.kind==='poppy-test-renderer-ready')send();
   if(event.data?.kind==='poppy-test-apply')document.querySelector<HTMLInputElement>('.recruitment-test input[autocomplete="name"]')?.focus();
  };
  window.addEventListener('message',receive);send();return()=>window.removeEventListener('message',receive);
 },[job,applied]);
 return <iframe key={job.id} ref={frame} title="園のオリジナル採用ページ" src={`${poppyOrigin}/market/recruitment-test-renderer`} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer"/>;
}
const original=(job:TestJob,applied:boolean)=><OriginalRecruitmentTest job={job} applied={applied}/>;

// The same document step as normal applications, with the test job's own requirements.
const documentStep=({job,pending,submit}:{job:TestJob;pending:boolean;submit:(documentIds:string[])=>void})=>{
 const items=normalizeRequirements(job.document_requirements);
 return <ApplyDocumentsStep key={job.id} jobId={job.id} loadRequirements={()=>Promise.resolve({configured:items.length>0,items})} submitDocuments={submit} externalPending={pending}/>;
};

function CandidateTestDocuments({documents}:{documents:TestDocument[]}) {
 if(!documents.length)return <p>この応募に書類は付けていません。</p>;
 return <ul className="recruitment-test-documents">{documents.map(d=><li key={d.id}>{documentTypeLabel(d.document_type)}：{d.title}（{d.attached?'提出済み':'提出が完了していません'}）</li>)}</ul>;
}

export function PrivateRecruitmentRoute({scopeId,name}:{scopeId:string;name?:string}) {
 // Copy each chosen vault file to the path the lane registered, then let the lane verify and
 // register it. Re-running is safe: finished copies are skipped and existing copies are reused.
 const afterApply=useCallback(async(result:TestApplyResult)=>{
  const pending=(result.documents||[]).filter(d=>!d.attached);
  if(!pending.length)return;
  const vault=new Map((await listJobseekerDocuments()).map(d=>[d.id,d]));
  let failed=0;
  for(const d of pending){
   const source=vault.get(d.source_jobseeker_document_id);
   try{
    if(!source)throw Error('source missing');
    await copyVaultDocumentToTestApplication(source,d.file_path);
    await rpc({p_action:'document_attached',p_scope_id:scopeId,p_application_id:result.application_id,p_body:{document_id:d.id}});
   }catch{failed++;}
  }
  if(failed)throw Error('document handoff incomplete');
 },[scopeId]);
 return <PrivateRecruitmentTest scopeId={scopeId} rpc={rpc} expectedRole="candidate" name={name} original={original}
  documentStep={documentStep} afterApply={afterApply} renderDocuments={documents=><CandidateTestDocuments documents={documents}/>}/>;
}
