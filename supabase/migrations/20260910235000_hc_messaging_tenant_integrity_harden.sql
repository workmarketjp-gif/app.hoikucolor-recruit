-- Harden Hoiku Color messaging tenant identity.
-- The original RLS draft had alias-shadowed comparisons such as
-- `a.organization_id = a.organization_id`; these checks must correlate the
-- referenced application/facility to the row being inserted.

alter table public.hc_applications
  add constraint hc_applications_message_identity_unique
  unique (id, organization_id, facility_id, job_id, jobseeker_clerk_user_id);

alter table public.hc_message_threads
  add constraint hc_message_threads_application_identity_fkey
  foreign key (application_id, organization_id, facility_id, job_id, jobseeker_clerk_user_id)
  references public.hc_applications (id, organization_id, facility_id, job_id, jobseeker_clerk_user_id)
  on delete cascade;

alter table public.hc_message_templates
  add constraint hc_message_templates_facility_org_fkey
  foreign key (facility_id, organization_id)
  references public.ho_facilities (id, organization_id)
  on delete cascade;

create or replace function ho_private.hc_message_template_identity_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.facility_id is distinct from old.facility_id
     or new.created_by_clerk_user_id is distinct from old.created_by_clerk_user_id then
    raise exception 'message_template_identity_is_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function ho_private.hc_message_template_identity_guard() from public, anon, authenticated;

drop trigger if exists hc_message_template_identity_guard on public.hc_message_templates;
create trigger hc_message_template_identity_guard
before update on public.hc_message_templates
for each row execute function ho_private.hc_message_template_identity_guard();

drop policy if exists hc_message_templates_insert on public.hc_message_templates;
create policy hc_message_templates_insert
on public.hc_message_templates
for insert
to authenticated
with check (
  ho_private.recruitment_can_write(facility_id)
  and exists (
    select 1
    from public.ho_facilities fac
    where fac.id = hc_message_templates.facility_id
      and fac.organization_id = hc_message_templates.organization_id
      and fac.status = 'active'
  )
  and created_by_clerk_user_id = (auth.jwt() ->> 'sub')
);

drop policy if exists hc_message_templates_update on public.hc_message_templates;
create policy hc_message_templates_update
on public.hc_message_templates
for update
to authenticated
using (ho_private.recruitment_can_write(facility_id))
with check (
  ho_private.recruitment_can_write(facility_id)
  and exists (
    select 1
    from public.ho_facilities fac
    where fac.id = hc_message_templates.facility_id
      and fac.organization_id = hc_message_templates.organization_id
      and fac.status = 'active'
  )
);

drop policy if exists hc_message_threads_insert_participant on public.hc_message_threads;
create policy hc_message_threads_insert_participant
on public.hc_message_threads
for insert
to authenticated
with check (
  exists (
    select 1
    from public.hc_applications app
    where app.id = hc_message_threads.application_id
      and app.organization_id = hc_message_threads.organization_id
      and app.facility_id = hc_message_threads.facility_id
      and app.job_id = hc_message_threads.job_id
      and app.jobseeker_clerk_user_id = hc_message_threads.jobseeker_clerk_user_id
      and (
        app.jobseeker_clerk_user_id = (auth.jwt() ->> 'sub')
        or ho_private.recruitment_can_write(app.facility_id)
      )
  )
);
