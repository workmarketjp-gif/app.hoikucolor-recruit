// Supabase Edge Function: hc-hellowork-import
// Deploy with JWT verification enabled. The function additionally requires the
// caller JWT to carry role=service_role, so it is never a browser-facing importer.
//
// It imports only the PUBLIC Hello Work detail page. If Hello Work marks the page
// as limited to registered jobseekers, the row is retained as blocked/private and
// is never exposed through hc_external_job_public_feed.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const SOURCE = 'hellowork';
const PARSER_VERSION = 'hellowork-public-v2';
const MAX_URLS = 50;
const SEARCH_URL = 'https://www.hellowork.mhlw.go.jp/kensaku/GECA110010.do';
const HELLOWORK_JOB_CLASS_MAJOR = '163';
const HELLOWORK_JOB_CLASS_MINOR = '01';
const DISCOVERY_PAGE_SIZE = 50;
const DISCOVERY_CONCURRENCY = 5;
const ALLOWED_POSITION = /(保育士|保育教諭|幼稚園教諭|保育補助|看護師|准看護師|栄養士|管理栄養士|調理師|調理員|園長|施設長|主任|子育て支援員)/;
const RESTRICTED_MARKERS = [
  'ハローワークに求職登録した方のみを対象',
  '事業所の意向により公開していません',
  // Some employers use the free-text notes to opt out of secondary publication
  // even when the Hello Work page itself is public. Fail closed on any such wording.
  '無断転載',
  '転載禁止',
  '掲載はお断り',
];

type ImportBody = { urls?: string[]; refresh?: boolean; discover?: boolean };

type Normalized = {
  source: typeof SOURCE;
  source_job_id: string;
  source_url: string;
  source_status: 'active' | 'closed' | 'expired' | 'removed' | 'blocked';
  public_republication_allowed: boolean;
  organization_name: string | null;
  facility_name: string;
  facility_type: string | null;
  prefecture: string | null;
  city: string | null;
  address: string | null;
  title: string;
  description: string;
  employment_type: string | null;
  salary_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_note: string | null;
  working_hours: string | null;
  holidays: string | null;
  required_qualification: string | null;
  benefits: string | null;
  number_of_positions: number;
  source_published_at: string | null;
  closing_at: string | null;
  expires_at: string | null;
  fetched_at: string;
  last_verified_at: string;
  online_self_apply_allowed: boolean | null;
  source_payload: Record<string, unknown>;
  updated_at: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function decodeJwtPayload(request: Request): Record<string, unknown> | null {
  const header = request.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function equalSecret(left: string, right: string) {
  const encode = async (value: string) => new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  const [a, b] = await Promise.all([encode(left), encode(right)]);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

async function requireAuthorizedSync(request: Request) {
  const payload = decodeJwtPayload(request);
  if (payload?.role === 'service_role') return true;

  const supplied = request.headers.get('x-hc-sync-secret') || '';
  if (!supplied) return false;

  const { data, error } = await supabase
    .from('hc_external_source_sync_control')
    .select('sync_secret,enabled')
    .eq('source', SOURCE)
    .maybeSingle();
  if (error || !data?.enabled || typeof data.sync_secret !== 'string') return false;

  return equalSecret(supplied, data.sync_secret);
}

function officialHelloWorkUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname !== 'www.hellowork.mhlw.go.jp') return null;
    if (url.pathname !== '/kensaku/GECA110010.do') return null;
    if (url.searchParams.get('action') !== 'dispDetailBtn') return null;
    if (!url.searchParams.get('kJNo')) return null;
    return url;
  } catch {
    return null;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|td|th|li|dt|dd|h[1-6]|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\r/g, '')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function clean(value: string | null | undefined) {
  const v = (value || '').replace(/^[:：|｜\s]+/, '').replace(/[\s|｜]+$/, '').trim();
  return v || null;
}

function section(text: string, label: string, nextLabels: string[]) {
  const start = text.indexOf(label);
  if (start < 0) return null;
  const from = start + label.length;
  let end = text.length;
  for (const next of nextLabels) {
    const idx = text.indexOf(next, from);
    if (idx >= 0 && idx < end) end = idx;
  }
  return clean(text.slice(from, end));
}

function firstMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return clean(match?.[1]);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0)).toISOString();
}

function jobNumberFrom(text: string, url: URL) {
  const displayed = firstMatch(text, /求人番号\s*[|｜]?\s*([0-9]{5}-[0-9]{8})/);
  if (displayed) return displayed;
  const raw = (url.searchParams.get('kJNo') || '').replace(/\D/g, '');
  return raw.length === 13 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : null;
}

function locationParts(value: string | null) {
  const cleaned = clean(value)?.replace(/就業場所に関する特記事項[\s\S]*$/, '').trim() || null;
  if (!cleaned) return { prefecture: null, city: null, address: null };
  const prefecture = firstMatch(cleaned, /^(.+?[都道府県])/);
  const city = prefecture
    ? firstMatch(cleaned.slice(prefecture.length), /^(.+?(?:市|区|町|村))/)
    : null;
  return { prefecture, city, address: cleaned };
}

function salaryFields(note: string | null, employment: string | null) {
  const normalized = note?.replace(/,/g, '') || '';
  const values = [...normalized.matchAll(/([0-9]{3,7})\s*円/g)].map((m) => Number(m[1])).filter(Number.isFinite);
  const salaryType = /時給/.test(normalized) || /パート/.test(employment || '') ? 'hourly' : 'monthly';
  return {
    salary_type: salaryType,
    salary_min: values.length ? Math.min(...values) : null,
    salary_max: values.length > 1 ? Math.max(...values) : null,
    salary_note: note,
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function normalize(url: URL): Promise<Normalized> {
  const fetchedAt = new Date().toISOString();
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'HoikuColorJobSync/1.0 (+https://app.hoikucolor.jp)',
    },
    redirect: 'follow',
  });

  const html = await response.text();
  const text = htmlToText(html);
  const sourceJobId = jobNumberFrom(text, url);
  if (!sourceJobId) throw new Error('HELLOWORK_JOB_NUMBER_NOT_FOUND');

  const restricted = RESTRICTED_MARKERS.some((marker) => text.includes(marker));
  const onlineSelfApplyAllowed = /オンライン自主応募\s*可/.test(text);
  const title = section(text, '職種', ['仕事内容', '雇用形態', '求人番号'])?.replace(/^職種解説\s*/, '') || '求人';
  const location = section(text, '就業場所', ['職種', '仕事内容', '雇用形態', '受動喫煙対策']);
  const { prefecture, city, address } = locationParts(location);
  const employer = section(text, '事業所名', ['就業場所', '職種', '仕事内容']);
  const hiddenEmployer = !employer || employer.includes('公開していません');

  const description = section(text, '仕事内容', ['雇用形態', '雇用期間', '就業場所']) || '';
  const employment = section(text, '雇用形態', ['雇用期間', '就業場所', '年齢']);
  const salaryNote = section(text, '賃金（手当等を含む）', ['給与の内訳', '賃金形態等', '通勤手当'])
    || section(text, '賃金', ['給与の内訳', '賃金形態等', '通勤手当']);
  const salary = salaryFields(salaryNote, employment);
  const workingHours = section(text, '就業時間', ['時間外労働時間', '休憩時間', '年間休日数', '休日等']);
  const holidays = section(text, '休日等', ['その他の労働条件等', '加入保険等', '企業年金']);
  const qualification = section(text, '必要な免許・資格', ['試用期間', '賃金・手当', '賃金']);
  const benefits = section(text, '加入保険等', ['企業年金', '退職金共済', '退職金制度', '定年制']);
  const closingText = section(text, '紹介期限日', ['受理安定所', '求人区分']);
  const receivedText = section(text, '受付年月日', ['紹介期限日', '受理安定所']);
  const closingAt = parseDate(closingText);
  const sourcePublishedAt = parseDate(receivedText);
  const positionsText = section(text, '募集人数', ['募集理由', '選考方法', '選考結果通知']);
  const positions = Number(firstMatch(positionsText || '', /(\d+)/)) || 1;

  const expired = Boolean(closingAt && new Date(closingAt).getTime() < Date.now());
  const relevant = ALLOWED_POSITION.test(title);
  const status: Normalized['source_status'] =
    !response.ok ? 'removed'
      : restricted || hiddenEmployer || !relevant ? 'blocked'
      : expired ? 'expired'
      : 'active';

  const allowed = response.ok && !restricted && !hiddenEmployer && relevant && !expired;
  const contentHash = await sha256(text);

  return {
    source: SOURCE,
    source_job_id: sourceJobId,
    source_url: url.toString(),
    source_status: status,
    public_republication_allowed: allowed,
    organization_name: hiddenEmployer ? null : employer,
    facility_name: hiddenEmployer ? '非公開求人' : employer!,
    facility_type: null,
    prefecture,
    city,
    address,
    title,
    description,
    employment_type: employment,
    ...salary,
    working_hours: workingHours,
    holidays,
    required_qualification: qualification,
    benefits,
    number_of_positions: Math.max(1, positions),
    source_published_at: sourcePublishedAt,
    closing_at: closingAt,
    expires_at: closingAt,
    fetched_at: fetchedAt,
    last_verified_at: fetchedAt,
    online_self_apply_allowed: onlineSelfApplyAllowed,
    source_payload: {
      parser_version: PARSER_VERSION,
      http_status: response.status,
      content_sha256: contentHash,
      restricted,
      hidden_employer: hiddenEmployer,
      relevant_position: relevant,
      online_self_apply_allowed: onlineSelfApplyAllowed,
    },
    updated_at: fetchedAt,
  };
}

function cookieHeaderFromResponse(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return '';
  return setCookie
    .split(/,(?=[^;,]+=)/)
    .map((part) => part.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function postHelloWorkForm(params: Record<string, string>, cookie = '') {
  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'HoikuColorJobSync/1.0 (+https://hoikucolor.jp)',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams(params),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HELLOWORK_SEARCH_HTTP_${response.status}`);
  return {
    html: await response.text(),
    cookie: cookie || cookieHeaderFromResponse(response),
  };
}

function detailUrlsFromSearchHtml(html: string) {
  const urls = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\bid=(?:"ID_dispDetailBtn"|'ID_dispDetailBtn')[^>]*>/gi)) {
    const tag = match[0];
    const href = tag.match(/\bhref=(?:"([^"]+)"|'([^']+)')/i);
    const raw = decodeHtml(href?.[1] || href?.[2] || '');
    if (!raw) continue;
    try {
      const url = new URL(raw, SEARCH_URL);
      if (officialHelloWorkUrl(url.toString())) urls.add(url.toString());
    } catch {
      // Ignore malformed result links. A fully malformed page is caught by zero-result safety below.
    }
  }
  return [...urls];
}

async function discoverHelloWorkPage(prefecture: number, page: number) {
  const pref = String(prefecture).padStart(2, '0');
  const initial = await postHelloWorkForm({
    kjKbnRadioBtn: '1',
    tDFK1CmbBox: pref,
    freeWordRadioBtn: '0',
    freeWordInput: '保育士',
    searchBtn: '',
    screenId: 'GECA110010',
    maba_vrbs: 'searchBtn',
    fwListNaviDispTop: String(DISCOVERY_PAGE_SIZE),
    fwListNaviDisp: String(DISCOVERY_PAGE_SIZE),
  });

  if (page <= 1) return detailUrlsFromSearchHtml(initial.html);

  const paged = await postHelloWorkForm({
    fwListNaviBtn1: '',
    fwListNowPage: '1',
    fwListLeftPage: String(page),
    fwListNaviCount: '7',
    fwListNaviDisp: String(DISCOVERY_PAGE_SIZE),
    screenId: 'GECA110010',
    maba_vrbs: '',
  }, initial.cookie);

  return detailUrlsFromSearchHtml(paged.html);
}

async function upsertNormalized(row: Normalized) {
  const { error } = await supabase
    .from('hc_external_job_sources')
    .upsert(row, { onConflict: 'source,source_job_id' });
  if (error) throw new Error(`UPSERT_FAILED:${error.code || 'unknown'}:${String(error.message || '').slice(0, 160)}`);
}

async function importUrls(urls: string[]) {
  const results: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < urls.length; offset += DISCOVERY_CONCURRENCY) {
    const slice = urls.slice(offset, offset + DISCOVERY_CONCURRENCY);
    const batch = await Promise.all(slice.map(async (value) => {
      try {
        const row = await normalize(new URL(value));
        await upsertNormalized(row);
        return {
          source_job_id: row.source_job_id,
          status: row.source_status,
          published: row.public_republication_allowed,
        } as Record<string, unknown>;
      } catch (error) {
        return {
          url: value,
          status: 'error',
          code: String((error as Error)?.message || 'IMPORT_FAILED').slice(0, 120),
        } as Record<string, unknown>;
      }
    }));
    results.push(...batch);
  }
  return results;
}

async function discoveryState() {
  const { data, error } = await supabase
    .from('hc_external_source_sync_control')
    .select('prefecture_cursor,page_cursor,enabled,completed_cycles')
    .eq('source', SOURCE)
    .maybeSingle();
  if (error || !data) throw new Error('DISCOVERY_STATE_MISSING');
  return data as {
    prefecture_cursor: number;
    page_cursor: number;
    enabled: boolean;
    completed_cycles: number;
  };
}

async function discoverBatch() {
  const state = await discoveryState();
  if (!state.enabled) return { skipped: true, reason: 'SYNC_DISABLED' };

  const prefecture = Math.min(47, Math.max(1, Number(state.prefecture_cursor || 1)));
  const page = Math.max(1, Number(state.page_cursor || 1));
  const urls = await discoverHelloWorkPage(prefecture, page);

  // Fail closed if the first page unexpectedly parses as empty. This protects us
  // against silently walking all 47 prefectures after a Hello Work markup change.
  if (page === 1 && urls.length === 0) {
    console.log(JSON.stringify({
      event: 'hellowork-search-diagnostic',
      prefecture,
      page,
      parser_version: PARSER_VERSION,
      note: 'zero detail links parsed from search response',
    }));
    await supabase
      .from('hc_external_source_sync_control')
      .update({
        last_scan_at: new Date().toISOString(),
        last_batch_discovered: 0,
        last_batch_imported: 0,
        last_error: `HELLOWORK_SEARCH_PARSE_EMPTY_PREF_${String(prefecture).padStart(2, '0')}`,
        updated_at: new Date().toISOString(),
      })
      .eq('source', SOURCE);
    throw new Error('HELLOWORK_SEARCH_PARSE_EMPTY');
  }

  const results = await importUrls(urls);
  const published = results.filter((item) => item.published === true).length;
  const errorRows = results.filter((item) => item.status === 'error');
  const errors = errorRows.length;
  const errorCodes = [...new Set(errorRows.map((item) => String(item.code || 'IMPORT_FAILED')))].slice(0, 5);

  const lastPage = urls.length < DISCOVERY_PAGE_SIZE;
  let nextPrefecture = prefecture;
  let nextPage = page + 1;
  let completedCycles = Number(state.completed_cycles || 0);

  if (lastPage) {
    nextPrefecture += 1;
    nextPage = 1;
    if (nextPrefecture > 47) {
      nextPrefecture = 1;
      completedCycles += 1;
    }
  }

  const now = new Date().toISOString();
  const { error: stateError } = await supabase
    .from('hc_external_source_sync_control')
    .update({
      prefecture_cursor: nextPrefecture,
      page_cursor: nextPage,
      completed_cycles: completedCycles,
      last_scan_at: now,
      last_batch_discovered: urls.length,
      last_batch_imported: results.length - errors,
      last_batch_published: published,
      last_error: errors ? `${errors}_IMPORT_ERRORS:${errorCodes.join(',')}` : null,
      updated_at: now,
    })
    .eq('source', SOURCE);
  if (stateError) throw new Error('DISCOVERY_STATE_UPDATE_FAILED');

  return {
    skipped: false,
    prefecture,
    page,
    discovered: urls.length,
    imported: results.length - errors,
    published,
    errors,
    error_codes: errorCodes,
    next_prefecture: nextPrefecture,
    next_page: nextPage,
    completed_cycles: completedCycles,
  };
}

async function refreshUrls() {
  const { data, error } = await supabase
    .from('hc_external_job_sources')
    .select('source_url')
    .eq('source', SOURCE)
    .in('source_status', ['active', 'closed'])
    .order('last_verified_at', { ascending: true })
    .limit(MAX_URLS);
  if (error) throw new Error('REFRESH_LIST_FAILED');
  return (data || []).map((row) => row.source_url).filter((value): value is string => typeof value === 'string');
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  if (!(await requireAuthorizedSync(request))) return json(403, { ok: false, code: 'SYNC_AUTH_REQUIRED' });

  const body = await request.json().catch(() => ({})) as ImportBody;

  if (body.discover) {
    try {
      return json(200, { ok: true, discovery: await discoverBatch() });
    } catch (error) {
      return json(502, {
        ok: false,
        code: String((error as Error)?.message || 'DISCOVERY_FAILED').slice(0, 120),
      });
    }
  }

  const requested = Array.isArray(body.urls) ? body.urls.slice(0, MAX_URLS) : [];
  const candidates = body.refresh && requested.length === 0 ? await refreshUrls() : requested;
  const urls = [...new Set(candidates.map((value) => officialHelloWorkUrl(value)?.toString()).filter((value): value is string => Boolean(value)))];

  if (!urls.length) return json(400, { ok: false, code: 'NO_VALID_HELLOWORK_URLS' });

  const results = await importUrls(urls);
  return json(200, { ok: true, count: results.length, results });
});
