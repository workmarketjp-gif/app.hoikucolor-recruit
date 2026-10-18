// @ts-self-types="./draftGuard.d.ts"
// Post-check for AI résumé drafts. Plain JavaScript so the edge function (Deno) and the
// qa contract (Node) run the exact same code.
//
// A draft is rejected when it names a qualification, an employer / facility or a year
// (calendar year or duration) that cannot be traced back to the applicant's own saved
// data. The check is deliberately strict: a false rejection only costs a retry, while a
// false acceptance could put invented experience on a real résumé.

const KANJI_NUMERALS = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** NFKC (full-width digits / half-width kana), no whitespace. */
export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, '');
}

/** Every string inside an arbitrarily nested value, normalized and joined. */
export function buildCorpus(...values) {
  const parts = [];
  const visit = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value === 'object') { Object.entries(value).forEach(([key, item]) => { parts.push(key); visit(item); }); return; }
    parts.push(String(value));
  };
  values.forEach(visit);
  return normalizeText(parts.join('\n'));
}

function kanjiNumber(text) {
  if (/^\d+$/.test(text)) return Number(text);
  if (!/^[〇一二三四五六七八九十]+$/.test(text)) return null;
  if (!text.includes('十')) return Number([...text].map((ch) => KANJI_NUMERALS[ch]).join(''));
  const [tens, ones] = text.split('十');
  return (tens ? KANJI_NUMERALS[tens] ?? 0 : 1) * 10 + (ones ? KANJI_NUMERALS[ones] ?? 0 : 0);
}

function eraToWestern(era, year) {
  if (era === '令和') return 2018 + year;
  if (era === '平成') return 1988 + year;
  if (era === '昭和') return 1925 + year;
  return year;
}

function monthsBetween(startYm, endYm) {
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

/**
 * Year facts derivable from the saved data.
 * - calendar: every year that appears in a saved date (plus the current year).
 * - durations: whole-year spans the draft may state (experience years, each job, all jobs).
 * - textual: any "N年" the applicant wrote themselves.
 */
export function allowedYears({ resume, profile, now = new Date() }) {
  const calendar = new Set([now.getFullYear()]);
  const durations = new Set();
  const addDuration = (years) => {
    if (!Number.isFinite(years) || years < 0) return;
    [Math.floor(years), Math.round(years), Math.ceil(years)].forEach((value) => durations.add(value));
  };
  const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ym = /^(\d{4})-(\d{2})$/;
  let totalMonths = 0;
  for (const entry of [...(resume?.education ?? []), ...(resume?.employment ?? [])]) {
    for (const value of [entry?.start_ym, entry?.end_ym]) {
      const match = typeof value === 'string' && value.match(ym);
      if (match) calendar.add(Number(match[1]));
    }
  }
  for (const entry of resume?.employment ?? []) {
    const end = entry?.is_current ? nowYm : entry?.end_ym;
    if (typeof entry?.start_ym === 'string' && ym.test(entry.start_ym) && typeof end === 'string' && ym.test(end)) {
      const months = Math.max(0, monthsBetween(entry.start_ym, end));
      totalMonths += months;
      addDuration(months / 12);
    }
  }
  if (totalMonths > 0) addDuration(totalMonths / 12);
  for (const value of Object.values(resume?.qualification_acquired ?? {})) {
    const match = typeof value === 'string' && value.match(ym);
    if (match) calendar.add(Number(match[1]));
  }
  if (typeof profile?.years_of_experience === 'number') addDuration(profile.years_of_experience);

  const textual = new Set();
  for (const match of buildCorpus(resume, profile).matchAll(/(令和|平成|昭和)?(\d{1,4}|[〇一二三四五六七八九十]+)(?:ヶ|カ|か)?年/g)) {
    const number = kanjiNumber(match[2]);
    if (number === null) continue;
    textual.add(number);
    if (match[1]) calendar.add(eraToWestern(match[1], number));
  }
  return { calendar, durations, textual };
}

/** Years / durations in the draft that the saved data does not support. */
export function unsupportedYears(draft, years) {
  const text = normalizeText(draft);
  const maxDuration = Math.max(0, ...years.durations, ...[...years.textual].filter((n) => n < 100));
  const found = [];
  for (const match of text.matchAll(/(令和|平成|昭和)?(\d{1,4}|[〇一二三四五六七八九十]+)(?:ヶ|カ|か)?年(?!生)(度|目|間|半|以上|近く|弱|を通|中)?/g)) {
    const number = kanjiNumber(match[2]);
    if (number === null) continue;
    const tail = match[3] ?? '';
    if (number === 1 && (tail === 'を通' || tail === '中')) continue; // 1年を通して / 一年中
    if (years.textual.has(number)) continue;
    if (match[1]) {
      if (years.calendar.has(eraToWestern(match[1], number))) continue;
    } else if (number >= 1900) {
      if (years.calendar.has(number)) continue;
    } else if (tail === '以上' || tail === '近く' || tail === '弱') {
      if (number <= maxDuration + (tail === '以上' ? 0 : 1)) continue;
    } else if (years.durations.has(number)) {
      continue;
    }
    found.push(match[0]);
  }
  return [...new Set(found)];
}

const CREDENTIAL_TOKEN = /[一-龯々ァ-ヶー]{1,14}?(?:士|師|教諭|検定|指導員|支援員|免許状?|ベビーシッター)/g;
const NOT_A_CREDENTIAL = /(同士|教師)$/;

function supportedBySuffix(token, corpus) {
  for (let start = 0; start <= token.length - 3; start += 1) {
    if (corpus.includes(token.slice(start))) return true;
  }
  return false;
}

/** Qualification-like terms (〇〇士, 〇〇教諭, 〇〇免許 …) that do not appear in the saved data. */
export function unsupportedQualifications(draft, corpus) {
  const text = normalizeText(draft);
  const found = [];
  for (const match of text.matchAll(CREDENTIAL_TOKEN)) {
    // Extend to the full kanji run so 幼稚園教諭二種免許 is checked as one term.
    let token = match[0];
    const before = text.slice(0, match.index).match(/[一-龯々ァ-ヶー]*$/)?.[0] ?? '';
    token = before + token;
    if (token.length < 3 || NOT_A_CREDENTIAL.test(token)) continue;
    if (!supportedBySuffix(token, corpus)) found.push(match[0].length >= 3 ? match[0] : token);
  }
  return [...new Set(found)];
}

const FACILITY_SUFFIX = '(?:保育園|保育所|幼稚園|こども園|子ども園|学童クラブ|学童保育所|児童館|児童クラブ|託児所)';
const COMPANY_PREFIX = '(?:株式会社|有限会社|合同会社|社会福祉法人|学校法人)';
// Descriptive words that turn a facility suffix into a category, not a name.
const GENERIC_WORDS = [
  '幼保連携型', '幼稚園型', '保育所型', '地方裁量型', '企業主導型', '事業所内', '地域型', '小規模', '中規模', '大規模',
  '認可外', '認可', '認証', '認定', '院内', '私立', '公立', '市立', '区立', '町立', '村立', '県立', '都立', '府立', '道立', '国立',
  '民間', '家庭的', '夜間', '病児', '病後児', '一時', '複数', '前職', '現職', '近隣', '地域', '市内', '区内', '都内', '県内',
  '系列', '新設', '大型', '少人数', '異年齢', '全国', '各', '同', '当', '貴', '前', '現', '他', '別', '新', '型',
];
const INFLECTION_END = /[るたいなのでにをはがともくてしえ]$/;

function stripGeneric(prefix) {
  let rest = prefix;
  let changed = true;
  while (rest && changed) {
    changed = false;
    for (const word of GENERIC_WORDS) {
      if (rest.startsWith(word)) { rest = rest.slice(word.length); changed = true; break; }
    }
  }
  return rest;
}

/** Facility / employer names in the draft that do not appear in the saved data. */
export function unsupportedOrganizations(draft, corpus) {
  const text = normalizeText(draft);
  const found = [];
  const check = (name, full) => {
    if (!name) return;
    if (corpus.includes(full) || (name.length >= 2 && corpus.includes(name))) return;
    found.push(full);
  };
  for (const match of text.matchAll(new RegExp(`([一-龯々ァ-ヶーA-Za-z0-9]*)(${FACILITY_SUFFIX})`, 'g'))) {
    let prefix = match[1];
    if (!prefix) {
      // Hiragana names (ひまわり保育園): a run of 3+ kana that does not end like a verb / particle.
      const kana = text.slice(0, match.index).match(/[ぁ-ん]{3,10}$/)?.[0] ?? '';
      if (kana && !INFLECTION_END.test(kana)) check(kana, kana + match[2]);
      continue;
    }
    prefix = stripGeneric(prefix);
    check(prefix, prefix + match[2]);
  }
  for (const match of text.matchAll(new RegExp(`${COMPANY_PREFIX}([一-龯々ァ-ヶーぁ-んA-Za-z0-9]{1,20})`, 'g'))) {
    check(match[1], match[0]);
  }
  return [...new Set(found)];
}

/** All violations; an empty result means the draft passed. */
export function checkDraft(draft, { corpus, years }) {
  const result = {
    qualifications: unsupportedQualifications(draft, corpus),
    organizations: unsupportedOrganizations(draft, corpus),
    years: unsupportedYears(draft, years),
  };
  return { ...result, ok: !result.qualifications.length && !result.organizations.length && !result.years.length };
}
