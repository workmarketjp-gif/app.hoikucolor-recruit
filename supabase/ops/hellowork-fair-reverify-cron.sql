-- Operational change (pg_cron job 22, created 2026-10-23), not schema DDL.
--
-- hc-hellowork-reverify: every 5 minutes, hc-hellowork-import {"reverify":true,"limit":40}.
-- 40 official-page re-checks / 5 min ≈ 11,500 / day (the 30-second discovery cadence of 2026-10-13
-- fetched up to 50 pages every 30 s). A full pass over ~26,000 active jobs takes about 2.2 days, well
-- inside the 168-hour public freshness window, and the daily discovery job (jobid 18) is unchanged.
--
-- Safety: DB-picked batch (fair across prefectures), 5-minute lease against overlap, 30-minute backoff
-- when half of a batch fails, throttled/overload pages leave rows untouched, a 「該当する情報は見つかりませんでした」
-- page withdraws the job without overwriting its stored content.
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
