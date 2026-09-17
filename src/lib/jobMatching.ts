import type { Job, JobseekerProfile } from './recruitRepository';
import type { JobseekerMatchingPreferences } from './profilePreferencesRepository';

export type JobMatchResult = {
  condition_score: number | null;
  condition_reasons: string[];
  condition_gaps: string[];
  matched_childcare_values: string[];
  unmatched_childcare_values: string[];
  childcare_value_signal_pct: number | null;
  has_preferences: boolean;
};

type MatchInput = {
  job: Job;
  profile: JobseekerProfile | null;
  preferences: JobseekerMatchingPreferences;
};

type WeightedCheck = {
  active: boolean;
  matched: boolean;
  weight: number;
  reason?: string;
  gap?: string;
};

const childcarePatterns: Record<string, string[]> = {
  '子ども主体': ['子ども主体', 'こども主体', '子どもの主体性', '主体性を大切', '主体的な遊び'],
  '自由保育': ['自由保育', '自由遊び', '自由な保育', '自分で遊びを選'],
  '遊び中心': ['遊び中心', '遊びを中心', '遊びを通して', '遊びから学'],
  '外遊び重視': ['外遊び', '戸外活動', '園庭遊び', '自然体験', '散歩を大切'],
  '一斉保育': ['一斉保育', '設定保育', '集団活動'],
  '教育・学習': ['教育・学習', '学習活動', '英語教育', '英語保育', 'リトミック', 'モンテッソーリ'],
  '異年齢保育': ['異年齢保育', '縦割り保育', '異年齢交流'],
  '少人数保育': ['少人数保育', '少人数制', '小規模保育'],
  '行事重視': ['行事を大切', '行事に力', '年間行事', '季節行事'],
  '行事は最小限': ['行事は最小限', '行事を減ら', '行事少なめ', '大きな行事なし'],
  'チーム保育': ['チーム保育', '複数担任', '職員同士で連携', 'チームで保育'],
  '個別支援': ['個別支援', '一人ひとりに合わせ', '個々に合わせ', '個別の関わり'],
  'インクルーシブ保育': ['インクルーシブ保育', 'インクルーシブ', '障害児保育', '多様性を尊重'],
};

const workPreferencePatterns: Record<string, string[]> = {
  '残業少なめ': ['残業少なめ', '残業ほぼなし', '残業ほとんどなし', '時間外ほぼなし', '月平均残業5時間以内'],
  '持ち帰りなし': ['持ち帰りなし', '持ち帰り仕事なし', '持ち帰り業務なし'],
  '有休を取りやすい': ['有休取得率', '有給取得率', '有休を取りやすい', '有給を取りやすい', '有休消化率'],
  '土曜勤務少なめ': ['土曜勤務少なめ', '土曜出勤少なめ', '土曜日勤務少なめ'],
  '早番少なめ': ['早番少なめ', '早番月', '早番の回数'],
  '遅番少なめ': ['遅番少なめ', '遅番月', '遅番の回数'],
  'ICT活用': ['ICT活用', 'ICT導入', '業務ICT', '保育ICT'],
  '研修充実': ['研修充実', '研修制度', '園内研修', '外部研修'],
  '子育てと両立': ['子育てと両立', '子育て中', '時短勤務', '育児短時間', '子の看護休暇'],
  '配置に余裕': ['配置に余裕', 'ゆとりある配置', '基準以上の配置', '手厚い配置'],
  '見学して決めたい': ['園見学', '見学歓迎', '見学可能'],
  '体験して決めたい': ['保育体験', '職場体験', '一日体験', '半日体験'],
};

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・,，。、\-_/／]/g, '');
}

function includesTerm(text: string, term: string) {
  const normalized = normalizeText(term);
  return Boolean(normalized) && text.includes(normalized);
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => includesTerm(text, term));
}

function jobText(job: Job) {
  return normalizeText([
    job.title,
    job.description,
    job.working_hours,
    job.holidays,
    job.required_qualification,
    job.benefits,
    job.facility_type,
  ].filter(Boolean).join(' '));
}

function metricNumber(job: Job, key: string) {
  const value = job.verified_workplace?.verified_metrics?.[key]?.value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function workPreferenceMatched(job: Job, text: string, preference: string) {
  if (includesAny(text, workPreferencePatterns[preference] || [preference])) return true;
  if (preference === '残業少なめ') {
    const value = metricNumber(job, 'average_monthly_overtime_hours');
    return value !== null && value <= 5;
  }
  if (preference === '有休を取りやすい') {
    const value = metricNumber(job, 'paid_leave_usage_rate_pct');
    return value !== null && value >= 70;
  }
  if (preference === '土曜勤務少なめ') {
    const value = metricNumber(job, 'average_monthly_saturday_shift_count');
    return value !== null && value <= 1;
  }
  if (preference === '早番少なめ') {
    const value = metricNumber(job, 'average_monthly_early_shift_count');
    return value !== null && value <= 2;
  }
  if (preference === '遅番少なめ') {
    const value = metricNumber(job, 'average_monthly_late_shift_count');
    return value !== null && value <= 2;
  }
  return false;
}

function salaryCheck(job: Job, preferences: JobseekerMatchingPreferences): WeightedCheck {
  const isHourly = job.salary_type === 'hourly';
  const desired = isHourly ? preferences.desired_hourly_wage_min : preferences.desired_monthly_salary_min;
  if (desired === null) return { active: false, matched: false, weight: 20 };
  const offered = job.salary_max ?? job.salary_min;
  if (offered === null) {
    return { active: true, matched: false, weight: 20, gap: '希望給与との比較に必要な給与上限・下限が未掲載です' };
  }
  const matched = offered >= desired;
  return {
    active: true,
    matched,
    weight: 20,
    reason: matched ? `希望${isHourly ? '時給' : '月給'}の下限を満たしています` : undefined,
    gap: matched ? undefined : `掲載給与が希望${isHourly ? '時給' : '月給'}の下限に届いていません`,
  };
}

export function hasMatchingPreferences(profile: JobseekerProfile | null, preferences: JobseekerMatchingPreferences) {
  return Boolean(
    preferences.desired_prefectures.length
    || preferences.desired_cities.length
    || preferences.desired_monthly_salary_min !== null
    || preferences.desired_hourly_wage_min !== null
    || preferences.work_preferences.length
    || preferences.childcare_values.length
    || profile?.desired_positions.length
    || profile?.desired_employment_types.length
    || profile?.qualifications.length,
  );
}

export function matchJob({ job, profile, preferences }: MatchInput): JobMatchResult {
  const text = jobText(job);
  const checks: WeightedCheck[] = [];

  const hasLocationPreference = preferences.desired_prefectures.length > 0 || preferences.desired_cities.length > 0;
  const cityMatch = Boolean(job.city && includesAny(normalizeText(job.city), preferences.desired_cities));
  const prefectureMatch = Boolean(job.prefecture && includesAny(normalizeText(job.prefecture), preferences.desired_prefectures));
  checks.push({
    active: hasLocationPreference,
    matched: cityMatch || prefectureMatch,
    weight: 25,
    reason: cityMatch ? `希望市区町村「${job.city}」に一致` : prefectureMatch ? `希望都道府県「${job.prefecture}」に一致` : undefined,
    gap: hasLocationPreference && !(cityMatch || prefectureMatch) ? '希望エリアとは異なります' : undefined,
  });

  const desiredEmployment = profile?.desired_employment_types || [];
  const employmentMatch = Boolean(job.employment_type && includesAny(normalizeText(job.employment_type), desiredEmployment));
  checks.push({
    active: desiredEmployment.length > 0,
    matched: employmentMatch,
    weight: 20,
    reason: employmentMatch ? `希望雇用形態「${job.employment_type}」に一致` : undefined,
    gap: desiredEmployment.length > 0 && !employmentMatch ? '希望雇用形態とは異なります' : undefined,
  });

  const desiredPositions = profile?.desired_positions || [];
  const positionMatch = includesAny(normalizeText(job.title), desiredPositions);
  checks.push({
    active: desiredPositions.length > 0,
    matched: positionMatch,
    weight: 15,
    reason: positionMatch ? '希望職種と求人タイトルが一致しています' : undefined,
    gap: desiredPositions.length > 0 && !positionMatch ? '希望職種との一致は確認できません' : undefined,
  });

  checks.push(salaryCheck(job, preferences));

  const qualifications = profile?.qualifications || [];
  const hasQualificationRequirement = Boolean(job.required_qualification?.trim());
  const qualificationMatch = hasQualificationRequirement && includesAny(normalizeText(job.required_qualification), qualifications);
  checks.push({
    active: qualifications.length > 0 && hasQualificationRequirement,
    matched: Boolean(qualificationMatch),
    weight: 10,
    reason: qualificationMatch ? '登録資格と応募資格が一致しています' : undefined,
    gap: qualifications.length > 0 && hasQualificationRequirement && !qualificationMatch ? '登録資格と応募資格の一致を確認してください' : undefined,
  });

  const workMatches = preferences.work_preferences.filter((preference) => workPreferenceMatched(job, text, preference));
  checks.push({
    active: preferences.work_preferences.length > 0,
    matched: workMatches.length > 0,
    weight: 10,
    reason: workMatches.length ? `働き方の希望「${workMatches.slice(0, 2).join('・')}」を確認できました` : undefined,
    gap: preferences.work_preferences.length > 0 && !workMatches.length ? '希望する働き方は求人情報・HO実績だけでは確認できません' : undefined,
  });

  const activeChecks = checks.filter((check) => check.active);
  const possibleWeight = activeChecks.reduce((sum, check) => sum + check.weight, 0);
  const earnedWeight = activeChecks.reduce((sum, check) => sum + (check.matched ? check.weight : 0), 0);
  const conditionScore = possibleWeight > 0 ? Math.round((earnedWeight / possibleWeight) * 100) : null;

  const selectedValues = preferences.childcare_values;
  const matchedValues = selectedValues.filter((value) => includesAny(text, childcarePatterns[value] || [value]));
  const unmatchedValues = selectedValues.filter((value) => !matchedValues.includes(value));
  const valueSignal = selectedValues.length ? Math.round((matchedValues.length / selectedValues.length) * 100) : null;

  return {
    condition_score: conditionScore,
    condition_reasons: activeChecks.flatMap((check) => check.matched && check.reason ? [check.reason] : []),
    condition_gaps: activeChecks.flatMap((check) => !check.matched && check.gap ? [check.gap] : []),
    matched_childcare_values: matchedValues,
    unmatched_childcare_values: unmatchedValues,
    childcare_value_signal_pct: valueSignal,
    has_preferences: hasMatchingPreferences(profile, preferences),
  };
}

export function compareMatchedJobs(a: { job: Job; match: JobMatchResult }, b: { job: Job; match: JobMatchResult }) {
  const conditionDiff = (b.match.condition_score ?? -1) - (a.match.condition_score ?? -1);
  if (conditionDiff !== 0) return conditionDiff;
  const valueDiff = (b.match.childcare_value_signal_pct ?? -1) - (a.match.childcare_value_signal_pct ?? -1);
  if (valueDiff !== 0) return valueDiff;
  const qualityA = Number(a.job.verified_workplace?.quality_points || 0) + Number(a.job.verified_finance?.quality_points || 0);
  const qualityB = Number(b.job.verified_workplace?.quality_points || 0) + Number(b.job.verified_finance?.quality_points || 0);
  if (qualityB !== qualityA) return qualityB - qualityA;
  return Date.parse(b.job.published_at || '') - Date.parse(a.job.published_at || '');
}
