import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const main = read('src/main.tsx');
const mobile = read('src/mobile-hardening.css');
const ranking = read('src/components/RankingDisclosureEnhancer.tsx');
const rankingCss = read('src/components/RankingDisclosureEnhancer.css');
const repo = read('src/lib/recruitRepository.ts');
const rankedCatalog = read('supabase/migrations/20260913090000_hc_jobseeker_ranked_catalog_v1.sql');
const paginatedSearch = read('supabase/migrations/20260913100000_hc_jobseeker_search_pagination_v1.sql');

const checks = [
  [main.includes("import './mobile-hardening.css';"), 'global mobile hardening must be loaded after the baseline styles'],
  [main.includes('<RankingDisclosureEnhancer />'), 'ranking disclosure enhancer must be mounted globally'],
  [mobile.includes('@media(max-width:390px)'), '390px-specific mobile hardening must remain present'],
  [mobile.includes('min-height:44px'), 'primary mobile interactions must retain a 44px minimum hit target'],
  [mobile.includes('env(safe-area-inset-bottom)'), 'mobile layout must account for bottom safe-area insets'],
  [mobile.includes('.compare-table-scroll'), 'facility comparison must keep a dedicated horizontal scroll surface'],
  [mobile.includes('#application-messages') && mobile.includes('[id^="interview-"]'), 'selection deep-link targets must clear the sticky mobile header'],
  [ranking.includes("window.location.pathname.startsWith('/jobs')"), 'ranking disclosure must be scoped to job search'],
  [ranking.includes('`表示順 ${organicPosition}`'), 'job cards must label their current organic display position'],
  [ranking.includes("'指定求人'"), 'deep-linked jobs must be distinguished from organic ranking positions'],
  [ranking.includes('card.dataset.jobId === deepLinkedJobId'), 'specified-job disclosure must bind to canonical job UUID'],
  [ranking.includes('現在は有料の上位表示を適用していません'), 'current organic ordering must explicitly state that paid boosting is not active'],
  [ranking.includes('将来、有料枠を導入する場合は「PR」と明示'), 'future paid placements must be contractually disclosed as PR'],
  [ranking.includes('園の申告内容を Verified 実績として扱うことはありません'), 'facility claims must never be presented as Verified ranking evidence'],
  [ranking.includes("if (badge.textContent !== label)"), 'ranking observer must avoid a self-triggering text mutation loop'],
  [rankingCss.includes('@media(max-width:390px)'), 'ranking disclosure must retain a 390px layout'],
  [repo.includes('quality_points') && repo.includes('transparency_pct') && repo.includes('publishedAtEpoch'), 'organic ranking fallback must preserve Verified quality, transparency, then freshness ordering'],
  [repo.includes("rpc('hc_jobseeker_list_ranked_jobs')"), 'legacy matching/comparison catalog must stay candidate-safe while server pagination is rolled out'],
  [rankedCatalog.includes('hc_public_workplace_profiles') && rankedCatalog.includes('hc_public_finance_profiles'), 'ranked catalog must enrich only from candidate-safe public HO/HF profiles'],
  [paginatedSearch.includes('hc_public_workplace_profiles') && paginatedSearch.includes('hc_public_finance_profiles'), 'paginated search must enrich only from candidate-safe public HO/HF profiles'],
  [!rankedCatalog.includes('hc_verified_workplace_snapshots') && !rankedCatalog.includes('hc_verified_finance_snapshots'), 'ranked catalog must never read raw Verified snapshots'],
  [!paginatedSearch.includes('hc_verified_workplace_snapshots') && !paginatedSearch.includes('hc_verified_finance_snapshots'), 'paginated search must never read raw Verified snapshots'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker mobile/ranking contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}

console.log(`Jobseeker mobile/ranking contract passed (${checks.length} checks).`);
