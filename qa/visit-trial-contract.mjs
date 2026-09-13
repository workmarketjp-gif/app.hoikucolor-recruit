import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const foundation = readFileSync(new URL('supabase/migrations/20260911030000_hc_visit_trial_booking.sql', root), 'utf8');
const safeRead = readFileSync(new URL('supabase/migrations/20260912010256_hc_jobseeker_visit_reservation_safe_read_v1.sql', root), 'utf8');
const safeSettings = readFileSync(new URL('supabase/migrations/20260912140000_hc_jobseeker_visit_settings_safe_read_v1.sql', root), 'utf8');
const historyRouteSql = readFileSync(new URL('supabase/migrations/20260914040000_hc_jobseeker_visit_history_route_v1.sql', root), 'utf8');
const repository = readFileSync(new URL('src/lib/visitRepository.ts', root), 'utf8');
const ui = readFileSync(new URL('src/components/VisitTrialPanel.tsx', root), 'utf8');
const route = readFileSync(new URL('src/VisitRouteRoot.tsx', root), 'utf8');
const main = readFileSync(new URL('src/main.tsx', root), 'utf8');
const notificationCenter = readFileSync(new URL('src/components/NotificationCenter.tsx', root), 'utf8');
const navigation = readFileSync(new URL('src/components/VisitNavigationEnhancer.tsx', root), 'utf8');
const app = readFileSync(new URL('src/App.tsx', root), 'utf8');

const foundationMarkers = [
  'create table if not exists public.hc_visit_settings',
  'create table if not exists public.hc_visit_reservations',
  "experience_type in ('visit','half_day_trial','full_day_trial')",
  "status in ('requested','confirmed','declined','cancelled','completed','no_show')",
  'hc_visit_reservations_one_active_per_job_idx',
  'create or replace function public.hc_request_visit',
  'create or replace function public.hc_cancel_visit',
  'security invoker',
];
for (const marker of foundationMarkers) {
  if (!foundation.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Visit/trial foundation contract missing: ${marker}`);
}

const safeReadMarkers = [
  'create or replace function public.hc_list_my_visit_reservations',
  'security definer',
  "set search_path = ''",
  'ho_private.current_clerk_user_id() is not null',
  'r.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()',
  'revoke all on function public.hc_list_my_visit_reservations(uuid) from public, anon, authenticated',
  'grant execute on function public.hc_list_my_visit_reservations(uuid) to authenticated, service_role',
];
for (const marker of safeReadMarkers) {
  if (!safeRead.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Candidate-safe visit read contract missing: ${marker}`);
}
const returnBlock = safeRead.slice(safeRead.indexOf('returns table'), safeRead.indexOf('language sql'));
for (const forbidden of ['facility_note', 'jobseeker_clerk_user_id', 'organization_id']) {
  if (returnBlock.includes(forbidden)) throw new Error(`Candidate-safe visit RPC return type leaks private field: ${forbidden}`);
}

const safeSettingsMarkers = [
  'create or replace function public.hc_jobseeker_get_visit_settings',
  'security definer',
  "set search_path = ''",
  'from public.hc_jobseeker_job_feed j',
  'join public.hc_visit_settings s on s.facility_id = j.facility_id',
  'ho_private.current_clerk_user_id() is not null',
  'j.id = p_job_id',
  'revoke all on function public.hc_jobseeker_get_visit_settings(uuid) from public, anon, authenticated',
  'grant execute on function public.hc_jobseeker_get_visit_settings(uuid) to authenticated, service_role',
];
for (const marker of safeSettingsMarkers) {
  if (!safeSettings.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Candidate-safe visit settings contract missing: ${marker}`);
}
const settingsReturnBlock = safeSettings.slice(safeSettings.indexOf('returns table'), safeSettings.indexOf('language sql'));
for (const forbidden of ['organization_id', 'capacity_per_slot', 'updated_by_clerk_user_id', 'created_at', 'updated_at']) {
  if (settingsReturnBlock.includes(forbidden)) throw new Error(`Candidate-safe visit settings RPC return type leaks private/internal field: ${forbidden}`);
}

const historyMarkers = [
  'create or replace function public.hc_jobseeker_list_my_visits()',
  'security definer',
  "set search_path = ''",
  "nullif(ho_private.current_clerk_user_id(), '') is not null",
  'r.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()',
  'limit 100',
  'revoke all on function public.hc_jobseeker_list_my_visits() from public, anon, authenticated',
  'grant execute on function public.hc_jobseeker_list_my_visits() to authenticated, service_role',
  "v_link := format('/visits?visit_id=%s#visit-%s'",
  "'jobseeker:visit:' || new.id::text || ':' || new.status",
];
for (const marker of historyMarkers) {
  if (!historyRouteSql.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Candidate visit history/deep-link contract missing: ${marker}`);
}
const historyReturnBlock = historyRouteSql.slice(historyRouteSql.indexOf('returns table'), historyRouteSql.indexOf('language sql'));
for (const forbidden of ['facility_note', 'jobseeker_clerk_user_id', 'organization_id', 'facility_id']) {
  if (historyReturnBlock.includes(forbidden)) throw new Error(`Candidate visit history RPC return type leaks private/internal field: ${forbidden}`);
}

const repositoryMarkers = [
  "rpc('hc_jobseeker_get_visit_settings'",
  "rpc('hc_list_my_visit_reservations'",
  "rpc('hc_jobseeker_list_my_visits'",
  "rpc('hc_request_visit'",
  "rpc('hc_cancel_visit'",
  'Cloudflareまたはローカルの環境変数',
];
for (const marker of repositoryMarkers) {
  if (!repository.includes(marker)) throw new Error(`Visit/trial repository contract missing: ${marker}`);
}

const forbiddenRepositoryMarkers = [
  ".from('hc_visit_settings')",
  ".from('hc_visit_reservations')",
  'facility_note',
  'jobseeker_clerk_user_id',
  'updated_by_clerk_user_id',
  'service_role',
];
for (const marker of forbiddenRepositoryMarkers) {
  if (repository.includes(marker)) throw new Error(`Candidate visit repository must not access private visit surface: ${marker}`);
}

const uiMarkers = [
  '園見学',
  '半日体験',
  '1日体験',
  '予約をキャンセル',
  '園の現地時間',
  'getVisitSettings(jobId)',
  "settingRow.facility_id !== facilityId",
  'const loadVisitState = useCallback(async (quiet = false) => {',
  "document.visibilityState === 'visible'",
  'window.setInterval(refreshWhenVisible, 60_000)',
  "window.addEventListener('focus', refreshWhenVisible)",
  "window.addEventListener('pageshow', refreshWhenVisible)",
  "document.addEventListener('visibilitychange', refreshWhenVisible)",
  "window.addEventListener('hc:visits-refresh', refreshWhenVisible)",
  "window.removeEventListener('focus', refreshWhenVisible)",
  "window.removeEventListener('pageshow', refreshWhenVisible)",
  "document.removeEventListener('visibilitychange', refreshWhenVisible)",
  "window.removeEventListener('hc:visits-refresh', refreshWhenVisible)",
];
for (const marker of uiMarkers) {
  if (!ui.includes(marker)) throw new Error(`Visit/trial UI contract missing: ${marker}`);
}
if (ui.includes('facility_note')) throw new Error('Candidate visit UI must never render facility_note.');
if (!ui.includes('if (!quiet && mountedRef.current) setLoading(true);')) throw new Error('Visit/trial background refresh must not replace the panel with a loading state.');
if (!app.includes('<VisitTrialPanel jobId={job.id} facilityId={job.facility_id} />')) {
  throw new Error('Visit/trial booking is not connected to expanded job details.');
}

const routeMarkers = [
  'listMyVisits()',
  "const ACTIVE_STATUSES = new Set<VisitReservationStatus>(['requested', 'confirmed'])",
  "document.visibilityState !== 'visible'",
  'window.setInterval(refreshWhenVisible, 60_000)',
  "window.addEventListener('focus', refreshWhenVisible)",
  "window.addEventListener('pageshow', refreshWhenVisible)",
  "document.addEventListener('visibilitychange', refreshWhenVisible)",
  "window.addEventListener('hc:visits-refresh', refreshWhenVisible)",
  'visits.find((item) => item.reservation_id === visitId)',
  'handledVisitRef.current = visitId',
  'id={`visit-${item.reservation_id}`}',
  'tabIndex={-1}',
  '園見学',
  '半日体験',
  '1日体験',
  '日程調整中',
  '日程調整不可',
  'キャンセル',
  '完了',
  '未参加',
];
for (const marker of routeMarkers) {
  if (!route.includes(marker)) throw new Error(`Dedicated visit history route contract missing: ${marker}`);
}
if (!main.includes("window.location.pathname.startsWith('/visits') ? <VisitRouteRoot />")) throw new Error('Dedicated /visits route is not wired in main.tsx.');
if (!main.includes('<VisitNavigationEnhancer />')) throw new Error('Visit history navigation enhancer is not mounted globally.');
if (!navigation.includes('href="/visits"') || !navigation.includes('見学・体験')) throw new Error('Visit history navigation entry is missing.');
if (!notificationCenter.includes("'/visits'")) throw new Error('Notification safe-path allow-list must include /visits.');
if (!notificationCenter.includes('VISIT_NOTIFICATION_TYPES')) throw new Error('Visit lifecycle notifications are not recognized by NotificationCenter.');
if (!notificationCenter.includes("parsed.searchParams.get('visit_id')")) throw new Error('Visit notification deep link must validate visit_id.');
if (!notificationCenter.includes("target.startsWith('/visits')")) throw new Error('Visit notification must perform a real route navigation.');

console.log('Hoiku Color visit/trial candidate privacy contract passed.');
