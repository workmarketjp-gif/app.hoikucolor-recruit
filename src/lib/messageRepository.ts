import { supabase } from './supabase';

export type MessageThread = {
  id: string;
  application_id: string;
  organization_id: string;
  facility_id: string;
  job_id: string;
  jobseeker_clerk_user_id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type Message = {
  id: string;
  thread_id: string;
  sender_clerk_user_id: string;
  sender_role: 'jobseeker' | 'facility';
  body: string;
  created_at: string;
};

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。Vercelの環境変数を確認してください。');
  return supabase;
}

export async function getOrCreateApplicationThread(applicationId: string): Promise<MessageThread> {
  const { data, error } = await client().rpc('hc_get_or_create_message_thread', {
    p_application_id: applicationId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('メッセージスレッドを取得できませんでした。');
  return data as MessageThread;
}

export async function listApplicationMessages(applicationId: string): Promise<Message[]> {
  const thread = await getOrCreateApplicationThread(applicationId);
  const { data, error } = await client()
    .from('hc_messages')
    .select('id,thread_id,sender_clerk_user_id,sender_role,body,created_at')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as Message[];
}

export async function sendApplicationMessage(applicationId: string, body: string): Promise<Message> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('メッセージを入力してください。');
  if (trimmed.length > 4000) throw new Error('メッセージは4000文字以内で入力してください。');

  const { data, error } = await client().rpc('hc_send_message', {
    p_application_id: applicationId,
    p_body: trimmed,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('メッセージを送信できませんでした。');
  return data as Message;
}
