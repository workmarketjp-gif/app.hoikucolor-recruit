-- Candidate/facility browser clients only need row-level CRUD on document
-- metadata. Remove table-level privileges that are unnecessary for Supabase
-- client CRUD and would bypass the intended application contract if arbitrary
-- SQL execution were ever exposed.

revoke truncate, references, trigger on table public.hc_jobseeker_documents from authenticated;
revoke truncate, references, trigger on table public.hc_application_documents from authenticated;
