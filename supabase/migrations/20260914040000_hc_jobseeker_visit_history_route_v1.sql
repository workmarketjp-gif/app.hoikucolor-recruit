-- Candidate-owned visit/trial history read model and exact notification deep links.
-- Re-states the production contract in source so the dedicated /visits route is reproducible.

create or replace function public.hc_jobseeker_list_my_visits()
returns table(
  reservation_id uuid,
  job_id uuid,
  application_id uuid,
  facility_name text,
  job_title text,
  prefecture text,
  city text,
  address text,
  experience_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  candidate_message text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id as reservation_id,
    r.job_id,
    r.application_id,
    f.name as facility_name,
    j.title as job_title,
    f.prefecture,
    f.city,
    f.address,
    r.experience_type,
    r.starts_at,
    r.ends_at,
    r.status,
    r.candidate_message,
    r.confirmed_at,
    r.cancelled_at,
    r.completed_at,
    r.created_at,
    r.updated_at
  from public.hc_visit_reservations r
  join public.hc_jobs j
    on j.id = r.job_id
   and j.organization_id = r.organization_id
   and j.facility_id = r.facility_id
  join public.ho_facilities f
    on f.id = r.facility_id
   and f.organization_id = r.organization_id
  where nullif(ho_private.current_clerk_user_id(), '') is not null
    and r.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()
  order by r.starts_at desc, r.created_at desc
  limit 100;
$$;

revoke all on function public.hc_jobseeker_list_my_visits() from public, anon, authenticated;
grant execute on function public.hc_jobseeker_list_my_visits() to authenticated, service_role;

create or replace function ho_private.hc_visit_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare
  v_facility_name text;
  v_type text;
  v_title text;
  v_label text;
  v_when text;
  v_link text;
begin
  if old.status is not distinct from new.status then return new; end if;
  if new.status not in ('confirmed','declined','cancelled','completed','no_show') then return new; end if;

  select f.name into v_facility_name
  from public.ho_facilities f
  where f.id = new.facility_id;

  v_label := case new.experience_type
    when 'visit' then '園見学'
    when 'half_day_trial' then '半日体験'
    when 'full_day_trial' then '1日体験'
    else '見学・体験'
  end;
  v_when := to_char(new.starts_at at time zone 'Asia/Tokyo','YYYY年MM月DD日 HH24:MI');
  v_type := case new.status
    when 'confirmed' then 'visit_confirmed'
    when 'declined' then 'visit_declined'
    when 'cancelled' then 'visit_cancelled'
    when 'completed' then 'visit_completed'
    else 'visit_no_show'
  end;
  v_title := case new.status
    when 'confirmed' then v_label || 'が確定しました'
    when 'declined' then v_label || 'の日程を調整できませんでした'
    when 'cancelled' then v_label || 'がキャンセルされました'
    when 'completed' then v_label || 'が完了しました'
    else v_label || 'の状況が更新されました'
  end;
  v_link := format('/visits?visit_id=%s#visit-%s', new.id::text, new.id::text);

  perform ho_private.hc_notify_jobseeker(
    new.organization_id,
    new.facility_id,
    new.application_id,
    new.jobseeker_clerk_user_id,
    v_type,
    v_title,
    coalesce(v_facility_name,'園') || '／' || v_when,
    v_link,
    'jobseeker:visit:' || new.id::text || ':' || new.status
  );
  return new;
end;
$$;
