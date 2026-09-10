-- Hoiku Market -> Hoiku Color canonical job sync.
-- HM supplies rich recruitment content. HC keeps an independent publication switch:
-- imported HM jobs start as draft and never become public until an authorized
-- facility user explicitly turns the HC job ON.

create or replace function ho_private.hc_sync_hm_recruitment_job(p_hm_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_job public.hm_recruitment_jobs%rowtype;
  v_link record;
  v_source_eligible boolean;
  v_working_hours text;
  v_benefits text;
begin
  select * into v_job
  from public.hm_recruitment_jobs
  where id = p_hm_job_id;

  if not found then
    update public.hc_jobs
       set status = 'archived', published_at = null, updated_by = 'hm_sync', updated_at = now()
     where source_type = 'market' and source_id = p_hm_job_id and status <> 'archived';
    return;
  end if;

  v_source_eligible := v_job.is_published
    and v_job.recruitment_status = '募集中'
    and (v_job.closing_at is null or v_job.closing_at >= now());

  v_working_hours := nullif(concat_ws(E'\n',
    nullif(btrim(v_job.working_hours), ''),
    case when nullif(btrim(v_job.break_time), '') is not null then '休憩: ' || btrim(v_job.break_time) end,
    case when nullif(btrim(v_job.overtime), '') is not null then '残業: ' || btrim(v_job.overtime) end,
    case when nullif(btrim(v_job.take_home_work), '') is not null then '持ち帰り: ' || btrim(v_job.take_home_work) end
  ), '');

  v_benefits := nullif(concat_ws(E'\n',
    nullif(btrim(v_job.benefits), ''),
    case when nullif(btrim(v_job.allowances), '') is not null then '手当: ' || btrim(v_job.allowances) end,
    case when nullif(btrim(v_job.bonus), '') is not null then '賞与: ' || btrim(v_job.bonus) end,
    case when nullif(btrim(v_job.salary_raise), '') is not null then '昇給: ' || btrim(v_job.salary_raise) end
  ), '');

  -- Archive HC copies whose HM-to-facility link is no longer active.
  update public.hc_jobs existing
     set status = 'archived', published_at = null, updated_by = 'hm_sync', updated_at = now()
   where existing.source_type = 'market'
     and existing.source_id = v_job.id
     and not exists (
       select 1
       from public.ho_market_legacy_links l
       where l.hm_nursery_id = v_job.nursery_id
         and l.facility_id = existing.facility_id
         and l.organization_id = existing.organization_id
         and l.status = 'active'
     );

  for v_link in
    select l.organization_id, l.facility_id
    from public.ho_market_legacy_links l
    join public.ho_facilities f
      on f.id = l.facility_id
     and f.organization_id = l.organization_id
     and f.status = 'active'
    join public.ho_organizations o
      on o.id = l.organization_id
     and o.status = 'active'
    where l.hm_nursery_id = v_job.nursery_id
      and l.status = 'active'
  loop
    insert into public.hc_jobs (
      organization_id, facility_id, source_type, source_id, title, description,
      employment_type, salary_type, salary_min, salary_max, salary_note,
      working_hours, holidays, required_qualification, benefits, number_of_positions,
      status, published_at, closing_at, created_by, updated_by
    ) values (
      v_link.organization_id, v_link.facility_id, 'market', v_job.id,
      coalesce(nullif(btrim(v_job.job_title), ''), '求人'), coalesce(v_job.job_description, ''),
      v_job.employment_type, v_job.salary_type, v_job.salary_min, v_job.salary_max, v_job.salary_note,
      v_working_hours,
      nullif(concat_ws(E'\n',
        nullif(btrim(v_job.holidays), ''),
        case when nullif(btrim(v_job.annual_holidays), '') is not null then '年間休日: ' || btrim(v_job.annual_holidays) end
      ), ''),
      nullif(concat_ws(E'\n',
        nullif(btrim(v_job.required_qualification), ''),
        case when nullif(btrim(v_job.experience_requirement), '') is not null then '経験: ' || btrim(v_job.experience_requirement) end
      ), ''),
      v_benefits, greatest(coalesce(v_job.number_of_positions, 1), 1),
      case when v_source_eligible then 'draft' else 'closed' end,
      null, v_job.closing_at, 'hm_sync', 'hm_sync'
    )
    on conflict (facility_id, source_type, source_id)
    do update set
      organization_id = excluded.organization_id,
      title = excluded.title,
      description = excluded.description,
      employment_type = excluded.employment_type,
      salary_type = excluded.salary_type,
      salary_min = excluded.salary_min,
      salary_max = excluded.salary_max,
      salary_note = excluded.salary_note,
      working_hours = excluded.working_hours,
      holidays = excluded.holidays,
      required_qualification = excluded.required_qualification,
      benefits = excluded.benefits,
      number_of_positions = excluded.number_of_positions,
      closing_at = excluded.closing_at,
      status = case
        when not v_source_eligible then 'closed'
        when public.hc_jobs.status in ('closed', 'archived') then 'draft'
        else public.hc_jobs.status
      end,
      published_at = case
        when not v_source_eligible then null
        when public.hc_jobs.status = 'published' then public.hc_jobs.published_at
        else null
      end,
      updated_by = 'hm_sync',
      updated_at = now();
  end loop;
end;
$$;

revoke all on function ho_private.hc_sync_hm_recruitment_job(uuid) from public, anon, authenticated;

create or replace function ho_private.hc_sync_hm_recruitment_job_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    update public.hc_jobs
       set status = 'archived', published_at = null, updated_by = 'hm_sync', updated_at = now()
     where source_type = 'market' and source_id = old.id and status <> 'archived';
    return old;
  end if;

  perform ho_private.hc_sync_hm_recruitment_job(new.id);
  return new;
end;
$$;

revoke all on function ho_private.hc_sync_hm_recruitment_job_trigger() from public, anon, authenticated;

drop trigger if exists hc_sync_hm_recruitment_job on public.hm_recruitment_jobs;
create trigger hc_sync_hm_recruitment_job
after insert or update or delete on public.hm_recruitment_jobs
for each row execute function ho_private.hc_sync_hm_recruitment_job_trigger();

create or replace function ho_private.hc_sync_hm_link_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_job_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.status = 'active' and (
      tg_op = 'DELETE'
      or new.status <> 'active'
      or new.hm_nursery_id is distinct from old.hm_nursery_id
      or new.facility_id is distinct from old.facility_id
      or new.organization_id is distinct from old.organization_id
    ) then
      update public.hc_jobs h
         set status = 'archived', published_at = null, updated_by = 'hm_sync', updated_at = now()
       where h.source_type = 'market'
         and h.facility_id = old.facility_id
         and h.organization_id = old.organization_id
         and h.source_id in (
           select j.id from public.hm_recruitment_jobs j where j.nursery_id = old.hm_nursery_id
         );
    end if;
  end if;

  if tg_op <> 'DELETE' and new.status = 'active' then
    for v_job_id in
      select j.id from public.hm_recruitment_jobs j where j.nursery_id = new.hm_nursery_id
    loop
      perform ho_private.hc_sync_hm_recruitment_job(v_job_id);
    end loop;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function ho_private.hc_sync_hm_link_trigger() from public, anon, authenticated;

drop trigger if exists hc_sync_hm_legacy_link on public.ho_market_legacy_links;
create trigger hc_sync_hm_legacy_link
after insert or update or delete on public.ho_market_legacy_links
for each row execute function ho_private.hc_sync_hm_link_trigger();

-- One safe ON/OFF contract for the corporate UI.
-- OFF returns a job to draft and clears published_at, so both HC search and the
-- Google Jobs public feed stop exposing it. ON is refused when the source has
-- expired or HM is no longer actively recruiting.
create or replace function public.hc_set_job_publication(p_job_id uuid, p_is_public boolean)
returns public.hc_jobs
language plpgsql
security invoker
set search_path = public, ho_private, pg_temp
as $$
declare
  v_job public.hc_jobs%rowtype;
  v_market_source_ok boolean;
  v_actor text;
begin
  select * into v_job
  from public.hc_jobs
  where id = p_job_id;

  if not found then
    raise exception '求人が見つかりません。' using errcode = 'P0002';
  end if;

  if not ho_private.recruitment_can_write(v_job.facility_id) then
    raise exception 'この求人を変更する権限がありません。' using errcode = '42501';
  end if;

  v_actor := ho_private.current_clerk_user_id();

  if p_is_public then
    if v_job.closing_at is not null and v_job.closing_at < now() then
      raise exception '募集期限を過ぎた求人は公開できません。';
    end if;

    if v_job.source_type = 'market' then
      select exists (
        select 1
        from public.hm_recruitment_jobs m
        join public.ho_market_legacy_links l
          on l.hm_nursery_id = m.nursery_id
         and l.status = 'active'
         and l.organization_id = v_job.organization_id
         and l.facility_id = v_job.facility_id
        where m.id = v_job.source_id
          and m.is_published
          and m.recruitment_status = '募集中'
          and (m.closing_at is null or m.closing_at >= now())
      ) into v_market_source_ok;

      if not coalesce(v_market_source_ok, false) then
        raise exception 'Hoiku Market側で現在募集中の求人ではないため公開できません。';
      end if;
    end if;

    update public.hc_jobs
       set status = 'published',
           published_at = coalesce(v_job.published_at, now()),
           updated_by = coalesce(v_actor, 'hc_publication_switch'),
           updated_at = now()
     where id = p_job_id
     returning * into v_job;
  else
    update public.hc_jobs
       set status = 'draft',
           published_at = null,
           updated_by = coalesce(v_actor, 'hc_publication_switch'),
           updated_at = now()
     where id = p_job_id
     returning * into v_job;
  end if;

  return v_job;
end;
$$;

revoke all on function public.hc_set_job_publication(uuid, boolean) from public, anon;
grant execute on function public.hc_set_job_publication(uuid, boolean) to authenticated;

-- Safe backfill. Existing HM jobs are synchronized but remain HC OFF by default.
do $$
declare
  v_job_id uuid;
begin
  for v_job_id in select id from public.hm_recruitment_jobs loop
    perform ho_private.hc_sync_hm_recruitment_job(v_job_id);
  end loop;
end;
$$;
