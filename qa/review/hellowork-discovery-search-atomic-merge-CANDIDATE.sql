-- REVIEW-ONLY DESIGN CANDIDATE for HC Recruit Draft PR #98 / Issue #97.
-- NOT A MIGRATION. DO NOT EXECUTE on Production or add to deployment scripts.
-- Intentionally lives under qa/review, NOT supabase/migrations.
-- Await named owner of shared Supabase migration history, release slot, independent
-- PG17 two-session test and approval before promotion to a versioned migration.
--
-- WHY: two independent discovery/reverification leases issue PostgreSQL
-- INSERT ... ON CONFLICT DO UPDATE, each with a potentially stale source_payload.
-- A read-merge-write in JavaScript is NOT safe. A BEFORE UPDATE trigger receives
-- OLD from the row locked for the actual UPDATE, and atomically unions OLD/NEW
-- within that row update. Concurrent upserts must serialize on that key.
--
-- SCOPE: solely source_payload.discovery_search, source='hellowork'.
-- No location inference; never touch prefecture/city, publication, status,
-- annual_holidays_*, occupation_*, RLS or any source_payload siblings.
-- The current hc_hw_structure_before_write trigger must remain installed.
-- This function/trigger are a REVIEW CANDIDATE, not a deployed fix.

create or replace function hc_private.hw_search_provenance_before_update_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_old jsonb;
  v_incoming jsonb;
  v_codes jsonb;
  v_terms jsonb;
  v_first timestamptz;
  v_last timestamptz;
  v_old_search_time timestamptz;
  v_new_search_time timestamptz;
  v_last_search jsonb;
begin
  if old.source is distinct from 'hellowork'
     or new.source is distinct from 'hellowork' then
    return new;
  end if;

  v_old := old.source_payload -> 'discovery_search';
  if v_old is null or v_old = 'null'::jsonb then
    return new; -- No prior observation to merge (including JSON null).
  end if;

  -- Do not silently discard an existing unsupported provenance envelope.
  -- Failing this one write is safer than corrupting history; investigate
  -- version drift and keep the existing row intact until an owner reviews it.
  if pg_catalog.jsonb_typeof(v_old) is distinct from 'object'
     or v_old ->> 'version' is distinct from '1' then
    raise exception 'HC_HW_DISCOVERY_PROVENANCE_OLD_VERSION_UNSUPPORTED'
      using errcode = '22023';
  end if;

  v_incoming := new.source_payload -> 'discovery_search';
  if v_incoming is not null
     and v_incoming <> 'null'::jsonb
     and (pg_catalog.jsonb_typeof(v_incoming) is distinct from 'object'
          or v_incoming ->> 'version' is distinct from '1') then
    raise exception 'HC_HW_DISCOVERY_PROVENANCE_VERSION_CONFLICT';
  end if;

  if v_incoming is null or v_incoming = 'null'::jsonb then
    -- A re-verification with no new discovery evidence must not erase old.
    new.source_payload := pg_catalog.jsonb_set(
      new.source_payload, '{discovery_search}', v_old, true
    );
    return new;
  end if;

  -- Fixed whitelists bound the resulting arrays to 47 prefecture codes / 4
  -- search terms even after repeated discoveries. No historical page HTML.
  select coalesce(pg_catalog.jsonb_agg(v order by v), '[]'::jsonb)
    into v_codes
  from (
    select distinct code as v
    from (
      select pg_catalog.jsonb_array_elements_text(
        case when pg_catalog.jsonb_typeof(v_old->'observed_prefecture_codes') = 'array'
             then v_old->'observed_prefecture_codes' else '[]'::jsonb end
      ) as code
      union all
      select pg_catalog.jsonb_array_elements_text(
        case when pg_catalog.jsonb_typeof(v_incoming->'observed_prefecture_codes') = 'array'
             then v_incoming->'observed_prefecture_codes' else '[]'::jsonb end
      )
    ) as combined
    where code ~ '^(0[1-9]|[1-3][0-9]|4[0-7])$'
  ) as valid_codes;

  select coalesce(pg_catalog.jsonb_agg(v order by v), '[]'::jsonb)
    into v_terms
  from (
    select distinct term as v
    from (
      select pg_catalog.jsonb_array_elements_text(
        case when pg_catalog.jsonb_typeof(v_old->'observed_search_terms') = 'array'
             then v_old->'observed_search_terms' else '[]'::jsonb end
      ) as term
      union all
      select pg_catalog.jsonb_array_elements_text(
        case when pg_catalog.jsonb_typeof(v_incoming->'observed_search_terms') = 'array'
             then v_incoming->'observed_search_terms' else '[]'::jsonb end
      )
    ) as combined
    where term in ('保育士', '保育教諭', '幼稚園教諭', '保育補助')
  ) as valid_terms;

  -- Use real time ordering rather than lexical strings; malformed timestamps
  -- are ignored rather than aborting a valid public-job refresh. pg_input_is_valid
  -- is available on the verified PostgreSQL 17 production version.
  select min(parsed.ts), max(parsed.ts)
    into v_first, v_last
  from (
    select case when pg_catalog.pg_input_is_valid(val, 'timestamp with time zone')
                then val::timestamptz end as ts
    from (values
      (v_old->>'first_observed_at'),
      (v_old->>'last_observed_at'),
      (v_incoming->>'first_observed_at'),
      (v_incoming->>'last_observed_at')
    ) as raw_times(val)
  ) as parsed;

  v_old_search_time := case
    when pg_catalog.pg_input_is_valid(v_old->'last_search'->>'observed_at', 'timestamp with time zone')
      then (v_old->'last_search'->>'observed_at')::timestamptz
  end;
  v_new_search_time := case
    when pg_catalog.pg_input_is_valid(v_incoming->'last_search'->>'observed_at', 'timestamp with time zone')
      then (v_incoming->'last_search'->>'observed_at')::timestamptz
  end;

  v_last_search := case
    when v_new_search_time is null then v_old->'last_search'
    when v_old_search_time is null or v_new_search_time >= v_old_search_time
      then v_incoming->'last_search'
    else v_old->'last_search'
  end;

  new.source_payload := pg_catalog.jsonb_set(
    new.source_payload,
    '{discovery_search}',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'observed_prefecture_codes', v_codes,
      'observed_search_terms', v_terms,
      'first_observed_at', v_first,
      'last_observed_at', v_last,
      'last_search', v_last_search,
      'evidence_kind', 'search_filter_only'
    ),
    true
  );
  return new;
end;
$fn$;

-- Execute rights for browser / API users are not required.
revoke all on function hc_private.hw_search_provenance_before_update_v1()
  from public, anon, authenticated;

create trigger hc_hw_search_provenance_before_update
before update of source_payload on public.hc_external_job_sources
for each row
execute function hc_private.hw_search_provenance_before_update_v1();

-- REQUIRED REVIEW/TEST CHECKLIST (not yet executed; MUST PASS in isolated PG17):
-- 1. Two independent sessions each upsert the same source/source_job_id with
--    stale pre-read payload; block session B after A locks; commit both orders.
--    Expected observed_prefecture_codes = UNION(A,B), last_search=max(time),
--    first_observed_at=min(time), last_observed_at=max(time).
-- 2. Repeat with a newly inserted row racing an ON CONFLICT update.
-- 3. Interleave removed/blocked and HTTP429/5xx paths. No source_status
--    override, no fabricated 'verified' or public revival; provenance survives.
-- 4. Reverify with no discovery_search retains old; unsupported existing
--    OR incoming version raises a controlled error instead of silently
--    discarding any previously stored observation.
-- 5. Check unchanged pre-existing trigger hc_hw_structure_before_write:
--    annual_holidays_*, occupation_*, canonical prefecture/city source semantics.
-- 6. Ensure source_payload remains absent from public feed, RLS/ACL intact,
--    no leakage to client/OGP/logs, and no GSC/Cloudflare deployment side effect.
-- 7. Deno bundle/import test and exact-head CI + Preview verification.
-- 8. Formal migration owner reconciles production migration sequence and
--    reserves a separate HC release after Finance/Family priority gate.
