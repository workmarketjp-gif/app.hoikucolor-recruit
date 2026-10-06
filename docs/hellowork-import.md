# Hello Work external job import (Hoiku Color)

## Purpose

Hoiku Color can show real public Hello Work childcare jobs without creating fake Hoiku Poppy organizations or facilities.

Unclaimed external jobs are stored in `hc_external_job_sources`. Canonical facility-owned jobs remain in `hc_jobs`.

## Publication rules

The importer is deliberately fail-closed.

- Only the official `www.hellowork.mhlw.go.jp/kensaku/GECA110010.do?action=dispDetailBtn...` detail page is accepted.
- A page containing the registered-jobseeker-only notice or a hidden employer is stored as `blocked` and is never shown.
- Only childcare-related positions are accepted.
- Only `public_republication_allowed=true` rows can enter the candidate feed.
- Candidate visibility requires source verification within the last 36 hours.
- Closing/expiry removes the row automatically.
- If an external posting is claimed and linked to a canonical `hc_jobs` row, the external copy disappears to avoid duplication.
- `source_payload` is private; browsers cannot select the raw source table.

## Candidate UI

External jobs look like normal Hoiku Color jobs. The source is intentionally not a top-of-card badge.

The expanded job detail ends with a small footer:

`出典：ハローワーク（求人番号 ...）`

Unclaimed external jobs do not expose Hoiku Color direct application, save, visit/trial, HO Verified or HF Verified actions. The main action opens the original job page.

## Import function

`supabase/functions/hc-hellowork-import/index.ts`

- deploy with JWT verification enabled;
- caller must be `service_role`;
- POST `{"urls":["<public detail URL>"]}` to import/refresh explicit jobs;
- POST `{"refresh":true}` to re-check the oldest active rows (max 50 per run).

A nationwide discovery scheduler is a separate step. Discovery must feed only public detail URLs into this importer; it must not use the restricted Hello Work online-provision feed as a public redistribution source.

## Before production enablement

1. Apply migration `20261006213000_hc_external_job_sources_v1.sql`.
2. Deploy `hc-hellowork-import` with JWT verification enabled.
3. Confirm Hoiku Color operator name, address and phone are visible from the site as required for Hello Work republication.
4. Import a small pilot set and verify each source page.
5. Verify removal/expiry and 36-hour stale fail-closed behavior.
6. Add compliant nationwide discovery and daily refresh scheduling.
