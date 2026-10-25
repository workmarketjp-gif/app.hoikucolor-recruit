-- Operational change (pg_cron job 22, created 2026-10-23), not schema DDL.
--
-- hc-hellowork-reverify: steady state is every 5 minutes, hc-hellowork-import {"reverify":true,"limit":40}.
-- 40 official-page re-checks / 5 min ≈ 11,500 / day. ~27,600 active jobs / 7-day freshness window need
-- >= ~3,950 re-checks/day to stay inside the public 168-hour window; 11,500/day is a ~2.9x margin for
-- backoff pauses and skew. The daily discovery job (jobid 18) now also runs every 5 minutes (see below).
--
-- Safety: DB-picked batch (fair across prefectures), 5-minute lease against overlap, 30-minute backoff
-- when half of a batch fails, throttled/overload pages leave rows untouched, a 「該当する情報は見つかりませんでした」
-- page withdraws the job without overwriting its stored content.
--
-- Catch-up (2026-10-23 → 2026-10-25, ~3.2 days: 150 → 27,614 public jobs, 0 errors across 1,393 runs /
-- ~62,000 page fetches): schedule '*/3 * * * *', limit 50 (≈24,000/day; a full pass in ~1.1 days).
-- Switched back to steady state on 2026-10-25 once the backlog (jobs unverified >24h) fell to 266 of
-- ~27,600 active jobs (99.0% current). To redo a catch-up pass later (after a long outage, say):
--   select cron.alter_job(22, schedule := '*/3 * * * *',
--     command := replace((select command from cron.job where jobid = 22), '"limit":40', '"limit":50'));
-- and reverse with:
--   select cron.alter_job(22, schedule := '*/5 * * * *',
--     command := replace((select command from cron.job where jobid = 22), '"limit":50', '"limit":40'));
--
-- Pause:   select cron.alter_job(22, active := false);
-- Resume:  select cron.alter_job(22, active := true);
-- Remove:  select cron.unschedule('hc-hellowork-reverify');
select cron.schedule(
  'hc-hellowork-reverify',
  '*/5 * * * *',
  $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'hc_project_url')
             || '/functions/v1/hc-hellowork-import',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'hc_anon_key'),
        'x-hc-sync-secret', (select sync_secret from public.hc_external_source_sync_control where source = 'hellowork')
      ),
      body := '{"reverify":true,"limit":40}'::jsonb,
      timeout_milliseconds := 110000
    );
  $cmd$
);

-- hc-hellowork-discovery (jobid 18): changed 2026-10-23 from one daily batch (17 18 * * *, ~50 pages/day)
-- to every 5 minutes. The importer (v28) now skips a detail-page fetch for any posting already known and
-- recently verified (12h if active, 7d if blocked, 24h if removed/expired) — presence in a search-result
-- list alone never renews last_verified_at — so load is well below "50 fetches every 5 min": a sampled
-- batch on 2026-10-25 fetched only 26 of 50 listed postings (24 skipped as already fresh). Measured over
-- 2026-10-22→25 at this cadence: 0 HTTP 429/5xx across all requests (both jobs), new postings arriving at
-- roughly 50-100+/day (vs. ~16-80/day under the daily cadence), one query-term x 47-prefecture discovery
-- pass completing in well under 24h. Kept at 5 minutes as the steady cadence.
--
-- Revert to once daily if the source ever signals load concerns:
--   select cron.alter_job(18, schedule := '17 18 * * *');
select cron.alter_job(18, schedule := '*/5 * * * *');
