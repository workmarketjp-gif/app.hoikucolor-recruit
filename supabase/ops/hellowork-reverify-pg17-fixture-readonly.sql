-- PG17 read-only fixture for the proposed 60h urgent-first ranking.
-- This test uses synthetic values and must not call the live picker RPC,
-- because the RPC stamps reverify_attempted_at.
-- Verified on PostgreSQL 17 production server using SELECT only on 2026-11-12.
WITH params AS (SELECT timestamptz '2026-11-12 04:00:00+00' AS clock),
fixtures(id,prefecture,age_hours,source_status,allowed,claimed,attempt_age_hours,closing_age_hours) AS (
 VALUES
  ('small_old','A',85.0,'active',true,false,NULL::numeric,NULL::numeric),
  ('old_b','B',72.0,'active',true,false,NULL::numeric,NULL::numeric),
  ('after_60h','I',60.001,'active',true,false,NULL::numeric,NULL::numeric),
  ('at_60h','H',60.0,'active',true,false,NULL::numeric,NULL::numeric),
  ('recent_c','C',45.0,'active',true,false,NULL::numeric,NULL::numeric),
  ('recent_c2','C',35.0,'active',true,false,NULL::numeric,NULL::numeric),
  ('recent_d','D',26.0,'active',true,false,NULL::numeric,NULL::numeric),
  ('blocked_e','E',99.0,'blocked',false,false,NULL::numeric,NULL::numeric),
  ('cooldown_f','F',90.0,'active',true,false,1.0::numeric,NULL::numeric),
  ('closed_g','G',95.0,'active',true,false,NULL::numeric,1.0::numeric),
  ('claimed_k','K',95.0,'active',true,true,NULL::numeric,NULL::numeric),
  ('too_fresh_l','L',23.0,'active',true,false,NULL::numeric,NULL::numeric)
),
eligible AS (
 SELECT f.id, f.prefecture, p.clock - f.age_hours*interval '1 hour' AS last_verified_at,
  row_number() OVER (PARTITION BY f.prefecture ORDER BY f.age_hours DESC,f.id) AS rn,
  count(*) OVER (PARTITION BY f.prefecture) AS pref_total
 FROM fixtures f CROSS JOIN params p
 WHERE f.source_status='active' AND f.allowed AND NOT f.claimed
   AND (f.closing_age_hours IS NULL OR p.clock - f.closing_age_hours*interval '1 hour' >= p.clock)
   AND f.age_hours > 24
   AND (f.attempt_age_hours IS NULL OR f.attempt_age_hours > 6)
), ranked AS (
 SELECT id,last_verified_at,rn,pref_total,
  row_number() OVER (ORDER BY
    case when last_verified_at < p.clock - interval '60 hours' then 0 else 1 end,
    case when last_verified_at < p.clock - interval '60 hours' then last_verified_at end asc nulls last,
    rn::numeric/pref_total,id) AS priority
 FROM eligible CROSS JOIN params p
)
SELECT (SELECT count(*) FROM ranked) AS eligible_count,
  (SELECT array_agg(id ORDER BY priority) FROM ranked WHERE priority<=3) AS top_three,
  (SELECT priority FROM ranked WHERE id='at_60h') AS boundary_rank,
  (SELECT priority FROM ranked WHERE id='after_60h') AS just_over_boundary_rank,
  (SELECT count(*) FROM ranked WHERE id IN ('blocked_e','cooldown_f','closed_g','claimed_k','too_fresh_l')) AS disallowed_included,
  ((SELECT array_agg(id ORDER BY priority) FROM ranked WHERE priority<=3)
    = ARRAY['small_old','old_b','after_60h']::text[]) AS urgent_priority_pass,
  ((SELECT priority FROM ranked WHERE id='after_60h') < (SELECT priority FROM ranked WHERE id='at_60h')) AS strict_60h_boundary_pass,
  ((SELECT count(*) FROM ranked WHERE id IN ('blocked_e','cooldown_f','closed_g','claimed_k','too_fresh_l'))=0) AS eligibility_pass;
