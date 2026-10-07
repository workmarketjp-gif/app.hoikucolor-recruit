-- HC candidate search projection Stage A: narrow-key V2.
--
-- V1 proved that pre-joining alone is not sufficient when exact counts/facets
-- still scan a wide payload. V2 separates narrow search keys from page payload
-- hydration so count/sort/filter work never touches full job descriptions,
-- benefits, verified JSON or raw external payloads.
--
-- Production RPCs remain unchanged.

create table if not exists hc_feed_private.jobseeker_search_keys_v2 (
  id uuid primary key,
  prefecture text,
  employment_type text,
  published_at timestamptz,
  search_valid_until timestamptz,
  source_kind text not null,
  source_last_verified_at timestamptz,
  source_content_hash text,
  source_parser_version text,
  is_external boolean not null,
  ho_verified boolean not null default false,
  hf_verified boolean not null default false,
  rank_quality numeric not null default 0,
  rank_transparency numeric not null default 0,
  search_document text not null default '',
  projection_updated_at timestamptz not null default now()
);

alter table hc_feed_private.jobseeker_search_keys_v2 set (fillfactor = 80);

revoke all on table hc_feed_private.jobseeker_search_keys_v2
  from public, anon, authenticated;
grant select, insert, update, delete on table hc_feed_private.jobseeker_search_keys_v2
  to service_role;

comment on table hc_feed_private.jobseeker_search_keys_v2 is
  'Stage A V2 narrow search keys. Exact count/filter/sort operate here; payload is hydrated only after page selection.';

create or replace view hc_feed_private.jobseeker_search_key_source_v2
as
select
  r.id,
  r.prefecture,
  r.employment_type,
  r.published_at,
  r.closing_at as search_valid_until,
  'hoiku_color'::text as source_kind,
  null::timestamptz as source_last_verified_at,
  null::text as source_content_hash,
  null::text as source_parser_version,
  false as is_external,
  coalesce(w.verified_metric_count, 0) > 0 as ho_verified,
  coalesce(f.verified_metric_count, 0) > 0 as hf_verified,
  (coalesce(w.quality_points, 0) + coalesce(f.quality_points, 0))::numeric as rank_quality,
  (coalesce(w.transparency_pct, 0) + coalesce(f.transparency_pct, 0))::numeric as rank_transparency,
  public.hc_job_search_document(
    r.title,
    r.facility_name,
    r.description,
    r.prefecture,
    r.city,
    r.required_qualification,
    null,
    null
  ) as search_document
from hc_feed_private.public_job_rows r
left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id

union all

select
  e.id,
  e.prefecture,
  e.employment_type,
  coalesce(e.source_published_at, e.fetched_at) as published_at,
  case
    when e.closing_at is null then e.expires_at
    when e.expires_at is null then e.closing_at
    else least(e.closing_at, e.expires_at)
  end as search_valid_until,
  e.source as source_kind,
  e.last_verified_at as source_last_verified_at,
  e.source_payload->>'content_sha256' as source_content_hash,
  e.source_payload->>'parser_version' as source_parser_version,
  true as is_external,
  false as ho_verified,
  false as hf_verified,
  0::numeric as rank_quality,
  0::numeric as rank_transparency,
  public.hc_job_search_document(
    e.title,
    e.facility_name,
    e.description,
    e.prefecture,
    e.city,
    e.required_qualification,
    null,
    null
  ) as search_document
from public.hc_external_job_sources e
where e.source_status = 'active'
  and e.public_republication_allowed = true
  and e.claimed_job_id is null;

revoke all on hc_feed_private.jobseeker_search_key_source_v2
  from public, anon, authenticated;
grant select on hc_feed_private.jobseeker_search_key_source_v2 to service_role;

create index if not exists hc_jobseeker_search_keys_v2_rank_idx
  on hc_feed_private.jobseeker_search_keys_v2 (
    rank_quality desc,
    rank_transparency desc,
    published_at desc nulls last,
    id
  );

create index if not exists hc_jobseeker_search_keys_v2_filter_rank_idx
  on hc_feed_private.jobseeker_search_keys_v2 (
    prefecture,
    employment_type,
    ho_verified,
    hf_verified,
    rank_quality desc,
    rank_transparency desc,
    published_at desc nulls last,
    id
  );

create index if not exists hc_jobseeker_search_keys_v2_facets_idx
  on hc_feed_private.jobseeker_search_keys_v2 (prefecture, employment_type);

create index if not exists hc_jobseeker_search_keys_v2_search_trgm_idx
  on hc_feed_private.jobseeker_search_keys_v2
  using gin (search_document extensions.gin_trgm_ops);

create or replace function hc_feed_private.hc_refresh_jobseeker_search_keys_v2(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
begin
  -- Most Hello Work refreshes only extend last_verified_at. Keep that path HOT.
  update hc_feed_private.jobseeker_search_keys_v2 k
  set
    source_last_verified_at = s.source_last_verified_at,
    projection_updated_at = now()
  from hc_feed_private.jobseeker_search_key_source_v2 s
  where s.id = p_id
    and k.id = s.id
    and k.is_external = true
    and s.is_external = true
    and k.source_content_hash is not distinct from s.source_content_hash
    and k.source_parser_version is not distinct from s.source_parser_version
    and k.published_at is not distinct from s.published_at
    and k.search_valid_until is not distinct from s.search_valid_until
    and k.prefecture is not distinct from s.prefecture
    and k.employment_type is not distinct from s.employment_type
    and k.search_document is not distinct from s.search_document;

  if found then
    return;
  end if;

  insert into hc_feed_private.jobseeker_search_keys_v2 (
    id,
    prefecture,
    employment_type,
    published_at,
    search_valid_until,
    source_kind,
    source_last_verified_at,
    source_content_hash,
    source_parser_version,
    is_external,
    ho_verified,
    hf_verified,
    rank_quality,
    rank_transparency,
    search_document,
    projection_updated_at
  )
  select
    s.id,
    s.prefecture,
    s.employment_type,
    s.published_at,
    s.search_valid_until,
    s.source_kind,
    s.source_last_verified_at,
    s.source_content_hash,
    s.source_parser_version,
    s.is_external,
    s.ho_verified,
    s.hf_verified,
    s.rank_quality,
    s.rank_transparency,
    s.search_document,
    now()
  from hc_feed_private.jobseeker_search_key_source_v2 s
  where s.id = p_id
  on conflict (id) do update
  set (
    prefecture,
    employment_type,
    published_at,
    search_valid_until,
    source_kind,
    source_last_verified_at,
    source_content_hash,
    source_parser_version,
    is_external,
    ho_verified,
    hf_verified,
    rank_quality,
    rank_transparency,
    search_document,
    projection_updated_at
  ) = (
    excluded.prefecture,
    excluded.employment_type,
    excluded.published_at,
    excluded.search_valid_until,
    excluded.source_kind,
    excluded.source_last_verified_at,
    excluded.source_content_hash,
    excluded.source_parser_version,
    excluded.is_external,
    excluded.ho_verified,
    excluded.hf_verified,
    excluded.rank_quality,
    excluded.rank_transparency,
    excluded.search_document,
    excluded.projection_updated_at
  );

  if not found then
    delete from hc_feed_private.jobseeker_search_keys_v2
    where id = p_id;
  end if;
end;
$$;

revoke all on function hc_feed_private.hc_refresh_jobseeker_search_keys_v2(uuid)
  from public, anon, authenticated;

-- Reuse the existing Stage A triggers, but stop maintaining the wide V1 table.
create or replace function hc_feed_private.hc_jobseeker_search_projection_row_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
begin
  if tg_op = 'DELETE' then
    perform hc_feed_private.hc_refresh_jobseeker_search_keys_v2(old.id);
    return old;
  end if;

  perform hc_feed_private.hc_refresh_jobseeker_search_keys_v2(new.id);
  return new;
end;
$$;

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
    perform hc_feed_private.hc_refresh_jobseeker_search_keys_v2(v_job.id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

insert into hc_feed_private.jobseeker_search_keys_v2 (
  id,
  prefecture,
  employment_type,
  published_at,
  search_valid_until,
  source_kind,
  source_last_verified_at,
  source_content_hash,
  source_parser_version,
  is_external,
  ho_verified,
  hf_verified,
  rank_quality,
  rank_transparency,
  search_document,
  projection_updated_at
)
select
  s.id,
  s.prefecture,
  s.employment_type,
  s.published_at,
  s.search_valid_until,
  s.source_kind,
  s.source_last_verified_at,
  s.source_content_hash,
  s.source_parser_version,
  s.is_external,
  s.ho_verified,
  s.hf_verified,
  s.rank_quality,
  s.rank_transparency,
  s.search_document,
  now()
from hc_feed_private.jobseeker_search_key_source_v2 s
on conflict (id) do nothing;

analyze hc_feed_private.jobseeker_search_keys_v2;

create or replace view hc_feed_private.jobseeker_search_keys_visible_v2
as
select k.*
from hc_feed_private.jobseeker_search_keys_v2 k
where (
  (
    k.is_external = false
    and (k.search_valid_until is null or k.search_valid_until >= now())
  )
  or
  (
    k.is_external = true
    and k.source_last_verified_at >= now() - interval '12 hours'
    and (k.search_valid_until is null or k.search_valid_until >= now())
    and exists (
      select 1
      from public.hc_external_source_sync_control c
      where c.source = k.source_kind
        and c.enabled = true
        and c.publication_enabled = true
    )
  )
);

revoke all on hc_feed_private.jobseeker_search_keys_visible_v2
  from public, anon, authenticated;
grant select on hc_feed_private.jobseeker_search_keys_visible_v2 to service_role;

create or replace function hc_feed_private.hc_jobseeker_hydrate_search_key_v2(
  p_id uuid,
  p_is_external boolean
)
returns table (
  id uuid,
  facility_id uuid,
  facility_name text,
  facility_type text,
  prefecture text,
  city text,
  address text,
  title text,
  description text,
  employment_type text,
  salary_type text,
  salary_min integer,
  salary_max integer,
  salary_note text,
  working_hours text,
  holidays text,
  required_qualification text,
  benefits text,
  number_of_positions integer,
  published_at timestamptz,
  closing_at timestamptz,
  spot_break_minutes integer,
  verified_workplace jsonb,
  verified_finance jsonb,
  source_kind text,
  source_name text,
  source_job_id text,
  source_url text,
  source_last_verified_at timestamptz,
  is_external boolean,
  can_apply_direct boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
  select
    r.id,
    r.facility_id,
    r.facility_name,
    r.facility_type,
    r.prefecture,
    r.city,
    r.jobseeker_address,
    r.title,
    r.description,
    r.employment_type,
    r.salary_type,
    r.salary_min,
    r.salary_max,
    r.salary_note,
    r.working_hours,
    r.holidays,
    r.required_qualification,
    r.benefits,
    r.number_of_positions,
    r.published_at,
    r.closing_at,
    r.spot_break_minutes,
    case when w.facility_id is null then null else to_jsonb(w) end,
    case when f.facility_id is null then null else to_jsonb(f) end,
    'hoiku_color'::text,
    null::text,
    null::text,
    null::text,
    null::timestamptz,
    false,
    true
  from hc_feed_private.public_job_rows r
  left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
  left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
  where p_is_external = false
    and r.id = p_id
    and (r.closing_at is null or r.closing_at >= now())

  union all

  select
    e.id,
    e.id,
    e.facility_name,
    e.facility_type,
    e.prefecture,
    e.city,
    e.address,
    e.title,
    e.description,
    e.employment_type,
    e.salary_type,
    e.salary_min,
    e.salary_max,
    e.salary_note,
    e.working_hours,
    e.holidays,
    e.required_qualification,
    e.benefits,
    e.number_of_positions,
    coalesce(e.source_published_at, e.fetched_at),
    coalesce(e.closing_at, e.expires_at),
    null::integer,
    null::jsonb,
    null::jsonb,
    e.source,
    case when e.source = 'hellowork' then 'ハローワーク' else e.source end,
    e.source_job_id,
    e.source_url,
    e.last_verified_at,
    true,
    false
  from public.hc_external_job_sources e
  where p_is_external = true
    and e.id = p_id
    and e.source_status = 'active'
    and e.public_republication_allowed = true
    and e.claimed_job_id is null
    and e.last_verified_at >= now() - interval '12 hours'
    and (e.expires_at is null or e.expires_at >= now())
    and (e.closing_at is null or e.closing_at >= now())
    and exists (
      select 1
      from public.hc_external_source_sync_control c
      where c.source = e.source
        and c.enabled = true
        and c.publication_enabled = true
    )
  limit 1;
$$;

revoke all on function hc_feed_private.hc_jobseeker_hydrate_search_key_v2(uuid,boolean)
  from public, anon, authenticated;
grant execute on function hc_feed_private.hc_jobseeker_hydrate_search_key_v2(uuid,boolean)
  to service_role;

create or replace function hc_feed_private.hc_jobseeker_search_keys_no_keyword_v2(
  p_prefecture text default null,
  p_employment_type text default null,
  p_ho_verified boolean default false,
  p_hf_verified boolean default false,
  p_limit integer default 24,
  p_after_quality numeric default null,
  p_after_transparency numeric default null,
  p_after_published_at timestamptz default null,
  p_after_id uuid default null
)
returns table (
  id uuid,
  facility_id uuid,
  facility_name text,
  facility_type text,
  prefecture text,
  city text,
  address text,
  title text,
  description text,
  employment_type text,
  salary_type text,
  salary_min integer,
  salary_max integer,
  salary_note text,
  working_hours text,
  holidays text,
  required_qualification text,
  benefits text,
  number_of_positions integer,
  published_at timestamptz,
  closing_at timestamptz,
  spot_break_minutes integer,
  verified_workplace jsonb,
  verified_finance jsonb,
  source_kind text,
  source_name text,
  source_job_id text,
  source_url text,
  source_last_verified_at timestamptz,
  is_external boolean,
  can_apply_direct boolean,
  rank_quality numeric,
  rank_transparency numeric,
  total_count bigint,
  has_more boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
  with total as materialized (
    select count(*)::bigint as total_count
    from hc_feed_private.jobseeker_search_keys_visible_v2 k
    where (nullif(btrim(p_prefecture), '') is null or k.prefecture = btrim(p_prefecture))
      and (nullif(btrim(p_employment_type), '') is null or k.employment_type = btrim(p_employment_type))
      and (not coalesce(p_ho_verified, false) or k.ho_verified = true)
      and (not coalesce(p_hf_verified, false) or k.hf_verified = true)
  ),
  window_page as materialized (
    select
      k.id,
      k.is_external,
      k.rank_quality,
      k.rank_transparency,
      k.published_at
    from hc_feed_private.jobseeker_search_keys_visible_v2 k
    where (nullif(btrim(p_prefecture), '') is null or k.prefecture = btrim(p_prefecture))
      and (nullif(btrim(p_employment_type), '') is null or k.employment_type = btrim(p_employment_type))
      and (not coalesce(p_ho_verified, false) or k.ho_verified = true)
      and (not coalesce(p_hf_verified, false) or k.hf_verified = true)
      and (
        p_after_id is null
        or k.rank_quality < coalesce(p_after_quality, 0)
        or (
          k.rank_quality = coalesce(p_after_quality, 0)
          and k.rank_transparency < coalesce(p_after_transparency, 0)
        )
        or (
          k.rank_quality = coalesce(p_after_quality, 0)
          and k.rank_transparency = coalesce(p_after_transparency, 0)
          and coalesce(k.published_at, '-infinity'::timestamptz)
              < coalesce(p_after_published_at, '-infinity'::timestamptz)
        )
        or (
          k.rank_quality = coalesce(p_after_quality, 0)
          and k.rank_transparency = coalesce(p_after_transparency, 0)
          and coalesce(k.published_at, '-infinity'::timestamptz)
              = coalesce(p_after_published_at, '-infinity'::timestamptz)
          and k.id > p_after_id
        )
      )
    order by k.rank_quality desc,
             k.rank_transparency desc,
             k.published_at desc nulls last,
             k.id
    limit greatest(1, least(coalesce(p_limit, 24), 50)) + 1
  ),
  page_keys as (
    select w.*
    from window_page w
    order by w.rank_quality desc,
             w.rank_transparency desc,
             w.published_at desc nulls last,
             w.id
    limit greatest(1, least(coalesce(p_limit, 24), 50))
  )
  select
    p.id,
    p.facility_id,
    p.facility_name,
    p.facility_type,
    p.prefecture,
    p.city,
    p.address,
    p.title,
    p.description,
    p.employment_type,
    p.salary_type,
    p.salary_min,
    p.salary_max,
    p.salary_note,
    p.working_hours,
    p.holidays,
    p.required_qualification,
    p.benefits,
    p.number_of_positions,
    p.published_at,
    p.closing_at,
    p.spot_break_minutes,
    p.verified_workplace,
    p.verified_finance,
    p.source_kind,
    p.source_name,
    p.source_job_id,
    p.source_url,
    p.source_last_verified_at,
    p.is_external,
    p.can_apply_direct,
    k.rank_quality,
    k.rank_transparency,
    t.total_count,
    ((select count(*) from window_page) >
      greatest(1, least(coalesce(p_limit, 24), 50))) as has_more
  from page_keys k
  cross join lateral hc_feed_private.hc_jobseeker_hydrate_search_key_v2(k.id, k.is_external) p
  cross join total t
  order by k.rank_quality desc,
           k.rank_transparency desc,
           k.published_at desc nulls last,
           k.id;
$$;

revoke all on function hc_feed_private.hc_jobseeker_search_keys_no_keyword_v2(
  text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) from public, anon, authenticated;
grant execute on function hc_feed_private.hc_jobseeker_search_keys_no_keyword_v2(
  text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) to service_role;

create or replace function hc_feed_private.hc_jobseeker_search_keys_keyword_v2(
  p_query text,
  p_prefecture text default null,
  p_employment_type text default null,
  p_ho_verified boolean default false,
  p_hf_verified boolean default false,
  p_limit integer default 24,
  p_after_quality numeric default null,
  p_after_transparency numeric default null,
  p_after_published_at timestamptz default null,
  p_after_id uuid default null
)
returns table (
  id uuid,
  facility_id uuid,
  facility_name text,
  facility_type text,
  prefecture text,
  city text,
  address text,
  title text,
  description text,
  employment_type text,
  salary_type text,
  salary_min integer,
  salary_max integer,
  salary_note text,
  working_hours text,
  holidays text,
  required_qualification text,
  benefits text,
  number_of_positions integer,
  published_at timestamptz,
  closing_at timestamptz,
  spot_break_minutes integer,
  verified_workplace jsonb,
  verified_finance jsonb,
  source_kind text,
  source_name text,
  source_job_id text,
  source_url text,
  source_last_verified_at timestamptz,
  is_external boolean,
  can_apply_direct boolean,
  rank_quality numeric,
  rank_transparency numeric,
  total_count bigint,
  has_more boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
  with total as materialized (
    select count(*)::bigint as total_count
    from hc_feed_private.jobseeker_search_keys_visible_v2 k
    where k.search_document like hc_feed_private.hc_jobseeker_contains_pattern(p_query) escape E'\\'
      and (nullif(btrim(p_prefecture), '') is null or k.prefecture = btrim(p_prefecture))
      and (nullif(btrim(p_employment_type), '') is null or k.employment_type = btrim(p_employment_type))
      and (not coalesce(p_ho_verified, false) or k.ho_verified = true)
      and (not coalesce(p_hf_verified, false) or k.hf_verified = true)
  ),
  window_page as materialized (
    select
      k.id,
      k.is_external,
      k.rank_quality,
      k.rank_transparency,
      k.published_at
    from hc_feed_private.jobseeker_search_keys_visible_v2 k
    where k.search_document like hc_feed_private.hc_jobseeker_contains_pattern(p_query) escape E'\\'
      and (nullif(btrim(p_prefecture), '') is null or k.prefecture = btrim(p_prefecture))
      and (nullif(btrim(p_employment_type), '') is null or k.employment_type = btrim(p_employment_type))
      and (not coalesce(p_ho_verified, false) or k.ho_verified = true)
      and (not coalesce(p_hf_verified, false) or k.hf_verified = true)
      and (
        p_after_id is null
        or k.rank_quality < coalesce(p_after_quality, 0)
        or (
          k.rank_quality = coalesce(p_after_quality, 0)
          and k.rank_transparency < coalesce(p_after_transparency, 0)
        )
        or (
          k.rank_quality = coalesce(p_after_quality, 0)
          and k.rank_transparency = coalesce(p_after_transparency, 0)
          and coalesce(k.published_at, '-infinity'::timestamptz)
              < coalesce(p_after_published_at, '-infinity'::timestamptz)
        )
        or (
          k.rank_quality = coalesce(p_after_quality, 0)
          and k.rank_transparency = coalesce(p_after_transparency, 0)
          and coalesce(k.published_at, '-infinity'::timestamptz)
              = coalesce(p_after_published_at, '-infinity'::timestamptz)
          and k.id > p_after_id
        )
      )
    order by k.rank_quality desc,
             k.rank_transparency desc,
             k.published_at desc nulls last,
             k.id
    limit greatest(1, least(coalesce(p_limit, 24), 50)) + 1
  ),
  page_keys as (
    select w.*
    from window_page w
    order by w.rank_quality desc,
             w.rank_transparency desc,
             w.published_at desc nulls last,
             w.id
    limit greatest(1, least(coalesce(p_limit, 24), 50))
  )
  select
    p.id,
    p.facility_id,
    p.facility_name,
    p.facility_type,
    p.prefecture,
    p.city,
    p.address,
    p.title,
    p.description,
    p.employment_type,
    p.salary_type,
    p.salary_min,
    p.salary_max,
    p.salary_note,
    p.working_hours,
    p.holidays,
    p.required_qualification,
    p.benefits,
    p.number_of_positions,
    p.published_at,
    p.closing_at,
    p.spot_break_minutes,
    p.verified_workplace,
    p.verified_finance,
    p.source_kind,
    p.source_name,
    p.source_job_id,
    p.source_url,
    p.source_last_verified_at,
    p.is_external,
    p.can_apply_direct,
    k.rank_quality,
    k.rank_transparency,
    t.total_count,
    ((select count(*) from window_page) >
      greatest(1, least(coalesce(p_limit, 24), 50))) as has_more
  from page_keys k
  cross join lateral hc_feed_private.hc_jobseeker_hydrate_search_key_v2(k.id, k.is_external) p
  cross join total t
  order by k.rank_quality desc,
           k.rank_transparency desc,
           k.published_at desc nulls last,
           k.id;
$$;

revoke all on function hc_feed_private.hc_jobseeker_search_keys_keyword_v2(
  text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) from public, anon, authenticated;
grant execute on function hc_feed_private.hc_jobseeker_search_keys_keyword_v2(
  text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) to service_role;

create or replace function hc_feed_private.hc_jobseeker_job_search_facets_keys_v2()
returns table (
  prefectures text[],
  employment_types text[]
)
language sql
stable
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
  select
    coalesce(
      array_agg(distinct k.prefecture order by k.prefecture)
        filter (where nullif(btrim(k.prefecture), '') is not null),
      '{}'::text[]
    ) as prefectures,
    coalesce(
      array_agg(distinct k.employment_type order by k.employment_type)
        filter (where nullif(btrim(k.employment_type), '') is not null),
      '{}'::text[]
    ) as employment_types
  from hc_feed_private.jobseeker_search_keys_visible_v2 k;
$$;

revoke all on function hc_feed_private.hc_jobseeker_job_search_facets_keys_v2()
  from public, anon, authenticated;
grant execute on function hc_feed_private.hc_jobseeker_job_search_facets_keys_v2()
  to service_role;

comment on function hc_feed_private.hc_jobseeker_search_keys_no_keyword_v2(
  text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) is 'Stage A V2 benchmark: narrow count/sort then page-only payload hydration. Not used by production.';

comment on function hc_feed_private.hc_jobseeker_search_keys_keyword_v2(
  text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) is 'Stage A V2 benchmark: trigram narrow count/sort then page-only payload hydration. Not used by production.';

comment on function hc_feed_private.hc_jobseeker_job_search_facets_keys_v2()
  is 'Stage A V2 narrow-key facets benchmark. Not used by production.';
