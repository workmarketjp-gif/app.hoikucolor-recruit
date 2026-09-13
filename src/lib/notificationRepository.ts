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
  if (!supabase) throw new Error('Supabase\u306e\u63a5\u7d9a\u8a2d\u5b9a\u304c\u3042\u308a\u307e\u305b\u3093\u3002Cloudflare\u307e\u305f\u306f\u30ed\u30fc\u30ab\u30eb\u306e\u74b0\u5883\u5909\u6570\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  return supabase;
}

export async function listJobseekerNotifications(limit = 30): Promise<JobseekerNotification[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const { data, error } = await client().rpc('hc_jobseeker_list_notifications', {
    p_limit: safeLimit,
  });
  if (error) throw error;
  return (data || []) as JobseekerNotification[];
}

export async function markJobseekerNotificationRead(notificationId: string): Promise<boolean> {
  const { data, error } = await client().rpc('hc_jobseeker_mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  return data === true;
}

export async function markAllJobseekerNotificationsRead(): Promise<number> {
  const { data, error } = await client().rpc('hc_jobseeker_mark_all_notifications_read');
  if (error) throw error;
  return typeof data === 'number' ? data : Number(data || 0);
}
