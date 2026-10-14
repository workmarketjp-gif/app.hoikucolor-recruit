-- Production target: kcmmpjyngcysdfbumchk; cron.timezone = GMT.
-- Daily 18:17 UTC = 03:17 Japan; 07:17 Auckland during NZDT.
-- Does not change the HTTP command, publication rules, or other jobs.
DO $$
DECLARE
  target cron.job%ROWTYPE;
  others_before jsonb;
BEGIN
  SELECT * INTO STRICT target FROM cron.job WHERE jobname = 'hc-hellowork-discovery';
  IF target.schedule NOT IN ('30 seconds', '17 18 * * *')
     OR NOT target.active
     OR md5(target.command) <> 'e7a0e9a6d4caf21ed77f072b485070dc'
     OR current_setting('cron.timezone', true) NOT IN ('GMT', 'UTC')
  THEN
    RAISE EXCEPTION 'Unexpected patrol configuration; aborting';
  END IF;
  SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid) INTO others_before
    FROM cron.job j WHERE jobid <> target.jobid;
  PERFORM cron.alter_job(target.jobid, schedule := '17 18 * * *');
  IF (SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid) FROM cron.job j WHERE jobid <> target.jobid)
     IS DISTINCT FROM others_before THEN
    RAISE EXCEPTION 'Unrelated cron job changed; rolling back';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid = target.jobid
     AND schedule = '17 18 * * *' AND active = target.active AND command = target.command)
  THEN
    RAISE EXCEPTION 'Patrol postcondition failed';
  END IF;
END $$;

