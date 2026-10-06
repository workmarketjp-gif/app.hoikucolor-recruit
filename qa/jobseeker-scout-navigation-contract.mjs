import fs from 'node:fs';

// Scouts are reached from regular navigation (sidebar, My page, Home "to do", account
// sheet, notifications). No enhancer injects links or polls scouts in the background.
const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const shell = read('src/components/CandidateShell.tsx');
const notification = read('src/components/NotificationCenter.tsx');
const main = read('src/main.tsx');
const inbox = read('src/components/ScoutInbox.tsx');
const repository = read('src/lib/scoutInboxRepository.ts');
const sources = [
  'src/App.tsx', 'src/AppRoot.tsx', 'src/main.tsx', 'src/components/CandidateShell.tsx', 'src/components/NotificationCenter.tsx',
  'src/components/DocumentVaultPanel.tsx', 'src/views/MatchesView.tsx', 'src/views/CompareView.tsx', 'src/views/SpotJobsView.tsx', 'src/views/VisitsView.tsx',
].map(read);

const checks = [
  ['no navigation enhancer is mounted', !main.includes('Enhancer') && !fs.existsSync('src/components/ScoutNavigationEnhancer.tsx')],
  ['the inbox reads through the candidate-safe scout RPC repository', inbox.includes('listJobseekerScouts') && repository.includes("rpc('hc_jobseeker_list_scouts')")],
  ['scouts are only listed by the scout inbox (no background scout polling elsewhere)', sources.every((source) => !source.includes('listJobseekerScouts'))],
  ['sidebar exposes the dedicated scouts route', shell.includes("{ href: '/scouts', label: 'スカウト', icon: 'sparkles' }")],
  ['My page and the account sheet expose the scouts route', app.includes('<a href="/scouts">スカウト') && shell.includes('href="/scouts" onClick={onClose}')],
  ['Home surfaces pending scouts from the attention summary', app.includes('pending_scouts_count') && app.includes('href="/scouts">届いたスカウト')],
  ['header carries no scout shortcut', !notification.includes('scout-shortcut') && !shell.includes('scout-topbar-link')],
  ['pending state refreshes only while the inbox is open and visible', inbox.includes('window.setInterval') && inbox.includes("document.visibilityState === 'visible'") && inbox.includes('visibilitychange')],
];

const failures = checks.filter(([, ok]) => !ok);
if (failures.length) {
  for (const [label] of failures) console.error(`FAIL: ${label}`);
  process.exit(1);
}
for (const [label] of checks) console.log(`PASS: ${label}`);
