#!/usr/bin/env bash
# Ephemeral, isolated PostgreSQL 17 QA only. Never point PGHOST at Supabase.
set -euo pipefail

[[ "${PGHOST:-}" == "127.0.0.1" || "${PGHOST:-}" == "localhost" ]] || {
  echo "Refusing non-loopback PostgreSQL: this test creates disposable schema/table." >&2
  exit 1
}
[[ "${PGDATABASE:-}" == "postgres" ]] || { echo "Expected disposable postgres database" >&2; exit 1; }

PSQL=(psql -X -v ON_ERROR_STOP=1 -q)
version=$("${PSQL[@]}" -Atc "SHOW server_version_num")
[[ "$version" -ge 170000 && "$version" -lt 180000 ]] || {
  echo "Expected PostgreSQL 17; got $version" >&2; exit 1;
}

"${PSQL[@]}" <<'SQL'
CREATE SCHEMA IF NOT EXISTS hc_private;
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END
$roles$;
CREATE TABLE public.hc_external_job_sources (
  source text NOT NULL,
  source_job_id text NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_status text NOT NULL DEFAULT 'active',
  prefecture text,
  annual_holidays_days smallint,
  annual_holidays_basis text,
  occupation_group text,
  PRIMARY KEY (source, source_job_id)
);
CREATE FUNCTION hc_private.qa_payload(p_code text, p_term text, p_at text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $func$
  SELECT pg_catalog.jsonb_build_object(
    'parser_version','v28',
    'discovery_search',pg_catalog.jsonb_build_object(
      'version',1,
      'observed_prefecture_codes',pg_catalog.jsonb_build_array(p_code),
      'observed_search_terms',pg_catalog.jsonb_build_array(p_term),
      'first_observed_at',p_at,
      'last_observed_at',p_at,
      'last_search',pg_catalog.jsonb_build_object(
        'prefecture_code',p_code,'search_term',p_term,'search_page',1,
        'observed_at',p_at),
      'evidence_kind','search_filter_only'))
$func$;
SQL

# Apply the exact PR review-only candidate only to the disposable fixture.
"${PSQL[@]}" -f qa/review/hellowork-discovery-search-atomic-merge-CANDIDATE.sql

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
race_case() {
  local key="$1" sql_a="$2" sql_b="$3" pid_a pid_b observed=0
  local signal="$tmp/$key.ready"
  (
    "${PSQL[@]}" <<SQL
BEGIN;
$sql_a
\! touch "$signal"
SELECT pg_sleep(3);
COMMIT;
SQL
  ) >"$tmp/$key-A.log" 2>&1 &
  pid_a=$!
  for _ in {1..60}; do
    [[ -f "$signal" ]] && break
    if ! kill -0 "$pid_a" 2>/dev/null; then
      cat "$tmp/$key-A.log" >&2
      echo "Session A exited before lock acquisition ($key)" >&2
      return 1
    fi
    sleep .05
  done
  [[ -f "$signal" ]] || { echo "Session A never acquired lock ($key)" >&2; return 1; }
  ("${PSQL[@]}" -c "$sql_b") >"$tmp/$key-B.log" 2>&1 &
  pid_b=$!
  for _ in {1..30}; do
    if [[ "$("${PSQL[@]}" -Atc "
      SELECT count(*) FROM pg_stat_activity
      WHERE wait_event_type='Lock' AND state='active'
        AND query LIKE '%$key%'")" -gt 0 ]]; then
      observed=1
      break
    fi
    sleep .07
  done
  if ! wait "$pid_a"; then cat "$tmp/$key-A.log" >&2; return 1; fi
  if ! wait "$pid_b"; then cat "$tmp/$key-B.log" >&2; return 1; fi
  [[ $observed -eq 1 ]] || { echo "No real writer lock contention observed ($key)" >&2; return 1; }
  echo "PASS: independent connections serialized on $key"
}

"${PSQL[@]}" <<'SQL'
INSERT INTO public.hc_external_job_sources
(source,source_job_id,source_payload,source_status,prefecture,annual_holidays_days,annual_holidays_basis,occupation_group)
VALUES ('hellowork','race-existing',
  hc_private.qa_payload('01','保育士','2026-10-27T10:00:00Z'),
  'active','北海道',120,'exact','hoikushi');
SQL

# Existing row: session A holds the update lock while B attempts to overwrite
# the same source_payload from stale discovery state; A is chronologically newer.
race_case 'race-existing' \
"INSERT INTO public.hc_external_job_sources (source,source_job_id,source_payload)
 VALUES ('hellowork','race-existing',hc_private.qa_payload('47','保育教諭','2026-10-27T12:00:00Z'))
 ON CONFLICT (source,source_job_id) DO UPDATE
 SET source_payload=EXCLUDED.source_payload;" \
"INSERT INTO public.hc_external_job_sources (source,source_job_id,source_payload)
 VALUES ('hellowork','race-existing',hc_private.qa_payload('13','保育補助','2026-10-27T11:00:00Z'))
 ON CONFLICT (source,source_job_id) DO UPDATE
 SET source_payload=EXCLUDED.source_payload;"

# New-row race: B initially tries INSERT while A's row is still uncommitted.
race_case 'race-new' \
"INSERT INTO public.hc_external_job_sources (source,source_job_id,source_payload)
 VALUES ('hellowork','race-new',hc_private.qa_payload('05','保育士','2026-10-27T12:00:00Z'));" \
"INSERT INTO public.hc_external_job_sources (source,source_job_id,source_payload)
 VALUES ('hellowork','race-new',hc_private.qa_payload('06','幼稚園教諭','2026-10-27T12:10:00Z'))
 ON CONFLICT (source,source_job_id) DO UPDATE
 SET source_payload=EXCLUDED.source_payload;"

"${PSQL[@]}" <<'SQL'
DO $assert$
DECLARE
  x record;
BEGIN
  SELECT * INTO x FROM public.hc_external_job_sources WHERE source_job_id='race-existing';
  IF x.source_payload->'discovery_search'->'observed_prefecture_codes'
       IS DISTINCT FROM '["01","13","47"]'::jsonb THEN
    RAISE EXCEPTION 'Existing-row race lost prefecture observations: %',x.source_payload;
  END IF;
  IF x.source_payload->'discovery_search'->'observed_search_terms'
       IS DISTINCT FROM '["保育士","保育教諭","保育補助"]'::jsonb THEN
    RAISE EXCEPTION 'Existing-row race lost search terms';
  END IF;
  IF (x.source_payload->'discovery_search'->>'first_observed_at')::timestamptz
       <> '2026-10-27T10:00:00Z'::timestamptz
     OR (x.source_payload->'discovery_search'->>'last_observed_at')::timestamptz
       <> '2026-10-27T12:00:00Z'::timestamptz
     OR x.source_payload->'discovery_search'->'last_search'->>'prefecture_code' <> '47' THEN
    RAISE EXCEPTION 'Incorrect chronology for existing-row race';
  END IF;
  IF x.source_status<>'active' OR x.prefecture<>'北海道'
     OR x.annual_holidays_days<>120 OR x.annual_holidays_basis<>'exact'
     OR x.occupation_group<>'hoikushi' THEN
    RAISE EXCEPTION 'Non-provenance business columns changed';
  END IF;
  SELECT * INTO x FROM public.hc_external_job_sources WHERE source_job_id='race-new';
  IF x.source_payload->'discovery_search'->'observed_prefecture_codes'
       IS DISTINCT FROM '["05","06"]'::jsonb
     OR x.source_payload->'discovery_search'->'last_search'->>'prefecture_code'<>'06' THEN
    RAISE EXCEPTION 'New-row concurrent INSERT lost evidence: %',x.source_payload;
  END IF;
END
$assert$;
-- Reverify contains no observation. Preserve old provenance and other siblings.
UPDATE public.hc_external_job_sources
SET source_payload='{"parser_version":"v29"}'::jsonb, source_status='removed'
WHERE source_job_id='race-existing';
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.hc_external_job_sources
    WHERE source_job_id='race-existing'
      AND source_status='removed'
      AND source_payload->>'parser_version'='v29'
      AND source_payload->'discovery_search'->'observed_prefecture_codes'
          = '["01","13","47"]'::jsonb
  ) THEN RAISE EXCEPTION 'Reverify/removed lost state or evidence'; END IF;
END
$assert$;
SQL

# Malformed first INSERT must fail (before trigger), with no poisoned row.
if "${PSQL[@]}" -c "INSERT INTO public.hc_external_job_sources (source,source_job_id,source_payload)
  VALUES ('hellowork','bad-incoming','{\"discovery_search\":{\"version\":2}}'::jsonb)" \
  >"$tmp/bad.log" 2>&1; then
  echo 'Invalid incoming provenance passed INSERT guard' >&2; exit 1
fi
grep -q HC_HW_DISCOVERY_PROVENANCE_VERSION_CONFLICT "$tmp/bad.log"
test "$("${PSQL[@]}" -Atc "SELECT count(*) FROM public.hc_external_job_sources WHERE source_job_id='bad-incoming'")" = 0

# Deliberately inject unsupported OLD only in disposable fixture to test fail-closed.
"${PSQL[@]}" <<'SQL'
ALTER TABLE public.hc_external_job_sources DISABLE TRIGGER hc_hw_search_provenance_before_insert;
INSERT INTO public.hc_external_job_sources (source,source_job_id,source_payload)
VALUES ('hellowork','bad-existing','{"discovery_search":{"version":2}}'::jsonb);
ALTER TABLE public.hc_external_job_sources ENABLE TRIGGER hc_hw_search_provenance_before_insert;
SQL
if "${PSQL[@]}" -c "UPDATE public.hc_external_job_sources
  SET source_payload='{\"parser_version\":\"v29\"}'::jsonb WHERE source_job_id='bad-existing'" \
  >"$tmp/bad-old.log" 2>&1; then
  echo 'Invalid existing provenance overwritten rather than rejected' >&2; exit 1
fi
grep -q HC_HW_DISCOVERY_PROVENANCE_OLD_VERSION_UNSUPPORTED "$tmp/bad-old.log"
test "$("${PSQL[@]}" -Atc "SELECT source_payload->'discovery_search'->>'version' FROM public.hc_external_job_sources WHERE source_job_id='bad-existing'")" = 2
echo "PASS: PG17 candidate DDL, two real lock-contention races, chronology, data isolation, removed/reverify, malformed INSERT/UPDATE"
