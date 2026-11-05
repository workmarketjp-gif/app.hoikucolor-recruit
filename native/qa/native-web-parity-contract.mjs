import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const tabs = read('src/app/(tabs)/_layout.tsx');
const webTabs = read('../src/components/CandidateShell.tsx');
const career = read('src/app/(tabs)/career.tsx');
const careerExperience = read('src/components/CareerExperience.tsx');
const careerApi = read('src/lib/careerApi.ts');
const jobs = read('src/app/(tabs)/jobs.tsx');
const saved = read('src/app/(tabs)/saved.tsx');
const home = read('src/app/(tabs)/home.tsx');
const profile = read('src/app/(tabs)/profile.tsx');
const jobDetail = read('src/app/job/[id].tsx');
const scouts = read('src/app/scouts.tsx');
const spot = read('src/app/spot-jobs.tsx');
const matches = read('src/app/matches.tsx');
const compare = read('src/app/compare.tsx');
const core = read('src/lib/jobseekerCoreApi.ts');
const journey = read('src/lib/applicationJourneyApi.ts');
const parityApi = read('src/lib/candidateParityApi.ts');
const matching = read('src/lib/jobMatching.ts');

const checks = [
  ['five canonical bottom tabs are present',
    ['home', 'jobs', 'career', 'saved', 'profile'].every((name) => tabs.includes(`name="${name}"`))],
  ['notifications and applications are secondary, not extra tabs', tabs.includes('name="notifications"') && tabs.includes('name="applications" options={{ href: null')],
  ['Web and Native both define the same five destinations',
    ["id: 'home'", "id: 'jobs'", "id: 'career'", "id: 'saved'", "id: 'profile'"].every((value) => webTabs.includes(value)) &&
    !tabs.includes('name="messages"')],
  ['Native career screen renders an owned native experience',
    career.includes('<CareerExperience variant="page" />') &&
    home.includes('<CareerExperience variant="home" />') &&
    careerExperience.includes('usePinnedCandidateAction') &&
    careerExperience.includes('candidateViewOwnerKey') &&
    careerExperience.includes('privacy.canAccessPrivateData') &&
    !careerExperience.includes('Linking.openURL')],
  ['career market and owner state reuse authoritative Web RPC contracts',
    ['hc_jobseeker_salary_market_v1', 'hc_jobseeker_official_wage_stats_v1', 'hc_jobseeker_holiday_market_v1',
      'hc_jobseeker_career_scenario_jobs_v1', 'hc_jobseeker_get_career_conditions', 'hc_jobseeker_save_career_conditions',
      'hc_jobseeker_delete_career_conditions'].every((name) => careerApi.includes(name)) &&
    careerApi.includes('await getCareerConditions(client)') &&
    careerApi.includes('await getMatchingPreferencesForCareer') === false],
  ['tab wording mirrors Web', ['ホーム', '求人を探す', 'お給料', '気になる', 'マイページ'].every((label) => tabs.includes(`title: '${label}'`))],
  ['search uses current v2 RPC', core.includes("rpc('hc_jobseeker_search_jobs_v2'") && !core.includes("rpc('hc_jobseeker_search_jobs',")],
  ['saved jobs use v2 status read model', core.includes("rpc('hc_jobseeker_list_saved_jobs_with_status_v2'")],
  ['job detail uses v2 exact lookup', journey.includes("rpc('hc_jobseeker_get_job_v2'")],
  ['external jobs cannot use direct HC apply CTA', jobDetail.includes('job.is_external') && jobDetail.includes('掲載元で詳細を見る') && jobDetail.includes('Linking.openURL')],
  ['scout screen is materialized', scouts.includes('届いた匿名スカウト') && scouts.includes('匿名スカウト・公開範囲')],
  ['spot screen is materialized', spot.includes('募集中のスポット勤務') && spot.includes('あなたのスポット勤務')],
  ['match screen is materialized', matches.includes('条件マッチ') && matches.includes('保育観サイン')],
  ['comparison screen is materialized', compare.includes('園を比較') && compare.includes('勤務実績') && compare.includes('会計実績')],
  ['secondary mobile entries exist on Home/My page',
    home.includes("router.push('/matches'") && home.includes("router.push('/spot-jobs'") &&
    profile.includes("router.push('/scouts'") && profile.includes("router.push('/visits'") &&
    profile.includes("router.push('/spot-jobs'") && profile.includes("router.push('/matches'") &&
    profile.includes("router.push('/compare'")],
  ['scout writes are pinned to current session',
    scouts.includes('pinCandidateAction') && parityApi.includes('hc_jobseeker_respond_scout')],
  ['spot writes are pinned and canonical',
    spot.includes('pinCandidateAction') && spot.includes('submitApplication')],
  ['Web matching rules are mirrored in Native',
    matching.includes('condition_score') && matching.includes('childcare_value_signal_pct') &&
    matching.includes('average_monthly_overtime_hours')],
  ['candidate wording has no internal HO/HF abbreviations',
    ![tabs, jobs, saved, home, profile, jobDetail, scouts, spot, matches, compare]
      .some((source) => /(^|[^A-Za-z])(HO|HM|HF|HC)(?![A-Za-z])/.test(source))],
  ['candidate wording has no JOBSEEKER label',
    ![tabs, jobs, saved, home, profile, jobDetail, scouts, spot, matches, compare]
      .some((source) => /JOBSEEKER/.test(source))],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} Native Web parity contract check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} Native Web parity contract checks passed.`);
