# Hello Work external job import (Hoiku Color)

## Purpose

Hoiku Color can show real public Hello Work childcare jobs without creating fake Hoiku Poppy organizations or facilities.

External jobs remain in `hc_external_job_sources` until a nursery/company is verified and the listing becomes a canonical Hoiku Color job. Canonical facility-owned jobs remain in `hc_jobs`.

## Publication rules

The importer is deliberately fail-closed.

- Only official `www.hellowork.mhlw.go.jp/kensaku/GECA110010.do?action=dispDetailBtn...` detail pages are accepted.
- Registered-jobseeker-only pages and employer-hidden pages are stored as `blocked` and are never shown.
- Employer text such as 「無断転載」「転載禁止」「掲載はお断り」 blocks publication.
- Only childcare-related positions are accepted.
- Only `public_republication_allowed=true` rows enter public/candidate feeds.
- Public visibility requires source verification within the last 12 hours.
- Closing/expiry removes the row automatically.
- Once a nursery/company starts managing the listing and it is linked to a canonical `hc_jobs` row, the external copy disappears to avoid duplication.
- `source_payload` and sync secrets are private; browsers cannot read the raw source tables.

## Nationwide discovery

Production discovery uses the public Hello Work search interface and processes bounded batches.

- Core search terms are processed separately: `保育士`, `保育教諭`, `幼稚園教諭`, `保育補助`.
- Each search term scans all 47 prefectures.
- Results are paged 50 at a time and deduplicated by `(source, source_job_id)`.
- Detail-page imports run with bounded concurrency.
- Search/parser changes fail closed instead of silently publishing malformed jobs.
- `hc_external_source_sync_control` stores the query/prefecture/page cursor and a private synchronization secret.
- During initial population, `hc-hellowork-discovery` may run every 30 seconds. After the first complete cycle, reduce the cadence for ongoing maintenance.

## Parser

Current parser contract: `hellowork-public-v4`.

The parser uses the current detail-page section labels rather than broad substring slicing. It extracts:

- employer/facility name
- job title and responsibilities
- prefecture/city/address
- employment type
- displayed salary range and unit
- working hours
- holidays
- required qualifications
- benefits
- number of positions
- publication/closing dates
- 「オンライン自主応募の受付」 status

Hello Work displays full-time salary as a monthly equivalent and part-time salary as an hourly equivalent. HC preserves that visible unit.

## Candidate/public UI

External jobs look like normal Hoiku Color jobs. The source is not shown as a listing-card badge.

The job detail ends with a small source footer:

`出典：ハローワーク（求人番号 ...）`

External jobs do not use Hoiku Color direct application.

- Online self-apply available: 「ハローワークで応募手続きへ」
- Otherwise: 「ハローワークで応募方法を確認」

The public frontend can use a deterministic Hoiku Color visual template when no real nursery photo is available. Once the nursery/company starts managing its listing, real photos can replace the template.

## Import function

`supabase/functions/hc-hellowork-import/index.ts`

- JWT verification remains enabled.
- Manual/service operations accept a `service_role` JWT.
- Scheduled discovery uses a browser-inaccessible DB sync secret in addition to a valid Supabase JWT.
- POST `{"urls":["<public detail URL>"]}` imports explicit jobs.
- POST `{"refresh":true}` re-verifies up to 50 existing rows.
- POST `{"discover":true}` advances one nationwide discovery batch.

## Production state

Production Supabase already has:

- `hc_external_job_sources`
- `hc_external_source_sync_control`
- `hc_external_job_public_feed`
- `hc_public_job_feed_v2`
- candidate search/exact/facet RPCs v2
- `hc-hellowork-import`
- scheduled nationwide discovery

Before the public frontend is released, confirm the Hoiku Color operating business name, address and phone are visibly available from the site as required by the Hello Work republication conditions.
