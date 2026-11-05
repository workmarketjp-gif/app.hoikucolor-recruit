import { useSession } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey } from '../lib/candidateViewOwner';
import { disclosedCareerSalary } from '../lib/careerSalaryDisclosure';
import { careerMutationNotice } from '../lib/careerMutationNotice';
import { getJobseekerProfile, type JobseekerProfile } from '../lib/jobseekerCoreApi';
import {
  CareerApiUnavailableError, daysFromText, deleteCareerConditions, formatMan,
  getCareerConditions, getCareerScenarioJobs, getHolidayMarket, getMatchingPreferencesForCareer,
  getOfficialWageStats, getPostedSalaryMarket, manFromYen, saveCareerConditions,
  scenarioSalaryLine, withYourPosition, yenFromMan,
  type CareerConditions, type CareerScenarioId, type CareerScenarioResponse,
  type HolidayMarket, type MatchingPreferencesForCareer, type OfficialWageStats,
  type PostedSalaryMarket,
} from '../lib/careerApi';

type Fields = { salary: string; holidays: string; drop: string; wishSalary: string; wishHolidays: string };
type Basis = 'monthly' | 'hourly' | 'none' | null;
type Path = 'salary' | 'holidays' | 'values';
type Owned<T> = { ownerKey: string; value: T };
type CareerBase = { conditions: CareerConditions | null; conditionsAvailable: boolean; preferences: MatchingPreferencesForCareer; profile: JobseekerProfile | null };
type Loadable<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: string } | { status: 'unavailable' };
const blank: Fields = { salary: '', holidays: '', drop: '', wishSalary: '', wishHolidays: '' };
const EMPTY: CareerConditions = {
  current_monthly_salary: null, current_annual_holidays: null, tolerable_salary_drop: null,
  desired_annual_holidays: null, scenario: 'keep-income', salary_weight: 50,
};
const SCENARIOS: { id: CareerScenarioId; label: string; lead: string }[] = [
  { id: 'keep-income', label: '収入を保つ', lead: '今の月給（なければ希望の最低月給）に、募集の給与が届く求人です。' },
  { id: 'more-holidays', label: '休みを増やす', lead: '許容できる減額の範囲で、年間休日が確認できて、今より多い求人です。' },
  { id: 'balance', label: 'バランス', lead: '年間休日が確認できた求人を、給与と休日の優先度で並べます。' },
];
const DAY_OPTIONS = [110, 115, 120, 125] as const;

function failure(error: unknown) {
  return String((error as { message?: unknown })?.message ?? error);
}

function StateMessage({ state, onRetry }: { state: Loadable<unknown> | null; onRetry?: () => void }) {
  if (!state || state.status === 'loading') return <ActivityIndicator color="#FF2F5F" />;
  if (state.status === 'ready') return null;
  return (
    <View style={styles.notice}>
      <Text style={styles.muted}>{state.status === 'unavailable' ? 'このデータは現在取得できません。数値は表示していません。' : state.error}</Text>
      {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry}><Text style={styles.link}>再確認する</Text></Pressable> : null}
    </View>
  );
}

function Choice({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{text}</Text>
    </Pressable>
  );
}

function NumberField({ label, hint, unit, value, onChange }: { label: string; hint: string; unit: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.numberRow}>
        <TextInput
          accessibilityLabel={label} placeholder={hint} placeholderTextColor="#8B8E96"
          style={styles.numberInput} keyboardType="decimal-pad" value={value}
          onChangeText={onChange} selectTextOnFocus
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.card}><Text style={styles.section}>{title}</Text>{children}</View>;
}

function Action({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, secondary ? styles.actionSecondary : styles.actionPrimary, disabled && styles.actionDisabled]}>
      <Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

function MoneyMarket({ market, own, location, detailed, onToggleDetail }: {
  market: PostedSalaryMarket; own: number | null; location: string; detailed: boolean; onToggleDetail: () => void;
}) {
  const stats = market.monthly_lower_bound;
  const coverage = market.facets.coverage ?? [];
  const bars = stats ? withYourPosition(stats.histogram ?? [], own) : [];
  const maxCount = Math.max(1, ...bars.map((bar) => bar.count));
  return (
    <>
      <Text style={styles.source}>求人票に書かれた月給（下限）・{location || '全国'}の保育士求人</Text>
      {market.population.scope_count === 0 ? (
        <Text style={styles.muted}>この条件で公開中の求人はありません。地域や雇用形態を変更してください。</Text>
      ) : stats === null ? (
        <Text style={styles.muted}>月給で書かれた求人は{market.population.monthly_count}件です。5件以上集まるまで中央値は表示しません。</Text>
      ) : (
        <>
          <View style={styles.compareBox}>
            {own !== null ? <View style={styles.metric}><Text style={styles.metricLabel}>あなた・今のお給料</Text><Text style={styles.metricValue}>{formatMan(own)}</Text></View> : null}
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>求人票・月給の中央値</Text>
              <Text style={styles.metricValue}>{formatMan(stats.median)}</Text>
              <Text style={styles.muted}>募集給与であり実際の支給額ではありません</Text>
            </View>
          </View>
          {own !== null ? (
            <Text style={styles.muted}>
              {Math.abs(own - stats.median) < 5000
                ? '今のお給料は、求人票の月給の真ん中あたりとほぼ同じです。'
                : '今のお給料は、求人票の月給の真ん中あたりより ' + formatMan(Math.abs(own - stats.median)) + (own > stats.median ? ' 高めです。' : ' 低めです。')}
              {'\n'}求人票との比較であり、あなたの価値や能力を示すものではありません。
            </Text>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onToggleDetail}><Text style={styles.link}>{detailed ? '詳しいデータを閉じる' : '詳しいデータを見る'}</Text></Pressable>
          {detailed ? (
            <View style={styles.detailPanel}>
              <Text style={styles.muted}>中央値 {formatMan(stats.median)} / 中央50% {formatMan(stats.q1)}〜{formatMan(stats.q3)}</Text>
              <Text style={styles.muted}>最小・最大 {formatMan(stats.min)}〜{formatMan(stats.max)} / 対象 {stats.count}件</Text>
              {bars.map((bar) => (
                <View key={bar.from} style={styles.chartRow}>
                  <Text style={styles.chartLabel}>{formatMan(bar.from)}台</Text>
                  <View style={styles.chartTrack}><View style={[styles.chartFill, { width: `${Math.min(100, (bar.count / maxCount) * 100)}%` }]} /></View>
                  <Text style={styles.chartCount}>{bar.count}件{bar.containsYou ? '・あなた' : ''}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
      <Text style={styles.footnote}>
        出典：Hoiku Colorの公開中の求人（{market.as_of}時点）。{coverage.length}都道府県の掲載求人から、この条件の{market.population.scope_count}件を対象としています。
        月給の求人{market.population.monthly_count}件、時給等{market.population.not_monthly_count}件は月給比較から除外。
      </Text>
    </>
  );
}

function OfficialWages({ data, experienceYears }: { data: OfficialWageStats | null; experienceYears: number | null }) {
  if (!data) return <Text style={styles.muted}>公的統計の実績値が返されていないため、数値は表示しません。</Text>;
  const matched = experienceYears === null ? null : data.national_by_experience.find(
    (row) => experienceYears >= row.experience_min_years && (row.experience_max_years === null || experienceYears <= row.experience_max_years),
  );
  return (
    <>
      <Text style={styles.source}>公的統計・{data.reference_year}年 {data.source}（{data.occupation}）</Text>
      <Text style={styles.footnote}>全国・経験年数別と地域別の統計は別集計です。組み合わせた推計は行いません。賞与を含まない所定内給与です。</Text>
      {data.national_by_experience.map((row) => (
        <View key={row.experience_label} style={styles.dataLine}>
          <Text style={styles.muted}>{row.experience_label}{matched === row ? '・あなたの経験年数' : ''}</Text>
          <Text style={styles.bold}>{row.monthly_scheduled_cash_yen === null ? '公表なし' : formatMan(row.monthly_scheduled_cash_yen)}</Text>
        </View>
      ))}
      {data.prefecture_all_experience ? <View style={styles.dataLine}>
        <Text style={styles.muted}>{data.prefecture_all_experience.prefecture}・全経験年数</Text>
        <Text style={styles.bold}>{data.prefecture_all_experience.monthly_scheduled_cash_yen === null ? '公表なし' : formatMan(data.prefecture_all_experience.monthly_scheduled_cash_yen)}</Text>
      </View> : null}
      {data.source_url?.startsWith('https://') ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(data.source_url!).catch(() => undefined)}><Text style={styles.link}>公的統計の出典を開く ↗</Text></Pressable> : null}
    </>
  );
}

function ResultCards({ result, onOpenJob }: { result: CareerScenarioResponse; onOpenJob: (id: string) => void }) {
  if (!result.ready) return <Text style={styles.muted}>条件を確認できる求人がまだありません。条件を変更して探してください。</Text>;
  if (result.jobs.length === 0) return <Text style={styles.muted}>この条件に合う求人は見つかりませんでした。希望を広げてお試しください。</Text>;
  return (
    <>
      <Text style={styles.count}>{result.total}件の求人が見つかりました</Text>
      {result.jobs.map((job) => (
        <View key={job.id} style={styles.opportunity}>
          <Text style={styles.facility}>{job.facility_name ?? '園'}</Text>
          <Text style={styles.bold}>{job.title || '募集内容'}{job.employment_type ? '・' + job.employment_type : ''}</Text>
          <Text style={styles.salary}>月給 {formatMan(job.salary_min)}{job.salary_max > job.salary_min ? '〜' + formatMan(job.salary_max) : ''}</Text>
          {job.annual_holidays_days !== null ? <Text style={styles.muted}>年間休日 {job.annual_holidays_days}日{job.annual_holidays_basis === 'minimum' ? '以上' : ''}</Text> : null}
          {job.reach === 'upper-bound-only' ? <Text style={styles.footnote}>募集の幅の上のほうなら届く金額です。</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => onOpenJob(job.id)}><Text style={styles.link}>くわしく見る ›</Text></Pressable>
        </View>
      ))}
    </>
  );
}

/**
 * Same canonical career dataset on Home and お給料. No browser fallback:
 * all edits, comparisons, scenario results and navigation stay Native.
 */
export function CareerExperience({ variant }: { variant: 'home' | 'page' }) {
  const router = useRouter();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const allowed = privacy.canAccessPrivateData() && !privacy.shieldVisible;
  const [base, setBase] = useState<Owned<CareerBase> | null>(null);
  const [fields, setFields] = useState<Fields>(blank);
  const [basis, setBasis] = useState<Basis>(null);
  const [area, setArea] = useState({ prefecture: '', employmentType: '' });
  const [scenario, setScenario] = useState<CareerScenarioId>('keep-income');
  const [weight, setWeight] = useState(50);
  const [path, setPath] = useState<Path>('holidays');
  const [days, setDays] = useState<number>(120);
  const [checkOpen, setCheckOpen] = useState(variant === 'page');
  const [market, setMarket] = useState<Owned<Loadable<PostedSalaryMarket>> | null>(null);
  const [official, setOfficial] = useState<Owned<Loadable<OfficialWageStats | null>> | null>(null);
  const [holiday, setHoliday] = useState<Owned<Loadable<HolidayMarket>> | null>(null);
  const [results, setResults] = useState<Owned<Loadable<CareerScenarioResponse>> | null>(null);
  const [detailsResult, setDetailsResult] = useState<Owned<Loadable<CareerScenarioResponse>> | null>(null);
  const [detailed, setDetailed] = useState(false);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const formRevision = useRef(0);
  const marketGeneration = useRef(0);
  const scenarioGeneration = useRef(0);
  const detailsGeneration = useRef(0);

  const loadBase = useCallback(async () => {
    const ticket = ++generation.current;
    setBase(null);
    setBaseError(null);
    setFields(blank);
    setBasis(null);
    setMarket(null); setOfficial(null); setHoliday(null); setResults(null); setDetailsResult(null);
    setSaveMessage(null);
    if (!ownerKey || !privacy.canAccessPrivateData()) return;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      const [conditionRead, preferences, profile] = await Promise.all([
        getCareerConditions(pinned.client).then((data) => ({ available: true, data })).catch((error: unknown) => {
          if (error instanceof CareerApiUnavailableError) return { available: false, data: null };
          throw error;
        }),
        getMatchingPreferencesForCareer(pinned.client),
        getJobseekerProfile(pinned.client),
      ]);
      if (!pinned.isCurrent() || ticket !== generation.current) return;
      const conditions = conditionRead.data;
      setFields({
        salary: manFromYen(conditions?.current_monthly_salary ?? null),
        holidays: conditions?.current_annual_holidays == null ? '' : String(conditions.current_annual_holidays),
        drop: manFromYen(conditions?.tolerable_salary_drop ?? null),
        wishSalary: manFromYen(preferences.desired_monthly_salary_min),
        wishHolidays: conditions?.desired_annual_holidays == null ? '' : String(conditions.desired_annual_holidays),
      });
      // The Web salary check never reveals saved salary until an explicit 月給 choice.
      setBasis(null);
      setArea({ prefecture: preferences.desired_prefectures[0] ?? profile?.prefecture ?? '', employmentType: '' });
      setScenario(conditions?.scenario ?? 'keep-income');
      setWeight(conditions?.salary_weight ?? 50);
      setDays(conditions?.desired_annual_holidays && DAY_OPTIONS.includes(conditions.desired_annual_holidays as (typeof DAY_OPTIONS)[number])
        ? conditions.desired_annual_holidays : 120);
      setPath(conditions?.current_monthly_salary != null || preferences.desired_monthly_salary_min != null ? 'salary' : 'holidays');
      setBase({ ownerKey, value: { conditions, conditionsAvailable: conditionRead.available, preferences, profile } });
    } catch (error) {
      if (ticket === generation.current) setBaseError(error instanceof CareerApiUnavailableError ? '保存条件のAPIを確認できません。' : failure(error));
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData]);

  useEffect(() => {
    generation.current += 1; marketGeneration.current += 1; scenarioGeneration.current += 1; detailsGeneration.current += 1;
    setBase(null); setFields(blank); setMarket(null); setOfficial(null); setHoliday(null); setResults(null); setDetailsResult(null);
    setBusy(false);
    if (!allowed || !ownerKey) return;
    void loadBase();
    return () => { generation.current += 1; marketGeneration.current += 1; scenarioGeneration.current += 1; detailsGeneration.current += 1; };
  }, [allowed, ownerKey, loadBase]);

  const ready = allowed && ownerKey !== null && base?.ownerKey === ownerKey;
  const current = ready ? base.value : null;
  const own = yenFromMan(fields.salary);
  const disclosedOwn = disclosedCareerSalary(basis, own);
  const selectedMarket = ready && market?.ownerKey === ownerKey ? market.value : null;
  const selectedOfficial = ready && official?.ownerKey === ownerKey ? official.value : null;
  const selectedHoliday = ready && holiday?.ownerKey === ownerKey ? holiday.value : null;
  const selectedResults = ready && results?.ownerKey === ownerKey ? results.value : null;
  const selectedDetails = ready && detailsResult?.ownerKey === ownerKey ? detailsResult.value : null;

  const refreshMarket = useCallback(async () => {
    const ticket = ++marketGeneration.current;
    if (!ready || !ownerKey || (!checkOpen && variant === 'home')) return;
    setMarket({ ownerKey, value: { status: 'loading' } });
    setOfficial({ ownerKey, value: { status: 'loading' } });
    setHoliday({ ownerKey, value: { status: 'loading' } });
    const pinned = await pinCandidateAction();
    if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
    const commit = <T,>(setter: (next: Owned<Loadable<T>>) => void, value: Loadable<T>) => {
      if (pinned.isCurrent() && ticket === marketGeneration.current) setter({ ownerKey, value });
    };
    const read = async <T,>(fn: () => Promise<T>, setter: (next: Owned<Loadable<T>>) => void) => {
      try { commit(setter, { status: 'ready', data: await fn() }); }
      catch (error) { commit(setter, error instanceof CareerApiUnavailableError ? { status: 'unavailable' } : { status: 'error', error: failure(error) }); }
    };
    await Promise.all([
      read(() => getPostedSalaryMarket(pinned.client, area.prefecture, area.employmentType), setMarket),
      read(() => getOfficialWageStats(pinned.client, area.prefecture), setOfficial),
      read(() => getHolidayMarket(pinned.client, area.prefecture), setHoliday),
    ]);
  }, [ready, ownerKey, variant, checkOpen, pinCandidateAction, area.prefecture, area.employmentType]);

  useEffect(() => {
    // Postpone broad market queries while someone edits a region or employment filter.
    // Hide the old region's figures immediately; a late previous response is discarded.
    marketGeneration.current += 1;
    setMarket(null); setOfficial(null); setHoliday(null);
    if (!ready || (!checkOpen && variant === 'home')) return;
    const timer = setTimeout(() => void refreshMarket(), 350);
    return () => { clearTimeout(timer); marketGeneration.current += 1; };
  }, [ready, checkOpen, variant, refreshMarket]);

  const salaryLine = scenarioSalaryLine(scenario, own, yenFromMan(fields.drop), yenFromMan(fields.wishSalary));
  const pathSalaryLine = scenarioSalaryLine('keep-income', own, null, yenFromMan(fields.wishSalary));
  const requestedScenario = path === 'salary' && pathSalaryLine !== null ? 'salary' : path === 'holidays' ? 'holidays' : null;
  const pathKey = [ownerKey, area.prefecture, requestedScenario, pathSalaryLine, days].join('|');
  const detailsKey = [ownerKey, area.prefecture, area.employmentType, scenario, salaryLine, fields.holidays, fields.wishHolidays, weight].join('|');

  const refreshScenario = useCallback(async () => {
    const ticket = ++scenarioGeneration.current;
    if (!ready || !ownerKey || !requestedScenario) { setResults(null); return; }
    setResults({ ownerKey, value: { status: 'loading' } });
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      const response = await getCareerScenarioJobs(pinned.client,
        requestedScenario === 'holidays'
          ? { scenario: 'balance', prefecture: area.prefecture, employmentType: '', salaryLine: null, holidayMoreThan: null, holidayAtLeast: days, salaryWeight: 0 }
          : { scenario: 'keep-income', prefecture: area.prefecture, employmentType: '', salaryLine: pathSalaryLine, holidayMoreThan: null, holidayAtLeast: null, salaryWeight: 50 },
      );
      if (pinned.isCurrent() && ticket === scenarioGeneration.current) setResults({ ownerKey, value: { status: 'ready', data: response } });
    } catch (error) {
      if (ticket === scenarioGeneration.current) setResults({ ownerKey, value: error instanceof CareerApiUnavailableError ? { status: 'unavailable' } : { status: 'error', error: failure(error) } });
    }
  }, [ready, ownerKey, requestedScenario, pinCandidateAction, area.prefecture, days, pathSalaryLine]);

  useEffect(() => {
    scenarioGeneration.current += 1;
    setResults(null);
    if (!ready || !requestedScenario) return;
    const timer = setTimeout(() => void refreshScenario(), 300);
    return () => { clearTimeout(timer); scenarioGeneration.current += 1; };
  }, [ready, requestedScenario, pathKey, refreshScenario]);

  // Advanced simulator is independent from the three quick-exploration paths.
  const refreshDetails = useCallback(async () => {
    const ticket = ++detailsGeneration.current;
    if (!ready || !ownerKey || variant !== 'page') return;
    setDetailsResult({ ownerKey, value: { status: 'loading' } });
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      const response = await getCareerScenarioJobs(pinned.client, {
        scenario, prefecture: area.prefecture, employmentType: area.employmentType, salaryLine,
        holidayMoreThan: daysFromText(fields.holidays), holidayAtLeast: daysFromText(fields.wishHolidays), salaryWeight: weight,
      });
      if (pinned.isCurrent() && ticket === detailsGeneration.current) setDetailsResult({ ownerKey, value: { status: 'ready', data: response } });
    } catch (error) {
      if (ticket === detailsGeneration.current && privacy.canAccessPrivateData()) setDetailsResult({ ownerKey, value: error instanceof CareerApiUnavailableError ? { status: 'unavailable' } : { status: 'error', error: failure(error) } });
    }
  }, [ready, ownerKey, variant, pinCandidateAction, scenario, area.prefecture, area.employmentType, salaryLine, fields.holidays, fields.wishHolidays, weight, privacy.canAccessPrivateData]);

  useEffect(() => {
    detailsGeneration.current += 1;
    setDetailsResult(null);
    if (!ready || variant !== 'page') return;
    const timer = setTimeout(() => void refreshDetails(), 350);
    return () => { clearTimeout(timer); detailsGeneration.current += 1; };
  }, [ready, variant, detailsKey, refreshDetails]);

  const edit = (field: keyof Fields, value: string) => {
    if (!ready) return;
    formRevision.current += 1;
    setFields((old) => ({ ...old, [field]: value }));
    setSaveMessage(null);
  };

  const saveSalaryOnly = async () => {
    const launchedGeneration = generation.current;
    const launchedRevision = formRevision.current;
    if (!ready || !current || !ownerKey || busy || !current.conditionsAvailable || basis !== 'monthly' || own === null) return;
    setBusy(true); setSaveMessage(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      const saved = await saveCareerConditions(pinned.client, { ...(current.conditions ?? EMPTY), current_monthly_salary: own });
      if (pinned.isCurrent() && launchedGeneration === generation.current) {
        setBase({ ownerKey, value: { ...current, conditions: saved } });
        setSaveMessage(careerMutationNotice('salary', launchedRevision, formRevision.current));
      }
    } catch (error) {
      if (launchedGeneration === generation.current && privacy.canAccessPrivateData()) setSaveMessage(failure(error));
    } finally {
      if (launchedGeneration === generation.current) setBusy(false);
    }
  };

  const save = async () => {
    const launchedGeneration = generation.current;
    const launchedRevision = formRevision.current;
    if (!ready || !current || busy || !ownerKey) return;
    if (!current.conditionsAvailable) { setSaveMessage('条件の保存は現在利用できません。入力した内容は保存されていません。'); return; }
    if (fields.salary.trim() && own === null ||
        fields.holidays.trim() && daysFromText(fields.holidays) === null ||
        fields.drop.trim() && yenFromMan(fields.drop) === null ||
        fields.wishHolidays.trim() && daysFromText(fields.wishHolidays) === null) {
      setSaveMessage('数値を確認してください。月給は0〜200万円、休日は0〜366日で入力してください。');
      return;
    }
    setBusy(true); setSaveMessage(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      const saved = await saveCareerConditions(pinned.client, {
        current_monthly_salary: own,
        current_annual_holidays: daysFromText(fields.holidays),
        tolerable_salary_drop: yenFromMan(fields.drop),
        desired_annual_holidays: daysFromText(fields.wishHolidays),
        scenario, salary_weight: weight,
      });
      if (pinned.isCurrent() && launchedGeneration === generation.current) {
        setBase({ ownerKey, value: { ...current, conditions: saved } });
        setSaveMessage(careerMutationNotice('conditions', launchedRevision, formRevision.current));
      }
    } catch (error) { if (privacy.canAccessPrivateData() && launchedGeneration === generation.current) setSaveMessage(failure(error)); }
    finally { if (launchedGeneration === generation.current) setBusy(false); }
  };

  const clear = async () => {
    const launchedGeneration = generation.current;
    const launchedRevision = formRevision.current;
    if (!ready || !current || busy || !ownerKey || !current.conditionsAvailable) return;
    setBusy(true); setSaveMessage(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      await deleteCareerConditions(pinned.client);
      if (pinned.isCurrent() && launchedGeneration === generation.current) {
        setBase({ ownerKey, value: { ...current, conditions: null } });
        if (launchedRevision === formRevision.current) {
          setFields({ ...blank, wishSalary: fields.wishSalary });
          setScenario('keep-income'); setWeight(50); setBasis(null);
        }
        setSaveMessage(careerMutationNotice('delete', launchedRevision, formRevision.current));
      }
    } catch (error) { if (privacy.canAccessPrivateData() && launchedGeneration === generation.current) setSaveMessage(failure(error)); }
    finally { if (launchedGeneration === generation.current) setBusy(false); }
  };

  const confirmClear = () => Alert.alert('保存した条件を削除しますか？', '保存していたお給料・休日などの条件を削除します。', [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除する', style: 'destructive', onPress: () => void clear() },
  ]);

  const openJob = (id: string) => { if (ready) router.push({ pathname: '/job/[id]', params: { id } }); };
  if (!allowed || !ownerKey) return <View style={styles.suspended}><Text style={styles.muted}>ログイン状態を確認しています…</Text></View>;
  if (!current) return <View style={styles.suspended}>{baseError ? <Text style={styles.error}>{baseError}</Text> : <ActivityIndicator color="#FF2F5F" /> }<Action label="再確認する" secondary onPress={() => void loadBase()} /></View>;

  return (
    <View style={styles.root}>
      {variant === 'home' ? (
        <View style={styles.hero}>
          <Text style={styles.heroPetal}>✿</Text>
          <Text style={styles.heroTitle}>あなたに合う働き方、見つけてみませんか？</Text>
          <Text style={styles.heroLead}>お給料も、お休みも、保育への想いも。あなたが大切にしたいことから探せます。</Text>
          <Action label="私のお給料、比べてみる" onPress={() => setCheckOpen(true)} />
          <Action label="お休みや保育観から探す" secondary onPress={() => setPath('holidays')} />
        </View>
      ) : (
        <>
          <Text style={styles.title}>お給料・働き方</Text>
          <Text style={styles.lead}>今の月給や年間休日、下がってもよい金額まで入れて、求人をじっくり比べられます。入力は任意です。</Text>
        </>
      )}
      <Section title="さがす地域">
        <TextInput accessibilityLabel="地域" style={styles.input} value={area.prefecture} onChangeText={(prefecture) => setArea((prev) => ({ ...prev, prefecture }))} placeholder="全国の求人／例：東京都" />
        {selectedMarket?.status === 'ready' ? (
          <View style={styles.chips}>
            <Choice text="全国" active={!area.prefecture} onPress={() => setArea((prev) => ({ ...prev, prefecture: '' }))} />
            {(selectedMarket.data.facets.coverage ?? []).slice(0, 12).map((row) => <Choice key={row.prefecture} text={row.prefecture} active={area.prefecture === row.prefecture} onPress={() => setArea((prev) => ({ ...prev, prefecture: row.prefecture }))} />)}
          </View>
        ) : null}
        <Text style={styles.footnote}>求人票の都道府県だけを対象にします。入力した地域に公開求人がない場合、全国をお選びください。</Text>
      </Section>

      {variant === 'page' || checkOpen ? (
        <Section title="私のお給料、比べてみる">
          <Text style={styles.muted}>今のお給料はどのくらい？入力は任意です。保存するまでは記録されません。</Text>
          <View style={styles.chips}>
            <Choice text="月給" active={basis === 'monthly'} onPress={() => { formRevision.current += 1; setBasis('monthly'); }} />
            <Choice text="時給" active={basis === 'hourly'} onPress={() => { formRevision.current += 1; setBasis('hourly'); }} />
            <Choice text="まだ働いていない" active={basis === 'none'} onPress={() => { formRevision.current += 1; setBasis('none'); }} />
          </View>
          {basis === 'monthly' ? <NumberField label="月給（額面）" unit="万円" hint="例：23" value={fields.salary} onChange={(value) => edit('salary', value)} /> : null}
          {basis === 'hourly' ? <Text style={styles.muted}>時給の求人は労働時間が異なるため、月給のように比べられません。「求人を探す」で時給の求人をご確認ください。</Text> : null}
          <StateMessage state={selectedMarket} onRetry={() => void refreshMarket()} />
          {selectedMarket?.status === 'ready' ? <MoneyMarket market={selectedMarket.data} location={area.prefecture} own={disclosedOwn} detailed={detailed} onToggleDetail={() => setDetailed(!detailed)} /> : null}
          {variant === 'home' && selectedOfficial?.status === 'ready' && selectedOfficial.data ? (
            <View style={styles.detailPanel}>
              <Text style={styles.source}>公的統計・給与実績</Text>
              <Text style={styles.muted}>{selectedOfficial.data.reference_year}年 {selectedOfficial.data.source}・求人票の募集給与とは別の指標です。</Text>
              {selectedOfficial.data.prefecture_all_experience?.monthly_scheduled_cash_yen != null ? (
                <Text style={styles.bold}>{selectedOfficial.data.prefecture_all_experience.prefecture}・全経験年数：{formatMan(selectedOfficial.data.prefecture_all_experience.monthly_scheduled_cash_yen)}</Text>
              ) : selectedOfficial.data.national_by_experience.find((r) => r.monthly_scheduled_cash_yen !== null) ? (
                <Text style={styles.bold}>全国・経験年数別：{formatMan(selectedOfficial.data.national_by_experience.find((r) => r.monthly_scheduled_cash_yen !== null)!.monthly_scheduled_cash_yen!)}</Text>
              ) : null}
            </View>
          ) : null}
          {variant === 'home' && disclosedOwn !== null && current.conditionsAvailable ? (
            current.conditions?.current_monthly_salary === own
              ? <Text style={styles.success}>この金額を保存しました。あなただけが見られます。</Text>
              : <Action label={busy ? '保存を確認中…' : 'この金額を保存する'} disabled={busy} secondary onPress={() => void saveSalaryOnly()} />
          ) : null}
          {variant === 'home' && saveMessage ? <Text style={saveMessage.includes('保存しました') ? styles.success : styles.error}>{saveMessage}</Text> : null}
          <Text style={styles.footnote}>数値の出典は区別して表示します。求人票の募集給与と公的統計の給与実績は同一の統計ではありません。</Text>
          {variant === 'home' ? <Action label="条件を細かく決めて比べる" secondary onPress={() => router.push('/(tabs)/career')} /> : null}
        </Section>
      ) : null}

      <Section title="大切にしたいことから探す">
        <Text style={styles.muted}>ひとつ選ぶと、求人票に書かれた条件で園を見つけられます。</Text>
        <View style={styles.pathStack}>
          <Choice text="お給料を大切にしたい" active={path === 'salary'} onPress={() => setPath('salary')} />
          <Choice text="お休みを増やしたい" active={path === 'holidays'} onPress={() => setPath('holidays')} />
          <Choice text="自分らしい保育をしたい" active={path === 'values'} onPress={() => setPath('values')} />
        </View>
        {path === 'salary' && salaryLine === null ? <NumberField label="月給の目安" unit="万円" hint="例：23" value={fields.salary} onChange={(v) => { setBasis('monthly'); edit('salary', v); }} /> : null}
        {path === 'holidays' ? (
          <>
            <Text style={styles.muted}>年間休日が書かれた求人だけを、休みの多い順に並べます。</Text>
            <View style={styles.chips}>{DAY_OPTIONS.map((d) => <Choice key={d} text={d + '日以上'} active={days === d} onPress={() => setDays(d)} />)}</View>
            <Text style={styles.footnote}>休日が書かれていない求人は、休みが少ないという意味ではありません。</Text>
          </>
        ) : null}
        {path === 'values' ? (
          <>
            {current.preferences.childcare_values.length
              ? <Text style={styles.muted}>大切にしたい保育：{current.preferences.childcare_values.join('・')}</Text>
              : <Text style={styles.muted}>保育観を選ぶと、考え方が近い園から順に見られます。</Text>}
            <Action label="保育観から求人を探す" onPress={() => router.push('/matches')} />
            <Action label="大切にしたい保育を見直す" secondary onPress={() => router.push('/scouts')} />
          </>
        ) : path === 'salary' && salaryLine === null ? (
          <Text style={styles.muted}>月給の目安を入力すると、条件に合う求人を探せます。</Text>
        ) : (
          <><StateMessage state={selectedResults} onRetry={() => void refreshScenario()} />
            {selectedResults?.status === 'ready' ? <ResultCards result={selectedResults.data} onOpenJob={openJob} /> : null}
            <Action label="求人を探すで探す" secondary onPress={() => router.push('/(tabs)/jobs')} />
          </>
        )}
      </Section>

      {variant === 'page' ? (
        <>
          <Section title="あなたの条件">
            <NumberField label="今の月給（額面）" unit="万円" hint="例：23" value={fields.salary} onChange={(v) => edit('salary', v)} />
            <NumberField label="今の年間休日" unit="日" hint="例：110" value={fields.holidays} onChange={(v) => edit('holidays', v)} />
            <NumberField label="下がってもよい月給" unit="万円まで" hint="例：1" value={fields.drop} onChange={(v) => edit('drop', v)} />
            <NumberField label="希望の最低月給" unit="万円" hint="例：22" value={fields.wishSalary} onChange={(v) => edit('wishSalary', v)} />
            <Text style={styles.footnote}>希望の最低月給はこの比較で使用します。希望条件プロフィールへの保存とは別です。</Text>
            <NumberField label="希望の年間休日" unit="日以上" hint="例：120" value={fields.wishHolidays} onChange={(v) => edit('wishHolidays', v)} />
            <Text style={styles.fieldLabel}>雇用形態</Text>
            <View style={styles.chips}>
              <Choice text="指定なし" active={!area.employmentType} onPress={() => setArea((p) => ({ ...p, employmentType: '' }))} />
              {(selectedMarket?.status === 'ready' ? selectedMarket.data.facets.employment_types : []).map((item) => <Choice key={item} text={item} active={area.employmentType === item} onPress={() => setArea((p) => ({ ...p, employmentType: item }))} />)}
            </View>
            {current.conditionsAvailable ? <Action label={busy ? '確認中…' : 'この条件を保存する'} disabled={busy} onPress={() => void save()} />
              : <Text style={styles.footnote}>入力した内容は画面を閉じると消えます。条件保存のAPIは現在利用できません。</Text>}
            {current.conditions && current.conditionsAvailable ? <Action label="保存した条件を削除する" secondary disabled={busy} onPress={confirmClear} /> : null}
            {saveMessage ? <Text accessibilityRole="alert" style={saveMessage.includes('しました') ? styles.success : styles.error}>{saveMessage}</Text> : null}
            <Text style={styles.footnote}>保存した数値は本人だけの条件です。保存後はサーバーの値を再取得して照合します。</Text>
          </Section>
          <Section title="相場と比べる">
            <StateMessage state={selectedMarket} onRetry={() => void refreshMarket()} />
            {selectedMarket?.status === 'ready' ? <MoneyMarket market={selectedMarket.data} location={area.prefecture} own={disclosedOwn} detailed={true} onToggleDetail={() => setDetailed(!detailed)} /> : null}
            <Text style={styles.sectionSmall}>公的統計の給与実績</Text>
            <StateMessage state={selectedOfficial} onRetry={() => void refreshMarket()} />
            {selectedOfficial?.status === 'ready' ? <OfficialWages data={selectedOfficial.data} experienceYears={current.profile?.years_of_experience ?? null} /> : null}
            {selectedHoliday?.status === 'ready' && selectedHoliday.data.bands ? (
              <>
                <Text style={styles.sectionSmall}>年間休日が書かれた求人の分布</Text>
                {selectedHoliday.data.bands.map((row) => <View style={styles.dataLine} key={row.from}><Text style={styles.muted}>{row.label}</Text><Text style={styles.bold}>{row.exact_count + row.minimum_count}件</Text></View>)}
              </>
            ) : null}
          </Section>
          <Section title="どう働きたいか">
            <View style={styles.chips}>{SCENARIOS.map((item) => <Choice key={item.id} text={item.label} active={scenario === item.id} onPress={() => { formRevision.current += 1; setScenario(item.id); }} />)}</View>
            <Text style={styles.muted}>{SCENARIOS.find((item) => item.id === scenario)?.lead}</Text>
            {scenario === 'balance' ? (
              <>
                <Text style={styles.fieldLabel}>給与と休日の優先度：{weight === 50 ? '同じくらい' : weight > 50 ? '給与を優先' : '休日を優先'}</Text>
                <View style={styles.chips}>{[0, 25, 50, 75, 100].map((w) => <Choice key={w} text={w + '%'} active={weight === w} onPress={() => { formRevision.current += 1; setWeight(w); }} />)}</View>
              </>
            ) : null}
            <StateMessage state={selectedDetails} onRetry={() => void refreshDetails()} />
            {selectedDetails?.status === 'ready' ? <ResultCards result={selectedDetails.data} onOpenJob={openJob} /> : null}
            <Text style={styles.footnote}>募集条件は採用時の給与を保証しません.年間休日が確認できない求人は推測で補いません。</Text>
          </Section>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  suspended: { padding: 24, alignItems: 'center', gap: 12 },
  hero: { backgroundColor: '#FFE9F0', borderRadius: 24, padding: 22, gap: 12, overflow: 'hidden' },
  heroPetal: { color: '#FF2F5F', fontSize: 42, fontWeight: '800' },
  heroTitle: { color: '#31232C', fontSize: 25, lineHeight: 34, fontWeight: '800' },
  heroLead: { fontSize: 15, lineHeight: 25, color: '#5E515B', fontWeight: '500' },
  title: { color: '#231923', fontSize: 26, fontWeight: '800', marginTop: 4 },
  lead: { fontSize: 15, lineHeight: 24, color: '#665F67' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 18, gap: 13, borderWidth: 1, borderColor: '#F5DDE5' },
  section: { color: '#27202B', fontSize: 19, lineHeight: 27, fontWeight: '800' },
  sectionSmall: { color: '#3C2F38', fontSize: 16, fontWeight: '800', marginTop: 4 },
  muted: { color: '#66616B', fontSize: 14, lineHeight: 22 },
  source: { color: '#9C2650', fontSize: 14, fontWeight: '800', lineHeight: 21 },
  footnote: { color: '#726B74', fontSize: 12, lineHeight: 19 },
  link: { color: '#D42152', fontWeight: '800', fontSize: 15, lineHeight: 22 },
  field: { gap: 7 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: '#3E3540' },
  input: { borderWidth: 1, borderColor: '#E6CAD3', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#29222C', fontSize: 16, minHeight: 48 },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  numberInput: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#E6CAD3', borderRadius: 12, paddingHorizontal: 14, minHeight: 48, color: '#29222C', fontSize: 17, fontWeight: '700' },
  unit: { fontSize: 13, color: '#62565F', fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pathStack: { gap: 8 },
  chip: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#EACDD7', backgroundColor: '#FFF9FB', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14, minHeight: 44, justifyContent: 'center' },
  chipActive: { borderColor: '#FF2F5F', backgroundColor: '#FFE4EC' },
  chipText: { color: '#514751', fontSize: 14, fontWeight: '700' },
  chipTextActive: { color: '#B41948', fontWeight: '800' },
  action: { minHeight: 49, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  actionPrimary: { backgroundColor: '#FF2F5F' },
  actionSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#FF93AE' },
  actionDisabled: { opacity: 0.48 },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  actionTextSecondary: { color: '#C81B4D' },
  compareBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexGrow: 1, flexBasis: 140, borderRadius: 15, padding: 13, backgroundColor: '#FFF3F7', gap: 7 },
  metricLabel: { fontSize: 13, color: '#A32754', fontWeight: '700' },
  metricValue: { fontSize: 23, color: '#251D27', fontWeight: '800' },
  detailPanel: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: '#FDF6F9' },
  dataLine: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F3E9ED' },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  chartLabel: { width: 75, fontSize: 12, color: '#635963', fontWeight: '600' },
  chartTrack: { flex: 1, backgroundColor: '#F3DFE6', borderRadius: 8, height: 12, overflow: 'hidden' },
  chartFill: { backgroundColor: '#FF2F5F', height: 12, borderRadius: 8 },
  chartCount: { width: 72, fontSize: 12, color: '#6B4B59', fontWeight: '700', textAlign: 'right' },
  bold: { color: '#342B35', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  count: { color: '#BC2450', fontSize: 17, fontWeight: '800' },
  opportunity: { borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#F0E0E7', backgroundColor: '#FFFDFE', gap: 6 },
  facility: { color: '#675963', fontSize: 13, fontWeight: '700' },
  salary: { color: '#C62053', fontSize: 17, fontWeight: '800' },
  notice: { backgroundColor: '#FFF8FA', padding: 12, borderRadius: 12, gap: 8 },
  error: { color: '#B32230', fontSize: 14, lineHeight: 21 },
  success: { color: '#28764B', fontSize: 14, lineHeight: 21, fontWeight: '700' },
});
