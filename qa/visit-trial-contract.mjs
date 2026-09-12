import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20260911030000_hc_visit_trial_booking.sql', root), 'utf8');
const repository = readFileSync(new URL('src/lib/visitRepository.ts', root), 'utf8');
const ui = readFileSync(new URL('src/components/VisitTrialPanel.tsx', root), 'utf8');
const app = readFileSync(new URL('src/App.tsx', root), 'utf8');

const dbMarkers = [
  'create table if not exists public.hc_visit_settings',
  'create table if not exists public.hc_visit_reservations',
  "experience_type in ('visit','half_day_trial','full_day_trial')",
  "status in ('requested','confirmed','declined','cancelled','completed','no_show')",
  'hc_visit_reservations_one_active_per_job_idx',
  'security definer',
  "set search_path = ''",
  'pg_advisory_xact_lock',
  'ho_private.recruitment_can_write',
  'create or replace function public.hc_request_visit',
  'security invoker',
  "revoke all on function public.hc_request_visit",
  "grant execute on function public.hc_request_visit",
];
for (const marker of dbMarkers) {
  if (!migration.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Visit/trial DB contract missing: ${marker}`);
}

const repositoryMarkers = [
  ".from('hc_visit_settings')",
  "rpc('hc_list_my_visit_reservations_v2'",
  "rpc('hc_request_visit'",
  "rpc('hc_cancel_visit'",
  'facility_message',
];
for (const marker of repositoryMarkers) {
  if (!repository.includes(marker)) throw new Error(`Visit/trial repository contract missing: ${marker}`);
}

if (repository.replace(/\s+/g, '').includes(".from('hc_visit_reservations')".replace(/\s+/g, ''))) {
  throw new Error('Visit/trial browser client must not read hc_visit_reservations directly.');
}
if (repository.includes('service_role')) {
  throw new Error('Visit/trial browser client must not contain service_role.');
}

const reservationType = repository.match(/export type VisitReservation = \{([\s\S]*?)\n\};/)?.[1] || '';
for (const marker of ['organization_id:', 'jobseeker_clerk_user_id:', 'facility_note:']) {
  if (reservationType.includes(marker)) {
    throw new Error(`VisitReservation must not expose internal field: ${marker}`);
  }
}
if (!reservationType.includes('facility_message:')) {
  throw new Error('VisitReservation must expose the candidate-visible facility_message field.');
}

const uiMarkers = ['園見学', '半日体験', '1日体験', '予約をキャンセル', '園の現地時間', 'activeReservation.facility_message'];
for (const marker of uiMarkers) {
  if (!ui.includes(marker)) throw new Error(`Visit/trial UI contract missing: ${marker}`);
}
if (!app.includes('<VisitTrialPanel jobId={job.id} facilityId={job.facility_id} />')) {
  throw new Error('Visit/trial booking is not connected to expanded job details.');
}

console.log('Hoiku Color visit/trial booking contract passed.');
