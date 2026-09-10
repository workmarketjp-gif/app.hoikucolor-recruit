create or replace function ho_private.hc_touch_message_thread_private()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  update public.hc_message_threads
     set last_message_at = new.created_at,
         updated_at = new.created_at
   where id = new.thread_id;
  return new;
end;
$$;

revoke all on function ho_private.hc_touch_message_thread_private() from public;

drop trigger if exists hc_messages_touch_thread on public.hc_messages;
create trigger hc_messages_touch_thread
after insert on public.hc_messages
for each row execute function ho_private.hc_touch_message_thread_private();

drop function if exists public.hc_touch_message_thread();

create or replace function public.hc_get_or_create_message_thread(p_application_id uuid)
returns public.hc_message_threads
language plpgsql
security invoker
set search_path = 'public', 'ho_private', 'pg_temp'
as $$
declare
  v_app public.hc_applications%rowtype;
  v_thread public.hc_message_threads%rowtype;
  v_actor text := ho_private.current_clerk_user_id();
begin
  if v_actor is null then
    raise exception 'ログインが必要です。' using errcode = '42501';
  end if;

  select * into v_app from public.hc_applications where id = p_application_id;
  if not found then
    raise exception '応募が見つかりません。' using errcode = 'P0002';
  end if;
  if v_app.jobseeker_clerk_user_id is null then
    raise exception 'この応募は求職者アカウントと連携されていないためメッセージを開始できません。';
  end if;
  if not (v_app.jobseeker_clerk_user_id = v_actor or ho_private.recruitment_can_write(v_app.facility_id)) then
    raise exception 'この応募のメッセージを開始する権限がありません。' using errcode = '42501';
  end if;

  insert into public.hc_message_threads(application_id, organization_id, facility_id, job_id, jobseeker_clerk_user_id)
  values (v_app.id, v_app.organization_id, v_app.facility_id, v_app.job_id, v_app.jobseeker_clerk_user_id)
  on conflict (application_id) do nothing;

  select * into v_thread from public.hc_message_threads where application_id = v_app.id;
  if not found then
    raise exception 'メッセージスレッドを作成できませんでした。';
  end if;
  return v_thread;
end;
$$;

create or replace function public.hc_send_message(p_application_id uuid, p_body text)
returns public.hc_messages
language plpgsql
security invoker
set search_path = 'public', 'ho_private', 'pg_temp'
as $$
declare
  v_thread public.hc_message_threads%rowtype;
  v_message public.hc_messages%rowtype;
  v_actor text := ho_private.current_clerk_user_id();
  v_role text;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_actor is null then
    raise exception 'ログインが必要です。' using errcode = '42501';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'メッセージは1〜4000文字で入力してください。';
  end if;

  v_thread := public.hc_get_or_create_message_thread(p_application_id);
  if v_thread.jobseeker_clerk_user_id = v_actor then
    v_role := 'jobseeker';
  elsif ho_private.recruitment_can_write(v_thread.facility_id) then
    v_role := 'facility';
  else
    raise exception 'このメッセージを送信する権限がありません。' using errcode = '42501';
  end if;

  insert into public.hc_messages(thread_id, sender_clerk_user_id, sender_role, body)
  values (v_thread.id, v_actor, v_role, v_body)
  returning * into v_message;
  return v_message;
end;
$$;

create or replace function public.hc_create_message_template(
  p_facility_id uuid,
  p_name text,
  p_category text,
  p_body text
)
returns public.hc_message_templates
language plpgsql
security invoker
set search_path = 'public', 'ho_private', 'pg_temp'
as $$
declare
  v_facility public.ho_facilities%rowtype;
  v_template public.hc_message_templates%rowtype;
  v_actor text := ho_private.current_clerk_user_id();
  v_name text := trim(coalesce(p_name, ''));
  v_category text := trim(coalesce(p_category, 'general'));
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_actor is null or not ho_private.recruitment_can_write(p_facility_id) then
    raise exception '定型文を作成する権限がありません。' using errcode = '42501';
  end if;
  select * into v_facility from public.ho_facilities where id = p_facility_id and status = 'active';
  if not found then raise exception '施設が見つかりません。' using errcode = 'P0002'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then raise exception '定型文名は1〜80文字で入力してください。'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then raise exception '本文は1〜4000文字で入力してください。'; end if;
  if v_category = '' then v_category := 'general'; end if;

  insert into public.hc_message_templates(organization_id, facility_id, name, category, body, is_active, created_by_clerk_user_id)
  values (v_facility.organization_id, v_facility.id, v_name, v_category, v_body, true, v_actor)
  returning * into v_template;
  return v_template;
end;
$$;

create or replace function public.hc_update_message_template(
  p_template_id uuid,
  p_name text,
  p_category text,
  p_body text,
  p_is_active boolean default true
)
returns public.hc_message_templates
language plpgsql
security invoker
set search_path = 'public', 'ho_private', 'pg_temp'
as $$
declare
  v_existing public.hc_message_templates%rowtype;
  v_template public.hc_message_templates%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_category text := trim(coalesce(p_category, 'general'));
  v_body text := trim(coalesce(p_body, ''));
begin
  select * into v_existing from public.hc_message_templates where id = p_template_id;
  if not found then raise exception '定型文が見つかりません。' using errcode = 'P0002'; end if;
  if not ho_private.recruitment_can_write(v_existing.facility_id) then
    raise exception '定型文を変更する権限がありません。' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then raise exception '定型文名は1〜80文字で入力してください。'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then raise exception '本文は1〜4000文字で入力してください。'; end if;
  if v_category = '' then v_category := 'general'; end if;

  update public.hc_message_templates
     set name = v_name, category = v_category, body = v_body, is_active = coalesce(p_is_active, true), updated_at = now()
   where id = p_template_id
   returning * into v_template;
  return v_template;
end;
$$;

create or replace function public.hc_seed_default_message_templates(p_facility_id uuid)
returns setof public.hc_message_templates
language plpgsql
security invoker
set search_path = 'public', 'ho_private', 'pg_temp'
as $$
declare
  v_facility public.ho_facilities%rowtype;
  v_actor text := ho_private.current_clerk_user_id();
begin
  if v_actor is null or not ho_private.recruitment_can_write(p_facility_id) then
    raise exception '定型文を準備する権限がありません。' using errcode = '42501';
  end if;
  select * into v_facility from public.ho_facilities where id = p_facility_id and status = 'active';
  if not found then raise exception '施設が見つかりません。' using errcode = 'P0002'; end if;

  insert into public.hc_message_templates(organization_id, facility_id, name, category, body, is_active, created_by_clerk_user_id)
  select v_facility.organization_id, v_facility.id, x.name, x.category, x.body, true, v_actor
  from (values
    ('応募受付','application','ご応募ありがとうございます。内容を確認のうえ、担当者よりご連絡いたします。'),
    ('見学のご案内','tour','ご応募ありがとうございます。まずは園見学はいかがでしょうか。ご希望の日時をいくつかお知らせください。'),
    ('面接日程のご案内','interview','面接の日程を調整させていただきます。ご都合の良い日時をいくつかお知らせください。'),
    ('履歴書提出のお願い','document','選考にあたり、履歴書のご提出をお願いいたします。Hoiku Colorの応募画面からアップロードできます。'),
    ('保育士証提出のお願い','document','資格確認のため、保育士証のご提出をお願いいたします。Hoiku Colorの応募画面からアップロードできます。'),
    ('面接前日のご確認','interview','明日は面接予定日です。お気をつけてお越しください。ご不明点があればこのメッセージからご連絡ください。'),
    ('内定のご連絡','offer','選考の結果、ぜひ当園でご一緒いただきたく、内定のご連絡を差し上げます。詳細をご確認のうえ、ご意思をお知らせください。'),
    ('選考結果のご連絡','result','このたびはご応募いただき、ありがとうございました。慎重に選考した結果、今回は採用を見送らせていただくこととなりました。')
  ) as x(name, category, body)
  where not exists (
    select 1 from public.hc_message_templates t
    where t.facility_id = v_facility.id and t.name = x.name
  );

  return query
  select * from public.hc_message_templates t
   where t.facility_id = v_facility.id and t.is_active
   order by t.created_at, t.name;
end;
$$;

revoke all on function public.hc_get_or_create_message_thread(uuid) from public, anon;
revoke all on function public.hc_send_message(uuid,text) from public, anon;
revoke all on function public.hc_create_message_template(uuid,text,text,text) from public, anon;
revoke all on function public.hc_update_message_template(uuid,text,text,text,boolean) from public, anon;
revoke all on function public.hc_seed_default_message_templates(uuid) from public, anon;
grant execute on function public.hc_get_or_create_message_thread(uuid) to authenticated;
grant execute on function public.hc_send_message(uuid,text) to authenticated;
grant execute on function public.hc_create_message_template(uuid,text,text,text) to authenticated;
grant execute on function public.hc_update_message_template(uuid,text,text,text,boolean) to authenticated;
grant execute on function public.hc_seed_default_message_templates(uuid) to authenticated;