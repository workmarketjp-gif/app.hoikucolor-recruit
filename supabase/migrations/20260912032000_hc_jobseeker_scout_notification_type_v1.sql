alter table public.hc_notifications drop constraint if exists hc_notifications_notification_type_check;
alter table public.hc_notifications add constraint hc_notifications_notification_type_check check (notification_type = any (array[
  'application_created'::text,
  'application_status_changed'::text,
  'interview_scheduled'::text,
  'interview_cancelled'::text,
  'application_hired'::text,
  'message_received'::text,
  'visit_confirmed'::text,
  'visit_declined'::text,
  'visit_cancelled'::text,
  'visit_completed'::text,
  'visit_no_show'::text,
  'spot_confirmed'::text,
  'scout_received'::text
]));
