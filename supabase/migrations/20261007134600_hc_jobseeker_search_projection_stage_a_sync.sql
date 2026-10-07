-- HC candidate search projection: Stage A synchronization and backfill.
-- Production search/facets RPCs are intentionally untouched.

create or replace function hc_feed_private.hc_refresh_jobseeker_search_projection(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
begin
  -- Hello Work refreshes the same public page repeatedly. When the parsed page
  -- content and parser version did not change, refresh only freshness metadata.
  -- source_last_verified_at is intentionally not indexed so this path can remain HOT.
  update hc_feed_private.jobseeker_search_projection p
  set
    source_last_verified_at = s.source_last_verified_at,
    projection_updated_at = now()
  from hc_feed_private.jobseeker_search_projection_source s
  where s.id = p_id
    and p.id = s.id
    and p.is_external = true
    and s.is_external = true
    and p.source_content_hash is not distinct from s.source_content_hash
    and p.source_parser_version is not distinct from s.source_parser_version
    and p.published_at is not distinct from s.published_at
    and p.closing_at is not distinct from s.closing_at
    and p.search_valid_until is not distinct from s.search_valid_until
    and p.search_document is not distinct from s.search_document
    and p.prefecture is not distinct from s.prefecture
    and p.employment_type is not distinct from s.employment_type
    and p.source_url is not distinct from s.source_url;

  if found then
    return;
  end if;

  insert into hc_feed_private.jobseeker_search_projection (
    id,
    facility_id,
    facility_name,
    facility_type,
    prefecture,
    city,
    address,
    title,
    description,
    employment_type,
    salary_type,
    salary_min,
    salary_max,
    salary_note,
    working_hours,
    holidays,
    required_qualification,
    benefits,
    number_of_positions,
    published_at,
    closing_at,
    spot_break_minutes,
    verified_workplace,
    verified_finance,
    source_kind,
    source_name,
    source_job_id,
    source_url,
    source_last_verified_at,
    search_valid_until,
    source_content_hash,
    source_parser_version,
    is_external,
    can_apply_direct,
    ho_verified,
    hf_verified,
    rank_quality,
    rank_transparency,
    search_document,
    projection_updated_at
  )
  select
    s.id,
    s.facility_id,
    s.facility_name,
    s.facility_type,
    s.prefecture,
    s.city,
    s.address,
    s.title,
    s.description,
    s.employment_type,
    s.salary_type,
    s.salary_min,
    s.salary_max,
    s.salary_note,
    s.working_hours,
    s.holidays,
    s.required_qualification,
    s.benefits,
    s.number_of_positions,
    s.published_at,
    s.closing_at,
    s.spot_break_minutes,
    s.verified_workplace,
    s.verified_finance,
    s.source_kind,
    s.source_name,
    s.source_job_id,
    s.source_url,
    s.source_last_verified_at,
    s.search_valid_until,
    s.source_content_hash,
    s.source_parser_version,
    s.is_external,
    s.can_apply_direct,
    s.ho_verified,
    s.hf_verified,
    s.rank_quality,
    s.rank_transparency,
    s.search_document,
    now()
  from hc_feed_private.jobseeker_search_projection_source s
  where s.id = p_id
  on conflict (id) do update
  set (
    facility_id,
    facility_name,
    facility_type,
    prefecture,
    city,
    address,
    title,
    description,
    employment_type,
    salary_type,
    salary_min,
    salary_max,
    salary_note,
    working_hours,
    holidays,
    required_qualification,
    benefits,
    number_of_positions,
    published_at,
    closing_at,
    spot_break_minutes,
    verified_workplace,
    verified_finance,
    source_kind,
    source_name,
    source_job_id,
    source_url,
    source_last_verified_at,
    search_valid_until,
    source_content_hash,
    source_parser_version,
    is_external,
    can_apply_direct,
    ho_verified,
    hf_verified,
    rank_quality,
    rank_transparency,
    search_document,
    projection_updated_at
  ) = (
    excluded.facility_id,
    excluded.facility_name,
    excluded.facility_type,
    excluded.prefecture,
    excluded.city,
    excluded.address,
    excluded.title,
    excluded.description,
    excluded.employment_type,
    excluded.salary_type,
    excluded.salary_min,
    excluded.salary_max,
    excluded.salary_note,
    excluded.working_hours,
    excluded.holidays,
    excluded.required_qualification,
    excluded.benefits,
    excluded.number_of_positions,
    excluded.published_at,
    excluded.closing_at,
    excluded.spot_break_minutes,
    excluded.verified_workplace,
    excluded.verified_finance,
    excluded.source_kind,
    excluded.source_name,
    excluded.source_job_id,
    excluded.source_url,
    excluded.source_last_verified_at,
    excluded.search_valid_until,
    excluded.source_content_hash,
    excluded.source_parser_version,
    excluded.is_external,
    excluded.can_apply_direct,
    excluded.ho_verified,
    excluded.hf_verified,
    excluded.rank_quality,
    excluded.rank_transparency,
    excluded.search_document,
    excluded.projection_updated_at
  );

  if not found then
    delete from hc_feed_private.jobseeker_search_projection
    where id = p_id;
  end if;
end;
$$;

revoke all on function hc_feed_private.hc_refresh_jobseeker_search_projection(uuid)
  from public, anon, authenticated;

create or replace function hc_feed_private.hc_jobseeker_search_projection_row_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
begin
  if tg_op = 'DELETE' then
    perform hc_feed_private.hc_refresh_jobseeker_search_projection(old.id);
    return old;
  end if;

  perform hc_feed_private.hc_refresh_jobseeker_search_projection(new.id);
  return new;
end;
$$;

revoke all on function hc_feed_private.hc_jobseeker_search_projection_row_trigger()
  from public, anon, authenticated;

create trigger hc_jobseeker_search_projection_sync_external
after insert or update or delete
on public.hc_external_job_sources
for each row
execute function hc_feed_private.hc_jobseeker_search_projection_row_trigger();

create trigger hc_jobseeker_search_projection_sync_canonical
after insert or update or delete
on hc_feed_private.public_job_rows
for each row
execute function hc_feed_private.hc_jobseeker_search_projection_row_trigger();

create or replace function hc_feed_private.hc_jobseeker_search_projection_profile_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
declare
  v_facility_id uuid;
  v_job record;
begin
  if tg_op = 'DELETE' then
    v_facility_id := old.facility_id;
  else
    v_facility_id := new.facility_id;
  end if;

  for v_job in
    select id
    from hc_feed_private.public_job_rows
    where facility_id = v_facility_id
  loop
    perform hc_feed_private.hc_refresh_jobseeker_search_projection(v_job.id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function hc_feed_private.hc_jobseeker_search_projection_profile_trigger()
  from public, anon, authenticated;

create trigger hc_jobseeker_search_projection_sync_workplace
after insert or update or delete
on public.hc_public_workplace_profiles
for each row
execute function hc_feed_private.hc_jobseeker_search_projection_profile_trigger();

create trigger hc_jobseeker_search_projection_sync_finance
after insert or update or delete
on public.hc_public_finance_profiles
for each row
execute function hc_feed_private.hc_jobseeker_search_projection_profile_trigger();

insert into hc_feed_private.jobseeker_search_projection (
  id,
  facility_id,
  facility_name,
  facility_type,
  prefecture,
  city,
  address,
  title,
  description,
  employment_type,
  salary_type,
  salary_min,
  salary_max,
  salary_note,
  working_hours,
  holidays,
  required_qualification,
  benefits,
  number_of_positions,
  published_at,
  closing_at,
  spot_break_minutes,
  verified_workplace,
  verified_finance,
  source_kind,
  source_name,
  source_job_id,
  source_url,
  source_last_verified_at,
  search_valid_until,
  source_content_hash,
  source_parser_version,
  is_external,
  can_apply_direct,
  ho_verified,
  hf_verified,
  rank_quality,
  rank_transparency,
  search_document,
  projection_updated_at
)
select
  s.id,
  s.facility_id,
  s.facility_name,
  s.facility_type,
  s.prefecture,
  s.city,
  s.address,
  s.title,
  s.description,
  s.employment_type,
  s.salary_type,
  s.salary_min,
  s.salary_max,
  s.salary_note,
  s.working_hours,
  s.holidays,
  s.required_qualification,
  s.benefits,
  s.number_of_positions,
  s.published_at,
  s.closing_at,
  s.spot_break_minutes,
  s.verified_workplace,
  s.verified_finance,
  s.source_kind,
  s.source_name,
  s.source_job_id,
  s.source_url,
  s.source_last_verified_at,
  s.search_valid_until,
  s.source_content_hash,
  s.source_parser_version,
  s.is_external,
  s.can_apply_direct,
  s.ho_verified,
  s.hf_verified,
  s.rank_quality,
  s.rank_transparency,
  s.search_document,
  now()
from hc_feed_private.jobseeker_search_projection_source s
on conflict (id) do nothing;

analyze hc_feed_private.jobseeker_search_projection;
