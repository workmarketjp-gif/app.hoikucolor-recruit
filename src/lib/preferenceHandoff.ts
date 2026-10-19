import type { JobseekerMatchingPreferences } from './profilePreferencesRepository';

/**
 * Childcare values chosen on hoikucolor.jp before signing up (the homepage finder) travel
 * here as allow-listed ids in the signup URL: /signup?hc_values=agency,outdoor&hc_pref=東京都
 *
 * They are kept in localStorage (they survive refreshes, email-code entry, the Google
 * redirect and a closed tab) for a limited time, and are written to the account only
 * after the signed-in candidate confirms. Saving only ADDS values; nothing the candidate
 * already saved is removed or replaced.
 */

/** LP finder id → the candidate app's childcare value vocabulary (see jobMatching.ts). */
export const HANDOFF_VALUE_MAP: Record<string, string> = {
  agency: '子ども主体',
  outdoor: '外遊び重視',
  individual: '個別支援',
  small: '少人数保育',
  'mixed-age': '異年齢保育',
  team: 'チーム保育',
  music: '教育・学習',
  inclusive: 'インクルーシブ保育',
};

export const HANDOFF_PREFECTURES = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];

export const HANDOFF_PARAMS = ['hc_values', 'hc_pref'] as const;
export const HANDOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_VALUES = 3;
const storageKey = 'hc_pref_handoff_v1';

export type PreferenceHandoff = { childcareValues: string[]; prefecture: string | null; capturedAt: number };

/** Allow-listed handoff from a query string, or null when nothing valid is present. */
export function parseHandoff(search: string, now = Date.now()): PreferenceHandoff | null {
  const params = new URLSearchParams(search);
  const ids = (params.get('hc_values') || '').split(',').map((id) => id.trim()).filter(Boolean);
  const childcareValues = [...new Set(ids.map((id) => HANDOFF_VALUE_MAP[id]).filter((value): value is string => Boolean(value)))].slice(0, MAX_VALUES);
  const prefectureParam = (params.get('hc_pref') || '').trim();
  const prefecture = HANDOFF_PREFECTURES.includes(prefectureParam) ? prefectureParam : null;
  if (!childcareValues.length) return null; // A prefecture alone is not a finder result.
  return { childcareValues, prefecture, capturedAt: now };
}

function validStored(value: unknown, now: number): PreferenceHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PreferenceHandoff>;
  if (typeof raw.capturedAt !== 'number' || now - raw.capturedAt > HANDOFF_TTL_MS || raw.capturedAt > now + 60_000) return null;
  const allowed = new Set(Object.values(HANDOFF_VALUE_MAP));
  const childcareValues = Array.isArray(raw.childcareValues) ? [...new Set(raw.childcareValues.filter((item): item is string => typeof item === 'string' && allowed.has(item)))].slice(0, MAX_VALUES) : [];
  if (!childcareValues.length) return null;
  const prefecture = typeof raw.prefecture === 'string' && HANDOFF_PREFECTURES.includes(raw.prefecture) ? raw.prefecture : null;
  return { childcareValues, prefecture, capturedAt: raw.capturedAt };
}

/**
 * Called on every app start (signed in or not): store a handoff from the URL and remove
 * the handoff params from the address bar. A newer finder result replaces an older one.
 */
export function captureHandoffFromLocation(now = Date.now()) {
  try {
    const url = new URL(window.location.href);
    if (!HANDOFF_PARAMS.some((key) => url.searchParams.has(key))) return;
    const handoff = parseHandoff(url.search, now);
    if (handoff) localStorage.setItem(storageKey, JSON.stringify(handoff));
    HANDOFF_PARAMS.forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Storage or history unavailable: the candidate can still pick values on their profile.
  }
}

export function readPendingHandoff(now = Date.now()): PreferenceHandoff | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const handoff = validStored(JSON.parse(raw), now);
    if (!handoff) localStorage.removeItem(storageKey);
    return handoff;
  } catch {
    return null;
  }
}

export function clearPendingHandoff() {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

export type HandoffPlan = { addValues: string[]; addPrefecture: string | null; keptValues: string[] };

/** What saving would add to the current preferences. Existing values are always kept. */
export function planHandoff(current: Pick<JobseekerMatchingPreferences, 'childcare_values' | 'desired_prefectures'>, handoff: PreferenceHandoff): HandoffPlan {
  const addValues = handoff.childcareValues.filter((value) => !current.childcare_values.includes(value));
  const addPrefecture = handoff.prefecture && !current.desired_prefectures.includes(handoff.prefecture) ? handoff.prefecture : null;
  return { addValues, addPrefecture, keptValues: current.childcare_values };
}

/** The full preference object to save: a union with the latest stored preferences. */
export function mergeHandoff(current: JobseekerMatchingPreferences, handoff: PreferenceHandoff): JobseekerMatchingPreferences {
  const plan = planHandoff(current, handoff);
  return {
    ...current,
    childcare_values: [...current.childcare_values, ...plan.addValues],
    desired_prefectures: plan.addPrefecture ? [...current.desired_prefectures, plan.addPrefecture] : current.desired_prefectures,
  };
}
