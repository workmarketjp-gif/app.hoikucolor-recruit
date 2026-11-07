import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getJobseekerAttentionSummary, nativeAttentionMessageHref } from '../src/lib/attentionApi.ts';
import { buildMessageInbox } from '../src/lib/messageInbox.ts';
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';

test('real existing attention API adapter calls the canonical candidate RPC',async()=>{
  let called=[];
  const client={rpc:async(name)=>{called.push(name);return {data:{unanswered_interviews_count:0,unread_messages_count:4,pending_scouts_count:1,next_message:{application_id:A}},error:null}}};
  const attention=await getJobseekerAttentionSummary(client);
  assert.deepEqual(called,['hc_jobseeker_attention_summary']);
  assert.equal(attention.unread_messages_count,4);
  assert.equal(nativeAttentionMessageHref(attention),`/application/${A}?focus=messages`);
  const inbox=buildMessageInbox([{id:A,status:'applied',facility_name:'合成園',job_title:'保育士',updated_at:'2026-11-04T00:00:00Z'}],attention);
  assert.equal(inbox.rows[0].hasNewestUnread,true);
});
test('real adapter error cannot be misrepresented as empty unread',async()=>{
  const client={rpc:async()=>({data:null,error:{code:'403',message:'Forbidden'}})};
  await assert.rejects(()=>getJobseekerAttentionSummary(client));
  const inbox=buildMessageInbox([],null);
  assert.equal(inbox.unreadCount,null);
});
test('real adapter fallback href never navigates to arbitrary IDs',()=>{
  const s={next_message:{application_id:'not-uuid'}};
  assert.equal(nativeAttentionMessageHref(s),'/(tabs)/applications');
  const inbox=buildMessageInbox([{id:B,status:'applied',facility_name:'園',job_title:'求人',updated_at:'2026-11-04T00:00:00Z'}],{unread_messages_count:1,pending_scouts_count:0,next_message:{application_id:A}});
  assert.equal(inbox.newestApplicationId,null);
});
