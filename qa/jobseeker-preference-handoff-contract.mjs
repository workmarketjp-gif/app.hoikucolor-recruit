import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Executes the real handoff/analytics modules (Node type stripping) with an in-memory
// browser, then checks the source contracts that keep the flow consent-based and private.

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function browser(href) {
  const location = new URL(href);
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = {
    location,
    history: { state: null, replaceState: (_state, _title, next) => { const url = new URL(next, location.origin); location.href = url.href; } },
  };
}

browser('https://app.hoikucolor.jp/signup');
const handoff = await import('../src/lib/preferenceHandoff.ts');
const analytics = await import('../src/lib/analytics.ts');

const empty = { desired_prefectures: [], desired_cities: [], desired_monthly_salary_min: null, desired_hourly_wage_min: null, available_weekdays: [], available_time_from: null, available_time_to: null, max_commute_minutes: null, classroom_experience: [], leadership_roles: [], preferred_child_ages: [], childcare_values: [], work_preferences: [] };

test('only allow-listed values and prefectures are accepted, at most three values', () => {
  const parsed = handoff.parseHandoff('?hc_values=agency,outdoor,evil,%3Cscript%3E,team,small&hc_pref=東京都', 1000);
  assert.deepEqual(parsed.childcareValues, ['子ども主体', '外遊び重視', 'チーム保育']);
  assert.equal(parsed.prefecture, '東京都');
  assert.equal(handoff.parseHandoff('?hc_values=agency&hc_pref=Narnia').prefecture, null);
  assert.equal(handoff.parseHandoff('?hc_values=nope'), null);
  assert.equal(handoff.parseHandoff('?hc_pref=東京都'), null, 'a prefecture alone is not a finder result');
});

test('capture stores the handoff and strips handoff params but keeps return_to', () => {
  browser('https://app.hoikucolor.jp/signup?hc_values=agency,outdoor&hc_pref=東京都&return_to=%2Fjobs%3Fjob_id%3D11111111-1111-4111-8111-111111111111');
  handoff.captureHandoffFromLocation(5000);
  assert.equal(window.location.searchParams.has('hc_values'), false);
  assert.equal(window.location.searchParams.has('hc_pref'), false);
  assert.equal(window.location.searchParams.get('return_to'), '/jobs?job_id=11111111-1111-4111-8111-111111111111');
  const pending = handoff.readPendingHandoff(6000);
  assert.deepEqual(pending.childcareValues, ['子ども主体', '外遊び重視']);
});

test('pending handoff survives reloads, expires after its TTL and rejects tampering', () => {
  browser('https://app.hoikucolor.jp/signup?hc_values=agency');
  handoff.captureHandoffFromLocation(0);
  assert.ok(handoff.readPendingHandoff(handoff.HANDOFF_TTL_MS - 1), 'still pending before expiry (e.g. after a refresh)');
  assert.equal(handoff.readPendingHandoff(handoff.HANDOFF_TTL_MS + 1), null, 'expired handoff is discarded');
  assert.equal(localStorage.getItem('hc_pref_handoff_v1'), null, 'expired handoff is removed from storage');
  localStorage.setItem('hc_pref_handoff_v1', JSON.stringify({ childcareValues: ['任意の文字列'], prefecture: '東京都', capturedAt: 0 }));
  assert.equal(handoff.readPendingHandoff(1), null, 'values outside the vocabulary are rejected');
  localStorage.setItem('hc_pref_handoff_v1', '{not json');
  assert.equal(handoff.readPendingHandoff(1), null, 'corrupt storage fails closed');
});

test('saving only adds values; existing preferences are never removed or replaced', () => {
  const current = { ...empty, childcare_values: ['行事重視', '子ども主体'], desired_prefectures: ['神奈川県'], desired_cities: ['横浜市'], desired_monthly_salary_min: 250000, work_preferences: ['残業少なめ'] };
  const pending = { childcareValues: ['子ども主体', '外遊び重視'], prefecture: '東京都', capturedAt: 0 };
  const plan = handoff.planHandoff(current, pending);
  assert.deepEqual(plan.addValues, ['外遊び重視']);
  assert.equal(plan.addPrefecture, '東京都');
  const merged = handoff.mergeHandoff(current, pending);
  assert.deepEqual(merged.childcare_values, ['行事重視', '子ども主体', '外遊び重視']);
  assert.deepEqual(merged.desired_prefectures, ['神奈川県', '東京都']);
  assert.deepEqual(merged.desired_cities, ['横浜市']);
  assert.equal(merged.desired_monthly_salary_min, 250000);
  assert.deepEqual(merged.work_preferences, ['残業少なめ']);
  const again = handoff.planHandoff(merged, pending);
  assert.deepEqual([again.addValues, again.addPrefecture], [[], null], 'a second save is a no-op (idempotent)');
});

test('sign_up is reported only for a fresh, verified account after the backend confirms, once', async () => {
  browser('https://app.hoikucolor.jp/');
  const now = Date.now();
  const fresh = { userId: 'user_a', createdAt: new Date(now - 60_000), emailVerified: true, method: 'email' };
  assert.equal(analytics.isFreshVerifiedSignup({ ...fresh, emailVerified: false }, now), false, 'unverified email is not a registration');
  assert.equal(analytics.isFreshVerifiedSignup({ ...fresh, createdAt: new Date(now - analytics.SIGNUP_WINDOW_MS - 1) }, now), false, 'old accounts are logins');
  assert.equal(await analytics.reportVerifiedSignup(fresh, async () => { throw new Error('rpc failed'); }), false, 'backend failure is not a registration');
  assert.equal(await analytics.reportVerifiedSignup(fresh, async () => ({})), true);
  assert.equal(await analytics.reportVerifiedSignup(fresh, async () => ({})), false, 'reported only once per account');
  assert.equal(await analytics.reportVerifiedSignup({ ...fresh, userId: 'user_b' }, async () => ({})), true, 'dedup is per account');
});

test('source contracts: consent before write, verified persistence, privacy', () => {
  const prompt = fs.readFileSync('src/components/PreferenceHandoffPrompt.tsx', 'utf8');
  const appRoot = fs.readFileSync('src/AppRoot.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const router = fs.readFileSync('src/lib/router.ts', 'utf8');
  const source = fs.readFileSync('src/lib/analytics.ts', 'utf8');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  const effect = prompt.slice(prompt.indexOf('useEffect(() => {'), prompt.indexOf('if (state.kind === \'idle\') return null;'));
  assert.ok(!effect.includes('saveJobseekerMatchingPreferences'), 'nothing is saved before the candidate confirms');
  assert.ok(prompt.includes('if (busy.current'), 'duplicate clicks are ignored while saving');
  assert.ok(prompt.includes('const latest = await getJobseekerMatchingPreferences();'), 'merge uses the latest stored preferences');
  assert.ok(prompt.includes('const stored = await getJobseekerMatchingPreferences();') && prompt.includes('missing.length'), 'success is shown only after reading the saved values back');
  assert.ok(prompt.indexOf('clearPendingHandoff();', prompt.indexOf('const stored')) > 0, 'handoff is cleared only after verified save');
  assert.ok(appRoot.includes('captureHandoffFromLocation();'), 'handoff is captured before the login screen renders');
  assert.ok(appRoot.includes('reportVerifiedSignup(evidence, getJobseekerMatchingPreferences)'), 'sign_up requires an authenticated backend call');
  assert.ok(!/track\('sign_up'/.test(appRoot), 'the login screen never reports sign_up directly');
  assert.ok(app.includes('<PreferenceHandoffPrompt userKey={userKey}'), 'the prompt is mounted in the signed-in app');
  assert.ok(router.includes('durableReturnTarget()') && router.includes('localStorage.removeItem(returnStorageKey);'), 'return target survives a closed tab and is always cleared');
  assert.ok(source.includes("startsWith('/jobs/test/')"), 'private recruitment pages never load analytics');
  assert.ok(source.includes('${window.location.origin}${window.location.pathname}'), 'page locations omit query strings');
  assert.ok(!/userId|email/.test(source.slice(source.indexOf('export function track'), source.indexOf('export function trackPageView'))), 'track() never adds personal fields');
  assert.ok(pkg.scripts.build.includes('test:jobseeker-preference-handoff'), 'contract gates production builds');
});
