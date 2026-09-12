import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260912103000_hc_jobseeker_interview_transparency_v1.sql', 'utf8');
const repository = fs.readFileSync('src/lib/jobTransparencyRepository.ts', 'utf8');
const panel = fs.readFileSync('src/components/InterviewTransparencyPanel.tsx', 'utf8');
const panelCss = fs.readFileSync('src/components/InterviewTransparencyPanel.css', 'utf8');
const visitPanel = fs.readFileSync('src/components/VisitTrialPanel.tsx', 'utf8');

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`[interview-transparency] missing ${label}: ${text}`);
}

function forbidText(source, text, label) {
  if (source.includes(text)) throw new Error(`[interview-transparency] forbidden ${label}: ${text}`);
}

requireText(migration, 'security definer', 'candidate-safe RPC privilege boundary');
requireText(migration, "j.status = 'published'", 'HC publication gate');
requireText(migration, 'hm.is_published = true', 'HM publication gate');
requireText(migration, 'j.closing_at is null or j.closing_at >= now()', 'closing-date gate');
requireText(migration, 'f.is_published = true', 'published FAQ gate');
requireText(migration, 'revoke all on function public.hc_jobseeker_get_job_transparency(uuid) from anon', 'anon deny');
requireText(migration, 'grant execute on function public.hc_jobseeker_get_job_transparency(uuid) to authenticated', 'authenticated execute');
forbidText(migration, 'admin_memo', 'internal recruitment memo exposure');
forbidText(migration, 'created_by', 'internal actor exposure');

requireText(repository, ".rpc('hc_jobseeker_get_job_transparency'", 'safe transparency RPC usage');
forbidText(repository, ".from('hm_recruitment_jobs')", 'direct HM job table read');
forbidText(repository, ".from('hm_recruitment_faqs')", 'direct HM FAQ table read');
requireText(repository, ".from('hc_public_workplace_profiles')", 'public HO Verified projection');

requireText(panel, '面接で聞きづらいことを、応募前に確認', 'candidate transparency heading');
requireText(panel, '園の公開回答（申告）', 'facility claim source label');
requireText(panel, 'HO Verified（実績）', 'verified source label');
requireText(panel, "metric(verified, 'average_monthly_overtime_hours')", 'verified overtime source');
requireText(panel, "metric(verified, 'paid_leave_usage_rate_pct')", 'verified paid leave source');
requireText(panel, "facilityValue: normalized(claims.overtime)", 'facility overtime kept separate');
requireText(panel, "facilityValue: normalized(claims.take_home_work)", 'facility take-home-work claim');
requireText(panel, '公開回答なし', 'missing facility value stays missing');
requireText(panel, 'HO実績指標は未提供', 'unsupported Verified metric stays missing');
requireText(panel, '公開されていない値を別ソースで補完したり、推測値として表示したりしません', 'no-imputation disclosure');

requireText(visitPanel, '<InterviewTransparencyPanel jobId={jobId} facilityId={facilityId} />', 'job-detail integration');
requireText(visitPanel, 'if (!settings || enabledTypes(settings).length === 0) return transparencyPanel;', 'transparency independent of visit availability');
requireText(panelCss, '@media (max-width: 620px)', 'mobile layout');
requireText(panelCss, "content: '園の公開回答（申告）'", 'mobile source label');
requireText(panelCss, "content: 'HO Verified（実績）'", 'mobile verified label');

console.log('jobseeker interview transparency contract: OK');
