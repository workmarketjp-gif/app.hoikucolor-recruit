create or replace function public.hc_jobseeker_get_job_transparency(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'job_id', j.id,
    'facility_claims', jsonb_strip_nulls(jsonb_build_object(
      'break_time', nullif(btrim(hm.break_time), ''),
      'annual_holidays', nullif(btrim(hm.annual_holidays), ''),
      'overtime', nullif(btrim(hm.overtime), ''),
      'take_home_work', nullif(btrim(hm.take_home_work), ''),
      'experience_requirement', nullif(btrim(hm.experience_requirement), '')
    )),
    'published_faqs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'question', f.question,
          'answer', f.answer
        )
        order by f.display_order, f.id
      )
      from public.hm_recruitment_faqs f
      where f.nursery_id = hm.nursery_id
        and f.is_published = true
        and nullif(btrim(f.question), '') is not null
        and nullif(btrim(f.answer), '') is not null
    ), '[]'::jsonb)
  )
  from public.hc_jobs j
  join public.hm_recruitment_jobs hm
    on hm.id = j.source_id
   and j.source_type = 'market'
  where j.id = p_job_id
    and j.status = 'published'
    and hm.is_published = true
    and (j.published_at is null or j.published_at <= now())
    and (j.closing_at is null or j.closing_at >= now())
  limit 1;
$$;

revoke all on function public.hc_jobseeker_get_job_transparency(uuid) from public;
revoke all on function public.hc_jobseeker_get_job_transparency(uuid) from anon;
revoke all on function public.hc_jobseeker_get_job_transparency(uuid) from authenticated;
grant execute on function public.hc_jobseeker_get_job_transparency(uuid) to authenticated;
grant execute on function public.hc_jobseeker_get_job_transparency(uuid) to service_role;

comment on function public.hc_jobseeker_get_job_transparency(uuid) is
'Candidate-safe read of explicitly published HM recruitment claims and FAQs for a currently published HC job. Does not expose internal recruitment/admin fields.';
