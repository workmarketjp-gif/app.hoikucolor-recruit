-- Hoiku Color Candidate Web — résumé builder follow-up v1.
-- Source only. Apply to production only after explicit approval.
--
-- hc_jobseeker_resume_entries_owner_idx (clerk_user_id, kind, sort_order) duplicates the
-- btree index behind the unique constraint hc_jobseeker_resume_entries_order_unique on the
-- same columns in the same order. Both the owner read and the delete-by-owner in
-- hc_jobseeker_save_resume use the constraint's index, so the extra index only costs writes.
begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hc_jobseeker_resume_entries_order_unique'
      and conrelid = 'public.hc_jobseeker_resume_entries'::regclass
      and contype = 'u'
  ) then
    raise exception 'HC_RESUME_ENTRIES_UNIQUE_INDEX_MISSING';
  end if;
end $$;

drop index if exists public.hc_jobseeker_resume_entries_owner_idx;

commit;
