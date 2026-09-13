import { supabase } from './supabase';

export type JobseekerNotification = {
  id: string;
  application_id: string | null;
  notification_type: string;
  title: string;
  body: string;
  link_url: string;
  read_at: string | null;
  created_at: string;
};

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。Cloudflareまたはローカルの環境変数を確認してください。');
  return supabase;
}

export async function listJobseekerNotifications(limit = 30): Promise<JobseekerNotification[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const { data, error } = await client()
    .from('hc_notifications')
    .select('id,application_id,notification_type,title,body,link_url,read_at,created_at')
    .eq('audience', 'jobseeker')
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return (data || []) as JobseekerNotification[];
}

export async function markJobseekerNotificationRead(notificationId: string): Promise<boolean> {
  const { data, error } = await client().rpc('hc_mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  return data === true;
}

export async function markAllJobseekerNotificationsRead(): Promise<number> {
  const { data, error } = await client().rpc('hc_mark_all_notifications_read');
  if (error) throw error;
  return typeof data === 'number' ? data : Number(data || 0);
}
