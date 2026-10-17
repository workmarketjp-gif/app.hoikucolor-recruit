import { useEffect, useRef } from 'react';
import { PrivateRecruitmentTest, privateTestScope, type TestJob, type TestRpc } from './private-recruitment/PrivateRecruitmentTest';
import { supabase, hasActiveSession } from './lib/supabase';
import {recruitmentTestOrigin} from './private-recruitment/testOrigins';
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
export function PrivateRecruitmentRoute({scopeId,name}:{scopeId:string;name?:string}) {
 return <PrivateRecruitmentTest scopeId={scopeId} rpc={rpc} expectedRole="candidate" name={name} original={original}/>;
}
