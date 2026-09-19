import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const migration = read('supabase/migrations/20260919030306_hc_jobseeker_message_safe_read_v1.sql');
const repository = read('src/lib/messageRepository.ts');

for (const marker of [
  'public.hc_jobseeker_list_application_messages(',
  "nullif((select auth.jwt()) ->> 'sub', '')",
  "a.source_type = 'hoiku_color_jobseeker'",
  'a.jobseeker_clerk_user_id = v_actor',
  "raise exception 'APPLICATION_NOT_FOUND'",
  'if v_thread_id is null then',
  'select m.id, m.thread_id, m.sender_role, m.body, m.created_at',
  'to authenticated',
]) {
  if (!migration.includes(marker)) {
    throw new Error(`Message safe-read migration contract missing: ${marker}`);
  }
}
if (migration.includes('m.sender_clerk_user_id')) {
  throw new Error('Candidate message safe-read must not expose facility/staff Clerk identity.');
}

const messageTypeStart = repository.indexOf('export type Message = {');
const messageTypeEnd = repository.indexOf('};', messageTypeStart);
const messageType = repository.slice(messageTypeStart, messageTypeEnd + 2);
if (messageType.includes('sender_clerk_user_id')) {
  throw new Error('Candidate Message type must not include sender_clerk_user_id.');
}

const listStart = repository.indexOf('export async function listApplicationMessages');
const sendStart = repository.indexOf('export async function sendApplicationMessage');
const listBody = repository.slice(listStart, sendStart);
if (!listBody.includes("rpc('hc_jobseeker_list_application_messages'")) {
  throw new Error('Candidate message reads must use hc_jobseeker_list_application_messages.');
}
if (listBody.includes(".from('hc_messages')") || listBody.includes('getOrCreateApplicationThread(')) {
  throw new Error('Candidate message read must not use direct table SELECT or write-on-read thread creation.');
}
if (!repository.includes("rpc('hc_send_message'")) {
  throw new Error('Existing shared message-send contract must remain hc_send_message.');
}

console.log('jobseeker message safe-read / minimal-PII contract passed');
