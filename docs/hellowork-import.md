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

## Fair re-verification (2026-10-23)

Public visibility needs `last_verified_at` within 168 hours, and `last_verified_at` is only written after the official page was fetched.
Daily discovery (cron job 18, one page) cannot keep ~26,000 known jobs fresh, so cron job 22 `hc-hellowork-reverify` runs every 5 minutes:

- `hc-hellowork-import {"reverify":true,"limit":40}` takes a batch from `hc_hellowork_pick_reverify_batch_v1` (service_role only).
- The batch is proportionally fair: each job is ranked by age inside its prefecture and the lowest rank / prefecture size goes first, so every prefecture's backlog shrinks at the same rate. Jobs verified in the last 24 hours are skipped; a picked job is stamped (`reverify_attempted_at`) so a failing URL is not retried for 6 hours.
- Each page is re-fetched from the official Hello Work URL. A job stays public only if the page is still public, open and relevant.
- 「該当する情報は見つかりませんでした」 (HTTP 200) means the posting was filled, withdrawn or re-issued: the job becomes `removed` and is withdrawn from every public feed, stored content is kept.
- HTTP 429/5xx or an overload page (no displayed 求人番号) leaves the row untouched. If half of a batch fails, the job pauses for 30 minutes.
- Observability: `hc_external_source_sync_control.last_reverify_*`. Pause with `select cron.alter_job(22, active := false);`.
- The page's own 「年間休日数」 row is stored as `annual_holidays_field_text`; the database trigger structures it (see docs/career-data-contract.md).

## New-posting discovery (2026-10-23, steady since 2026-10-25)

Discovery (cron job 18, `hc-hellowork-import {"discover":true}`) was once-daily (one ~50-posting search page), which could not keep pace with the site's new postings. It now runs every 5 minutes, same as re-verification, with the importer (v28) skipping a detail-page fetch for any posting already known and verified recently (12h active / 7d blocked / 24h removed) — a posting appearing in a search-result list alone never renews `last_verified_at`. Decision basis (measured 2026-10-22→25, see `supabase/ops/hellowork-fair-reverify-cron.sql`): 0 HTTP 429/5xx across ~62,000 combined discovery+re-verify requests; a sampled discovery batch fetched only 26 of 50 listed postings (the rest already fresh); one query-term × 47-prefecture pass completes well under 24h at this cadence.

## Full recovery pass results (2026-10-22 → 2026-10-25, ~3.2 days)

| | before | after |
| --- | --- | --- |
| public (within 168h) | 150 | 27,614 |
| active | 25,827 | 27,632 |
| removed (gone at source) | 0 | 1,872 |
| prefectures represented in the public feed | 3 | 47 |
| annual holidays extracted | 0 | 14,618 of 27,612 public (53%) |
| occupation `unknown` | n/a (field didn't exist) | 24 of 27,612 (0.09%) |

Cron health over the pass: jobid 18 (discovery) 817/817 runs succeeded; jobid 22 (re-verify) 1,393/1,393 runs succeeded; 0 non-2xx responses from Hello Work other than the unrelated LINE job's own failures. 16 independently-sampled `removed` jobs and 28 independently-sampled still-`active` jobs were spot-checked directly against the live Hello Work URLs; all matched the database's classification.
