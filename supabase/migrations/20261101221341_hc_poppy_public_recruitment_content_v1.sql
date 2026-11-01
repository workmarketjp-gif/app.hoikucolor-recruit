-- Phase 1: one read contract for Hoiku Color to render the published parts of
-- a Hoiku Poppy recruitment site. The HC URL/id remains stable while
-- source_job_id identifies the canonical HM row. No content is copied.

create or replace function public.hc_public_market_recruitment_content_v1(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'hc_job_id', h.id,
    'source_job_id', m.id,
    'facility_id', h.facility_id,
    'source_nursery_id', m.nursery_id,
    'updated_at', greatest(h.updated_at, m.updated_at),
    'profile', jsonb_strip_nulls(jsonb_build_object(
      'nursery_name', coalesce(nullif(btrim(p.nursery_name), ''), nullif(btrim(p.name), '')),
      'corporation_name', nullif(btrim(p.corporation_name), ''),
      'introduction', coalesce(nullif(btrim(p.introduction), ''), nullif(btrim(p.description), '')),
      'philosophy', nullif(btrim(p.philosophy), ''),
      'features', coalesce(nullif(btrim(p.features), ''), nullif(btrim(p.feature_text), '')),
      'access_info', nullif(btrim(p.access_info), ''),
      'logo_url', nullif(btrim(p.logo_url), ''),
      'main_visual_url', nullif(btrim(p.main_visual_url), '')
    )),
    'page', case when c.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'main_copy', coalesce(nullif(btrim(c.catch_copy), ''), nullif(btrim(c.main_copy), '')),
      'sub_copy', nullif(btrim(c.sub_copy), ''),
      'intro_text', nullif(btrim(c.intro_text), ''),
      'appeal_points', nullif(btrim(c.appeal_points), ''),
      'workplace_description', nullif(btrim(c.workplace_description), ''),
      'ideal_candidate', nullif(btrim(c.ideal_candidate), ''),
      'selection_flow', nullif(btrim(c.selection_flow), '')
    )) end,
    'director_message', case when c.id is null or not exists (
      select 1 from public.hm_recruitment_section_settings s
      where s.nursery_id = m.nursery_id
        and s.section_key = 'section_director_message'
        and s.is_enabled
    ) then null else jsonb_strip_nulls(jsonb_build_object(
      'director_message_title', nullif(btrim(c.director_message_title), ''),
      'director_message_body', nullif(btrim(c.director_message_body), ''),
      'director_name', nullif(btrim(c.director_name), ''),
      'director_photo_url', nullif(btrim(c.director_photo_url), '')
    )) end,
    'photos', coalesce(photos.items, '[]'::jsonb),
    'features', coalesce(features.items, '[]'::jsonb),
    'staff_voices', coalesce(staff.items, '[]'::jsonb),
    'enabled_sections', coalesce(sections.items, '[]'::jsonb)
  )
  from public.hc_jobs h
  join public.hm_recruitment_jobs m
    on h.source_type = 'market'
   and m.id = h.source_id
  join public.ho_market_legacy_links l
    on l.hm_nursery_id = m.nursery_id
   and l.organization_id = h.organization_id
   and l.facility_id = h.facility_id
   and l.status = 'active'
  join public.ho_facilities f
    on f.id = h.facility_id
   and f.organization_id = h.organization_id
   and f.status = 'active'
  join public.ho_organizations o
    on o.id = h.organization_id
   and o.status = 'active'
  left join public.hm_nursery_profiles p on p.nursery_id = m.nursery_id
  left join lateral (
    select x.*
    from public.hm_recruitment_page_contents x
    where x.nursery_id = m.nursery_id and x.is_published
    order by x.updated_at desc, x.id
    limit 1
  ) c on true
  left join lateral (
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', x.id, 'image_url', nullif(btrim(x.image_url), ''),
      'category', nullif(btrim(x.category), ''), 'caption', nullif(btrim(x.caption), '')
    )) order by x.display_order, x.id) as items
    from public.hm_recruitment_photos x
    where x.nursery_id = m.nursery_id and x.is_published
      and nullif(btrim(x.image_url), '') is not null
      and exists (
        select 1 from public.hm_recruitment_section_settings s
        where s.nursery_id = x.nursery_id
          and s.section_key = 'section_photos'
          and s.is_enabled
      )
  ) photos on true
  left join lateral (
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', x.id, 'title', nullif(btrim(x.title), ''),
      'body', nullif(btrim(x.body), ''), 'icon_key', nullif(btrim(x.icon_key), ''),
      'image_url', nullif(btrim(x.image_url), '')
    )) order by x.display_order, x.id) as items
    from public.hm_recruitment_features x
    where x.nursery_id = m.nursery_id and x.is_published
      and exists (
        select 1 from public.hm_recruitment_section_settings s
        where s.nursery_id = x.nursery_id
          and s.section_key = 'section_features'
          and s.is_enabled
      )
  ) features on true
  left join lateral (
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', x.id, 'staff_name', nullif(btrim(x.staff_name), ''),
      'position', nullif(btrim(x.position), ''), 'years', nullif(btrim(x.years), ''),
      'title', nullif(btrim(x.title), ''), 'message', nullif(btrim(x.message), ''),
      'photo_url', nullif(btrim(x.photo_url), '')
    )) order by x.display_order, x.id) as items
    from public.hm_recruitment_staff_voices x
    where x.nursery_id = m.nursery_id and x.is_published
      and exists (
        select 1 from public.hm_recruitment_section_settings s
        where s.nursery_id = x.nursery_id
          and s.section_key = 'section_staff_voices'
          and s.is_enabled
      )
  ) staff on true
  left join lateral (
    select jsonb_agg(x.section_key order by x.display_order, x.id) as items
    from public.hm_recruitment_section_settings x
    where x.nursery_id = m.nursery_id and x.is_enabled
  ) sections on true
  where h.id = p_job_id
    and h.status = 'published'
    and (h.closing_at is null or h.closing_at >= now())
    and m.is_published
    and m.recruitment_status = '募集中'
    and (m.closing_at is null or m.closing_at >= now());
$function$;

revoke all on function public.hc_public_market_recruitment_content_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_public_market_recruitment_content_v1(uuid)
  to anon, authenticated;

comment on function public.hc_public_market_recruitment_content_v1(uuid) is
  'Published Hoiku Poppy recruitment content for one active Hoiku Color market job; returns no row for unavailable jobs.';

notify pgrst, 'reload schema';
