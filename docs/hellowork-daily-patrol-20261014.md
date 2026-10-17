# External job patrol daily cadence

## Production evidence (2026-10-14)

- Project: `kcmmpjyngcysdfbumchk`.
- Actual scheduler: Supabase pg_cron job 18, `hc-hellowork-discovery`.
- Command calls `hc-hellowork-import` with `{"discover":true}`; deployed Edge Function version 23 unconditionally upserts `hc_external_job_sources`.
- Before: `30 seconds`, active. Past 24 hours: 2,873 cron SQL executions succeeded. These statuses confirm HTTP enqueueing, not individual Edge Function success.
- Sync state: 18 completed nationwide cycles, no last_error, 50 imported in the latest observed batch. Initial population cadence had remained enabled.
- After: `17 18 * * *`, active, GMT (18:17 UTC; 03:17 JST; 07:17 Auckland during NZDT). One bounded batch per day, NOT a full nationwide sweep per day.
- Target HTTP command MD5 remains `e7a0e9a6d4caf21ed77f072b485070dc`.
- All nine other cron jobs are unchanged, including social publication, native notifications, and office billing.

## Public visibility and unchanged records

The existing 12-hour freshness condition is unchanged. At inspection there were 41,782 source records and 25,479 records eligible in the external public feed. Daily bounded discovery cannot keep this entire catalog fresh: older records leave the feed. The user explicitly accepted the reduction before the production change. No public feed, commander, import logic, or publication control was modified.

The importer always upserts, including `fetched_at`, `last_verified_at`, and `updated_at`. Even equal source content therefore produces an UPDATE and fires the search projection trigger. Skipping all unchanged-content updates without a separate verification timestamp design would prevent freshness renewal. This change does not implement that optimization. A future design can separate verification bookkeeping from changed-content writes and avoid rewriting the search projection for timestamp-only updates; it needs its own review and tests.

## Scheduler investigation scope

The recruitment repository's GitHub workflow is CI, not a scheduled importer. GitHub reports two additional message-validation workflows, unrelated to this import. The repository's Cloudflare configuration is an assets-only Worker with no script entry point or cron trigger. The checked Poppy gateway configuration has no cron trigger and the checked gateway code has no Hello Work importer reference. No live Cloudflare account trigger inventory was available; this is repository evidence, not a claim of an exhaustive account-wide audit. The directly observed production pg_cron job explains the continuous import activity.

## Validation and rollback

`supabase/ops/hellowork-daily-patrol.sql` is an operational change, not schema DDL. It checks the existing target command and schedule, snapshots all unrelated jobs, changes only the target schedule, and asserts unchanged command/active state and unrelated jobs. It was executed in a transaction and rolled back first, then executed for production. Production was independently re-read afterwards. No manual import was triggered, avoiding unnecessary source writes; the next daily execution has not yet occurred.

To restore the prior cadence after checking target identity: `select cron.alter_job(18, schedule := '30 seconds');`. This restores the higher IO cadence, so use only if required.
