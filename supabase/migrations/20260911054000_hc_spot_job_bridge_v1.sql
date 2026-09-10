-- Hoiku Office spot shortage / spot draft -> Hoiku Color bridge.
-- A spot draft is never exposed by HC until the facility explicitly changes
-- the HO source status to published. Closing/resolving the source removes it
-- from HC/Google Jobs immediately.

create or replace function hc_private.hc_sync_spot_job(p_spot_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, hc_private, ho_private, pg_temp
as $$
declare
  v_spot public.ho_spot_job_drafts%rowtype;
  v_shortage public.ho_shift_shortages%rowtype;
  v_hc_status text;
  v_rate integer;
  v_positions integer;
  v_working_hours text;
  v_description text;
  v_closing_at timestamptz;
  v_now_jst timestamp;
begin
  select * into v_spot from public.ho_spot_job_drafts s where s.id=p_spot_job_id;
  if not found then
    update public.hc_jobs set status='archived',published_at=null,updated_by='ho_spot_sync',updated_at=now()
     where source_type='spot_job' and source_id=p_spot_job_id and status<>'archived';
    return;
  end if;

  v_rate:=coalesce(v_spot.hourly_wage,v_spot.hourly_rate);
  v_positions:=greatest(coalesce(v_spot.required_count,1),1);
  v_now_jst:=now() at time zone 'Asia/Tokyo';

  if v_spot.shift_shortage_id is not null then
    select * into v_shortage from public.ho_shift_shortages sh
     where sh.id=v_spot.shift_shortage_id and sh.organization_id=v_spot.organization_id and sh.facility_id=v_spot.facility_id;
    if not found then raise exception using errcode='23514',message='SPOT_SHORTAGE_TENANT_MISMATCH'; end if;
    if v_spot.status='published' and (v_shortage.status<>'open' or coalesce(v_shortage.shortage_count,0)<=0) then
      raise exception using errcode='22023',message='SPOT_SHORTAGE_NOT_OPEN';
    end if;
    if v_shortage.status='open' and coalesce(v_shortage.shortage_count,0)>0 then
      v_positions:=least(v_positions,v_shortage.shortage_count);
    end if;
  end if;

  if v_spot.status='published' then
    if v_spot.work_date is null or v_spot.start_time is null or v_spot.end_time is null then
      raise exception using errcode='22023',message='SPOT_WORK_DATE_AND_TIME_REQUIRED';
    end if;
    if v_spot.end_time<=v_spot.start_time then raise exception using errcode='22023',message='SPOT_END_TIME_MUST_BE_AFTER_START_TIME'; end if;
    if v_rate is null or v_rate<=0 then raise exception using errcode='22023',message='SPOT_HOURLY_RATE_REQUIRED'; end if;
    if (v_spot.work_date+v_spot.start_time)<=v_now_jst then raise exception using errcode='22023',message='SPOT_WORK_START_MUST_BE_IN_FUTURE'; end if;
  end if;

  v_hc_status:=case v_spot.status when 'published' then 'published' when 'cancelled' then 'closed' when 'closed' then 'closed' when 'archived' then 'archived' else 'draft' end;
  if v_spot.work_date is not null and v_spot.start_time is not null then
    v_closing_at:=(v_spot.work_date+v_spot.start_time) at time zone 'Asia/Tokyo';
  else v_closing_at:=null; end if;

  v_working_hours:=nullif(concat_ws(' ',
    case when v_spot.work_date is not null then to_char(v_spot.work_date,'YYYY/MM/DD') end,
    case when v_spot.start_time is not null then to_char(v_spot.start_time,'HH24:MI') end,
    case when v_spot.end_time is not null then '〜'||to_char(v_spot.end_time,'HH24:MI') end
  ),'');
  v_description:=nullif(concat_ws(E'\n',
    nullif(btrim(coalesce(v_spot.job_description,v_spot.description)),''),
    case when nullif(btrim(v_spot.age_group_or_class),'') is not null then '担当: '||btrim(v_spot.age_group_or_class) end,
    nullif(btrim(v_spot.facility_message),'')
  ),'');

  insert into public.hc_jobs(
    organization_id,facility_id,source_type,source_id,title,description,employment_type,salary_type,salary_min,salary_max,salary_note,
    working_hours,holidays,required_qualification,benefits,number_of_positions,status,published_at,closing_at,created_by,updated_by
  ) values(
    v_spot.organization_id,v_spot.facility_id,'spot_job',v_spot.id,
    coalesce(nullif(btrim(v_spot.job_title),''),nullif(btrim(v_spot.title),''),'スポット求人'),coalesce(v_description,''),
    'スポット','hourly',v_rate,v_rate,case when v_rate is not null then '時給 '||to_char(v_rate,'FM999,999,990')||'円' end,
    v_working_hours,null,nullif(btrim(v_spot.required_qualification),''),null,v_positions,
    v_hc_status,case when v_hc_status='published' then now() else null end,v_closing_at,'ho_spot_sync','ho_spot_sync'
  )
  on conflict(facility_id,source_type,source_id) do update set
    organization_id=excluded.organization_id,title=excluded.title,description=excluded.description,employment_type=excluded.employment_type,
    salary_type=excluded.salary_type,salary_min=excluded.salary_min,salary_max=excluded.salary_max,salary_note=excluded.salary_note,
    working_hours=excluded.working_hours,required_qualification=excluded.required_qualification,number_of_positions=excluded.number_of_positions,
    status=excluded.status,published_at=case when excluded.status='published' then coalesce(public.hc_jobs.published_at,excluded.published_at) else null end,
    closing_at=excluded.closing_at,updated_by='ho_spot_sync',updated_at=now();
end;
$$;

revoke all on function hc_private.hc_sync_spot_job(uuid) from public,anon,authenticated;

create or replace function hc_private.hc_sync_spot_job_trigger()
returns trigger language plpgsql security definer set search_path=public,hc_private,ho_private,pg_temp as $$
begin
  if tg_op='DELETE' then
    update public.hc_jobs set status='archived',published_at=null,updated_by='ho_spot_sync',updated_at=now()
     where source_type='spot_job' and source_id=old.id and status<>'archived';
    return old;
  end if;
  perform hc_private.hc_sync_spot_job(new.id);
  return new;
end;
$$;
revoke all on function hc_private.hc_sync_spot_job_trigger() from public,anon,authenticated;
drop trigger if exists hc_sync_ho_spot_job on public.ho_spot_job_drafts;
create trigger hc_sync_ho_spot_job after insert or update or delete on public.ho_spot_job_drafts
for each row execute function hc_private.hc_sync_spot_job_trigger();

create or replace function hc_private.hc_close_spot_jobs_for_resolved_shortage()
returns trigger language plpgsql security definer set search_path=public,hc_private,ho_private,pg_temp as $$
begin
  if new.status<>'open' or coalesce(new.shortage_count,0)<=0 then
    update public.ho_spot_job_drafts s set status='closed',updated_at=now()
     where s.shift_shortage_id=new.id and s.organization_id=new.organization_id and s.facility_id=new.facility_id
       and s.status in('ready','published');
  end if;
  return new;
end;
$$;
revoke all on function hc_private.hc_close_spot_jobs_for_resolved_shortage() from public,anon,authenticated;
drop trigger if exists hc_close_spot_jobs_when_shortage_resolved on public.ho_shift_shortages;
create trigger hc_close_spot_jobs_when_shortage_resolved after insert or update of status,shortage_count on public.ho_shift_shortages
for each row execute function hc_private.hc_close_spot_jobs_for_resolved_shortage();

-- Extend the common ON/OFF contract: for spot jobs the Office source is canonical.
create or replace function public.hc_set_job_publication(p_job_id uuid,p_is_public boolean)
returns public.hc_jobs
language plpgsql
security invoker
set search_path=public,ho_private,hc_private,pg_temp
as $$
declare
  v_job public.hc_jobs%rowtype;
  v_market_source_ok boolean;
  v_actor text;
  v_spot_status text;
begin
  select * into v_job from public.hc_jobs where id=p_job_id;
  if not found then raise exception '求人が見つかりません。' using errcode='P0002'; end if;
  if not ho_private.recruitment_can_write(v_job.facility_id) then raise exception 'この求人を変更する権限がありません。' using errcode='42501'; end if;
  v_actor:=ho_private.current_clerk_user_id();

  if v_job.source_type='spot_job' then
    select s.status into v_spot_status from public.ho_spot_job_drafts s
     where s.id=v_job.source_id and s.organization_id=v_job.organization_id and s.facility_id=v_job.facility_id;
    if not found then raise exception 'Hoiku Office側のスポット求人が見つかりません。' using errcode='P0002'; end if;
    if p_is_public and v_spot_status in('cancelled','closed','archived') then raise exception '終了済みのスポット求人は公開できません。'; end if;
    update public.ho_spot_job_drafts s
       set status=case when p_is_public then 'published' when s.status='published' then 'ready' else s.status end,updated_at=now()
     where s.id=v_job.source_id and s.organization_id=v_job.organization_id and s.facility_id=v_job.facility_id;
    select * into v_job from public.hc_jobs where id=p_job_id;
    return v_job;
  end if;

  if p_is_public then
    if v_job.closing_at is not null and v_job.closing_at<now() then raise exception '募集期限を過ぎた求人は公開できません。'; end if;
    if v_job.source_type='market' then
      select exists(
        select 1 from public.hm_recruitment_jobs m
        join public.ho_market_legacy_links l on l.hm_nursery_id=m.nursery_id and l.status='active'
          and l.organization_id=v_job.organization_id and l.facility_id=v_job.facility_id
        where m.id=v_job.source_id and m.is_published and m.recruitment_status='募集中' and (m.closing_at is null or m.closing_at>=now())
      ) into v_market_source_ok;
      if not coalesce(v_market_source_ok,false) then raise exception 'Hoiku Market側で現在募集中の求人ではないため公開できません。'; end if;
    end if;
    update public.hc_jobs set status='published',published_at=coalesce(v_job.published_at,now()),updated_by=coalesce(v_actor,'hc_publication_switch'),updated_at=now()
     where id=p_job_id returning * into v_job;
  else
    update public.hc_jobs set status='draft',published_at=null,updated_by=coalesce(v_actor,'hc_publication_switch'),updated_at=now()
     where id=p_job_id returning * into v_job;
  end if;
  return v_job;
end;
$$;
revoke all on function public.hc_set_job_publication(uuid,boolean) from public,anon;
grant execute on function public.hc_set_job_publication(uuid,boolean) to authenticated;

do $$ declare v_id uuid; begin
  for v_id in select id from public.ho_spot_job_drafts loop perform hc_private.hc_sync_spot_job(v_id); end loop;
end $$;
