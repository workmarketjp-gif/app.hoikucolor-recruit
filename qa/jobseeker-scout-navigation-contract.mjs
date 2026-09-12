import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const component = read('src/components/ScoutNavigationEnhancer.tsx');
const css = read('src/components/ScoutNavigationEnhancer.css');
const main = read('src/main.tsx');
const repository = read('src/lib/scoutInboxRepository.ts');

const checks = [
  ['main mounts the scout navigation enhancer', main.includes('<ScoutNavigationEnhancer />')],
  ['pending count uses the candidate-safe scout RPC repository', component.includes('listJobseekerScouts') && repository.includes("rpc('hc_jobseeker_list_scouts')")],
  ['only pending invitations contribute to the badge', component.includes("scout.scout_status === 'pending'")],
  ['sidebar exposes the dedicated scouts route', component.includes('href="/scouts"') && component.includes('data-scout-navigation="true"')],
  ['dashboard exposes a scouts callout', component.includes('scout-dashboard-callout') && component.includes('回答待ちのスカウト')],
  ['topbar exposes a scouts shortcut', component.includes('scout-topbar-link') && component.includes('aria-label={pendingCount')],
  ['pending state refreshes while the app remains open', component.includes('60000') && component.includes('visibilitychange')],
  ['existing scouts nav gets a pending badge instead of a duplicate link', component.includes('existingScoutNav') && component.includes('scout-existing-nav-badge')],
  ['mobile dashboard layout is explicitly constrained', css.includes('@media(max-width:760px)') && css.includes('grid-template-columns:38px minmax(0,1fr)')],
];

const failures = checks.filter(([, ok]) => !ok);
if (failures.length) {
  for (const [label] of failures) console.error(`FAIL: ${label}`);
  process.exit(1);
}
for (const [label] of checks) console.log(`PASS: ${label}`);
