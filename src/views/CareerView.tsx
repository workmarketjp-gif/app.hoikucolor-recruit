import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, InlineError, SkeletonList } from '../components/StateViews';
import { track } from '../lib/analytics';
import {
  CareerApiUnavailableError, deleteCareerConditions, getCareerConditions, getOfficialWageStats, getSalaryMarket, getScenarioJobs,
  saveCareerConditions, type CareerConditions, type OfficialWageStats, type SalaryMarket, type ScenarioResponse,
} from '../lib/careerRepository';
import {
  differenceFromMedian, formatMan, manText, minimumSampleSize, parseDays, parseManYen, withYourPosition, type ScenarioId,
} from '../lib/careerSimulation';
import { getJobseekerMatchingPreferences } from '../lib/profilePreferencesRepository';
import { getProfile } from '../lib/recruitRepository';
import { errorMessage, useResource } from '../lib/useResource';
import './CareerView.css';

const scenarioCopy: Record<ScenarioId, { label: string; lead: string }> = {
  'keep-income': { label: '収入を保つ', lead: '今の月給（なければ希望の最低月給）に、募集の給与が届く求人です。' },
  'more-holidays': { label: '休みを増やす', lead: '許容できる減額の範囲で、年間休日が確認できて、今より多い求人です。' },
  balance: { label: 'バランス', lead: '年間休日が確認できた求人を、給与と休日の優先度で並べます。' },
};

/** A read that may simply not be deployed yet: 「準備中」 is a state, not an error. */
type Maybe<T> = { kind: 'ready'; data: T } | { kind: 'unavailable' };
async function maybe<T>(read: () => Promise<T>): Promise<Maybe<T>> {
  try {
    return { kind: 'ready', data: await read() };
  } catch (error) {
    if (error instanceof CareerApiUnavailableError) return { kind: 'unavailable' };
    throw error;
  }
}

const emptyFields = { salary: '', holidays: '', drop: '', wishHolidays: '', wishSalary: '' };

/**
 * 転職シミュレーター. Three separate measures, never blended: 求人票の募集給与 (SQL aggregate over the
 * published postings), 公的統計の給与実績 (B), and the person's own pay. Typed numbers stay in this
 * component; they are stored only when the person presses 保存 (owner-scoped), and never reach the
 * URL, browser storage, analytics or logs.
 */
export function CareerView({ userKey }: { userKey: string }) {
  const base = useResource(
    `career-base:${userKey}`,
    async () => {
      const [profile, preferences, conditions] = await Promise.all([
        getProfile(), getJobseekerMatchingPreferences(),
        maybe(getCareerConditions).catch(() => ({ kind: 'failed' as const })),
      ]);
      return { profile, preferences, conditions };
    },
    '保存した条件を読み込めませんでした。',
  );
  const [fields, setFields] = useState(emptyFields);
  const [area, setArea] = useState({ prefecture: '', employmentType: '' });
  const [salaryWeight, setSalaryWeight] = useState(50);
  const [scenario, setScenario] = useState<ScenarioId>('keep-income');
  const [hydrated, setHydrated] = useState(false);
  const started = useRef(false);

  // Reuse what the person already told us, once: saved comparison conditions, 希望地域, 希望最低月給.
  useEffect(() => {
    if (!base.data || hydrated) return;
    const { profile, preferences, conditions } = base.data;
    const saved: CareerConditions | null = conditions.kind === 'ready' ? conditions.data : null;
    setFields({
      salary: manText(saved?.current_monthly_salary ?? null),
      holidays: saved?.current_annual_holidays?.toString() ?? '',
      drop: manText(saved?.tolerable_salary_drop ?? null),
      wishHolidays: saved?.desired_annual_holidays?.toString() ?? '',
      wishSalary: manText(preferences.desired_monthly_salary_min),
    });
    if (saved) { setScenario(saved.scenario); setSalaryWeight(saved.salary_weight); }
    setArea({ prefecture: preferences.desired_prefectures[0] ?? profile?.prefecture ?? '', employmentType: '' });
    setHydrated(true);
  }, [base.data, hydrated]);

  const market = useResource(
    hydrated ? `career-market:${userKey}:${area.prefecture}:${area.employmentType}` : null,
    () => maybe(() => getSalaryMarket(area.prefecture, area.employmentType)),
    '求人の相場を読み込めませんでした。',
  );
  const official = useResource(
    hydrated ? `career-official:${userKey}:${area.prefecture}` : null,
    () => maybe(() => getOfficialWageStats(area.prefecture)),
    '公的統計を読み込めませんでした。',
  );

  const input = {
    salary: parseManYen(fields.salary),
    holidays: parseDays(fields.holidays),
    drop: parseManYen(fields.drop),
    wishHolidays: parseDays(fields.wishHolidays),
    wishSalary: parseManYen(fields.wishSalary),
  };
  const edit = (next: Partial<typeof fields>) => {
    setFields((current) => ({ ...current, ...next }));
    if (!started.current) { started.current = true; track('hc_career_started'); }
  };

  const marketData = market.data?.kind === 'ready' ? market.data.data : null;
  const facets = marketData?.facets;
  const prefectureOptions = useMemo(() => {
    const options = new Map((facets?.coverage ?? []).map((row) => [row.prefecture, row.count]));
    if (area.prefecture && !options.has(area.prefecture)) options.set(area.prefecture, 0);
    return [...options.entries()].sort(([a], [b]) => a.localeCompare(b, 'ja'));
  }, [facets, area.prefecture]);

  const salaryLine = scenario === 'more-holidays'
    ? (input.salary === null ? null : Math.max(0, input.salary - (input.drop ?? 0)))
    : input.salary ?? input.wishSalary;
  const holidayFloor = input.wishHolidays ?? input.holidays;

  const scenarioState = useScenario(
    hydrated && marketData !== null,
    { scenario, prefecture: area.prefecture, employmentType: area.employmentType, salaryLine, holidayFloor, salaryWeight },
  );

  return (
    <div className="hc-view hc-career">
      <p className="hc-lead">給与も、休みも。いまの条件と、公開されている求人を並べて考えられます。入力は任意です。</p>

      {base.status === 'error' && !base.data && <InlineError message={base.error} onRetry={base.reload} />}
      {base.status === 'loading' && !base.data && <SkeletonList rows={2} />}

      {base.data && (
        <>
          <section className="hc-section is-first" aria-labelledby="career-input-heading">
            <div className="hc-section-head"><h2 id="career-input-heading">あなたの条件</h2></div>
            <div className="hc-career-form">
              <NumberField label="今の月給（額面）" unit="万円" hint="例：23" value={fields.salary} onChange={(salary) => edit({ salary })} />
              <NumberField label="今の年間休日" unit="日" hint="例：110" value={fields.holidays} onChange={(holidays) => edit({ holidays })} />
              <NumberField label="下がってもよい月給" unit="万円まで" hint="例：1" value={fields.drop} onChange={(drop) => edit({ drop })} />
              <NumberField label="希望の最低月給" unit="万円" hint="例：22" value={fields.wishSalary} onChange={(wishSalary) => edit({ wishSalary })} />
              <NumberField label="希望の年間休日" unit="日以上" hint="例：120" value={fields.wishHolidays} onChange={(wishHolidays) => edit({ wishHolidays })} />
              <label className="hc-field">
                <span>地域</span>
                <select value={area.prefecture} onChange={(e) => setArea({ ...area, prefecture: e.target.value })}>
                  <option value="">公開中の求人すべて</option>
                  {prefectureOptions.map(([prefecture, count]) => <option key={prefecture} value={prefecture}>{prefecture}（{count}件）</option>)}
                </select>
              </label>
              <label className="hc-field">
                <span>雇用形態</span>
                <select value={area.employmentType} onChange={(e) => setArea({ ...area, employmentType: e.target.value })}>
                  <option value="">指定なし</option>
                  {(facets?.employment_types ?? []).map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
            </div>
            <SaveConditions
              availability={base.data.conditions.kind}
              hasSaved={base.data.conditions.kind === 'ready' && base.data.conditions.data !== null}
              current={{
                current_monthly_salary: input.salary, current_annual_holidays: input.holidays, tolerable_salary_drop: input.drop,
                desired_annual_holidays: input.wishHolidays, scenario, salary_weight: salaryWeight,
              }}
              onChanged={(next) => base.setData({ ...base.data!, conditions: { kind: 'ready', data: next } })}
              onCleared={() => { setFields({ ...emptyFields, wishSalary: fields.wishSalary }); setScenario('keep-income'); setSalaryWeight(50); base.setData({ ...base.data!, conditions: { kind: 'ready', data: null } }); }}
            />
          </section>

          <section className="hc-section" aria-labelledby="career-market-heading">
            <div className="hc-section-head"><h2 id="career-market-heading">相場と比べる</h2></div>
            {market.status === 'error' && !market.data && <InlineError message={market.error} onRetry={market.reload} />}
            {market.status === 'loading' && !market.data && hydrated && <SkeletonList rows={2} />}
            {market.data?.kind === 'unavailable' && (
              <EmptyState title="求人の相場は準備中です" body="公開中の求人を集計する機能を準備しています。公開されるまで、数値は表示しません。" />
            )}
            {marketData && <PostedSalary market={marketData} you={input.salary} loading={market.status === 'loading'} />}
            <OfficialWages state={official.data} failed={official.status === 'error' ? official.error : null} onRetry={official.reload}
              prefecture={area.prefecture} experienceYears={base.data.profile?.years_of_experience ?? null} you={input.salary} />
          </section>

          <section className="hc-section" aria-labelledby="career-scenario-heading">
            <div className="hc-section-head"><h2 id="career-scenario-heading">どう働きたいか</h2></div>
            <div className="hc-career-tabs" role="group" aria-label="比較の考え方">
              {(Object.keys(scenarioCopy) as ScenarioId[]).map((id) => (
                <button key={id} type="button" className={`hc-chip ${scenario === id ? 'is-active' : ''}`} aria-pressed={scenario === id} onClick={() => setScenario(id)}>
                  {scenarioCopy[id].label}
                </button>
              ))}
            </div>
            <p className="hc-note">{scenarioCopy[scenario].lead}</p>
            {scenario === 'balance' && (
              <label className="hc-field hc-career-weight">
                <span>優先したいのは</span>
                <input type="range" min={0} max={100} step={10} value={salaryWeight} onChange={(e) => setSalaryWeight(Number(e.target.value))}
                  aria-valuetext={salaryWeight === 50 ? '給与と休日を同じくらい' : salaryWeight > 50 ? '給与を優先' : '休日を優先'} />
                <small aria-hidden="true"><span>休日を優先</span><span>給与を優先</span></small>
              </label>
            )}
            <ScenarioResult state={scenarioState} scenario={scenario} salaryLine={salaryLine} />
            <p className="hc-note">
              募集給与の幅に希望額が入っていても、採用時の給与を保証するものではありません。年間休日は、求人票に日数が確認できたものだけを使い、推測で補っていません。
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------- 求人票の募集給与 ------------------------------ */

function PostedSalary({ market, you, loading }: { market: SalaryMarket; you: number | null; loading: boolean }) {
  const stats = market.monthly_lower_bound;
  const { population } = market;
  const prefecture = market.scope.prefecture;
  const coverage = market.facets.coverage;
  const bars = useMemo(() => (stats ? withYourPosition(stats.histogram, you) : []), [stats, you]);
  const maxCount = Math.max(1, ...bars.map((bar) => bar.count));
  const diff = differenceFromMedian(you, stats?.median ?? null);
  const asOf = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(market.as_of));
  const where = [prefecture ?? '公開中の求人すべて', market.scope.employment_type].filter(Boolean).join('・');

  return (
    <div className="hc-career-block" aria-busy={loading}>
      <h3><span className="hc-source-pill is-posted">求人票</span>{where}の募集給与</h3>
      <p className="hc-career-coverage" role="note">
        現在公開中の求人は{coverage.length}都道府県分（{coverage.map((row) => `${row.prefecture} ${row.count}件`).join('、')}）です。
        全国や、ほかの地域の相場ではありません。
      </p>
      {population.scope_count === 0 ? (
        <EmptyState title="この条件で公開中の求人はありません" body="地域や雇用形態を変えると、掲載のある条件が見つかります。" />
      ) : stats ? (
        <>
          <dl className="hc-career-figures">
            <div><dt>中央値</dt><dd>{formatMan(stats.median)}</dd></div>
            <div><dt>対象</dt><dd>{stats.count}件</dd></div>
            <div><dt>中央の50%</dt><dd>{formatMan(stats.q1)}〜{formatMan(stats.q3)}</dd></div>
          </dl>
          <ol className="hc-career-bars" aria-label="募集給与（月給の下限）の分布">
            {bars.map((bar) => (
              <li key={bar.from} className={bar.containsYou ? 'is-you' : undefined}>
                <span className="hc-career-bar-label">{formatMan(bar.from)}台</span>
                <span className="hc-career-bar"><i style={{ width: `${(bar.count / maxCount) * 100}%` }} /></span>
                <span className="hc-career-bar-count">{bar.count}件{bar.containsYou && <b>あなた</b>}</span>
              </li>
            ))}
          </ol>
          {you !== null && diff !== null && (
            <p className="hc-career-position" role="status">
              <span className="hc-source-pill is-own">あなた</span>
              月給 {formatMan(you)} は、求人票の中央値より {formatMan(Math.abs(diff))} {diff === 0 ? 'と同じです' : diff > 0 ? '高い金額です' : '低い金額です'}。
              <small>求人票の数字との違いで、あなたの価値や能力を示すものではありません。</small>
            </p>
          )}
        </>
      ) : (
        <EmptyState
          title="参考件数が足りません"
          body={`月給で掲載されている求人が${population.monthly_count}件のため、相場は表示しません（${minimumSampleSize}件以上で表示します）。地域や雇用形態を広げてみてください。`}
        />
      )}
      <p className="hc-note hc-career-source">
        出典：Hoiku Colorに公開中の求人の月給の下限（{asOf}時点）。{population.scope_count}件のうち、月給の求人は{population.monthly_count}件で、
        時給などの{population.not_monthly_count}件は含みません。
        {market.scope.occupation === 'hoikushi' && '職種は求人タイトルから分類した「保育士」の求人です（保育士と他の職種を併記した求人を含み、看護師・調理員などだけの求人は含みません）。'}
        {market.scope.occupation !== 'hoikushi' && population.occupation_verified_count === 0 && '職種の区別はまだできておらず、保育士以外（看護師・調理員など）の募集も含みます。'}
      </p>
    </div>
  );
}

/* ------------------------------ 公的統計の給与実績 ----------------------------- */

function OfficialWages({ state, failed, onRetry, prefecture, experienceYears, you }: {
  state: Maybe<OfficialWageStats | null> | null;
  failed: string | null;
  onRetry: () => void;
  prefecture: string;
  experienceYears: number | null;
  you: number | null;
}) {
  const stats = state?.kind === 'ready' ? state.data : null;
  const mine = stats && experienceYears !== null
    ? stats.national_by_experience.find((row) => experienceYears >= row.experience_min_years && (row.experience_max_years === null || experienceYears <= row.experience_max_years))
    : null;
  return (
    <div className="hc-career-block">
      <h3><span className="hc-source-pill is-official">公的統計</span>給与実績</h3>
      {failed && !state && <InlineError message={failed} onRetry={onRetry} />}
      {state?.kind === 'unavailable' || (state?.kind === 'ready' && !stats) ? (
        <p className="hc-note">賃金構造基本統計調査（厚生労働省）による保育士の給与実績は、データを準備中です。求人票の募集給与とは別の指標として、準備ができ次第こちらに表示します。</p>
      ) : null}
      {stats && (
        <>
          <p className="hc-note">{stats.reference_year}年 {stats.source}・{stats.occupation}・月額（所定内給与）。地域別と経験年数別は別々の集計で、組み合わせていません。</p>
          {stats.national_by_experience.length > 0 && (
            <>
              <h4>全国・経験年数別</h4>
              <ul className="hc-career-official">
                {stats.national_by_experience.map((row) => (
                  <li key={row.experience_label} className={row === mine ? 'is-mine' : undefined}>
                    <span>{row.experience_label}</span>
                    <strong>{row.monthly_scheduled_cash_yen === null ? '公表なし' : formatMan(row.monthly_scheduled_cash_yen)}</strong>
                    {row === mine && <b>あなたの経験年数</b>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {stats.prefecture_all_experience && (
            <>
              <h4>{stats.prefecture_all_experience.prefecture || prefecture}・経験年数を区別しない</h4>
              <p className="hc-career-official-one">
                <strong>{stats.prefecture_all_experience.monthly_scheduled_cash_yen === null ? '公表なし' : formatMan(stats.prefecture_all_experience.monthly_scheduled_cash_yen)}</strong>
              </p>
            </>
          )}
          {you !== null && mine?.monthly_scheduled_cash_yen != null && (
            <p className="hc-career-position" role="status">
              <span className="hc-source-pill is-own">あなた</span>
              月給 {formatMan(you)} と、全国・経験年数別の統計（{mine.experience_label}）{formatMan(mine.monthly_scheduled_cash_yen)} との違いは {formatMan(Math.abs(you - mine.monthly_scheduled_cash_yen))} です。
              <small>統計は所定内給与（賞与を含まない月額）で、額面月給とは定義が少し異なります。</small>
            </p>
          )}
          {stats.source_url && <p className="hc-note"><a href={stats.source_url} target="_blank" rel="noreferrer">出典を開く</a></p>}
        </>
      )}
    </div>
  );
}

/* ---------------------------------- シナリオ ---------------------------------- */

type ScenarioQuery = Parameters<typeof getScenarioJobs>[0];
type ScenarioState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; response: ScenarioResponse };

function useScenario(enabled: boolean, query: ScenarioQuery): ScenarioState {
  const [state, setState] = useState<ScenarioState>({ status: 'idle' });
  const key = JSON.stringify(query);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    const timer = window.setTimeout(() => {
      getScenarioJobs(JSON.parse(key) as ScenarioQuery)
        .then((response) => { if (active) setState({ status: 'ready', response }); })
        .catch((error) => {
          if (!active) return;
          setState(error instanceof CareerApiUnavailableError ? { status: 'unavailable' } : { status: 'error', message: errorMessage(error, '求人を並べられませんでした。') });
        });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [enabled, key]);
  return state;
}

function ScenarioResult({ state, scenario, salaryLine }: { state: ScenarioState; scenario: ScenarioId; salaryLine: number | null }) {
  if (state.status === 'idle' || state.status === 'loading') return <SkeletonList rows={2} />;
  if (state.status === 'unavailable') return <EmptyState title="求人の比較は準備中です" body="公開中の求人を条件で並べる機能を準備しています。" />;
  if (state.status === 'error') return <InlineError message={state.message} />;
  const { response } = state;
  if (!response.ready) {
    return response.missing === 'salary_line'
      ? <EmptyState title="入力すると表示されます" body={scenario === 'more-holidays' ? '今の月給を入力してください。' : '今の月給か、希望の最低月給を入力してください。'} />
      : <EmptyState title="年間休日が確認できた求人が、まだ足りません" body={`年間休日の日数が求人票に書かれている求人が少ないため、この並べ方は表示しません。${response.unknown_holidays ? `（確認できない求人 ${response.unknown_holidays}件）` : ''}`} />;
  }
  return (
    <>
      <p className="hc-career-count" aria-live="polite">
        <strong>{response.total}件</strong>
        {salaryLine !== null && scenario !== 'balance' && <span>月給の目安ライン {formatMan(salaryLine)}</span>}
        {response.unknown_holidays > 0 && <span>年間休日が確認できない{response.unknown_holidays}件は、休日の順位に入れていません</span>}
      </p>
      {response.jobs.length === 0 && <EmptyState title="条件に合う求人は見つかりませんでした" body="下がってもよい月給や希望の休日、地域を少しゆるめると見つかることがあります。" />}
      <ul className="hc-career-jobs">
        {response.jobs.map((job) => (
          <li key={job.id}>
            <a href={`/jobs?job_id=${encodeURIComponent(job.id)}`} onClick={() => track('hc_career_job_opened')}>
              <strong>{job.facility_name ?? '園'}</strong>
              <span>{job.title}</span>
              <span className="hc-career-job-facts">
                <b>月給 {formatMan(job.salary_min)}{job.salary_max > job.salary_min ? `〜${formatMan(job.salary_max)}` : ''}</b>
                {job.annual_holidays_days !== null && <b>年間休日 {job.annual_holidays_days}日{job.annual_holidays_basis === 'minimum' ? '以上' : ''}</b>}
                {job.reach === 'upper-bound-only' && <em>上限なら届く幅</em>}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {response.total > response.jobs.length && <p className="hc-note">ほかに{response.total - response.jobs.length}件あります。気になる条件が決まったら「求人を探す」で絞り込めます。</p>}
    </>
  );
}

/* ------------------------------------ 保存 ----------------------------------- */

function SaveConditions({ availability, hasSaved, current, onChanged, onCleared }: {
  availability: 'ready' | 'unavailable' | 'failed';
  hasSaved: boolean;
  current: CareerConditions;
  onChanged: (saved: CareerConditions) => void;
  onCleared: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'working' | 'saved' | 'deleted' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (availability === 'unavailable') return <p className="hc-note hc-career-privacy">入力した内容はこの画面を閉じると消えます。条件の保存は準備中です。</p>;
  if (availability === 'failed') return <p className="hc-note hc-career-privacy" role="status">保存した条件を読み込めませんでした。入力した内容はこの画面を閉じると消えます。</p>;

  const run = async (action: () => Promise<void>, done: 'saved' | 'deleted') => {
    setStatus('working'); setError(null);
    try { await action(); setStatus(done); } catch (err) { setError(errorMessage(err, '保存できませんでした。もう一度お試しください。')); setStatus('error'); }
  };
  return (
    <div className="hc-career-save">
      <p className="hc-note hc-career-privacy">保存すると、あなただけが見られる形でこのアカウントに残り、次に開いたときに入力済みで表示されます。保存しなければ、この画面を閉じると消えます。</p>
      <div className="hc-card-actions">
        <button type="button" className="primary-button" disabled={status === 'working'}
          onClick={() => run(async () => { onChanged(await saveCareerConditions(current)); track('hc_career_saved'); }, 'saved')}>
          {status === 'working' ? '保存中…' : 'この条件を保存する'}
        </button>
        {hasSaved && (
          <button type="button" className="secondary-button" disabled={status === 'working'}
            onClick={() => { if (window.confirm('保存した条件を削除しますか？')) void run(async () => { await deleteCareerConditions(); onCleared(); }, 'deleted'); }}>
            保存した条件を削除
          </button>
        )}
      </div>
      {status === 'saved' && <p className="form-success" role="status">保存しました</p>}
      {status === 'deleted' && <p className="form-success" role="status">保存した条件を削除しました</p>}
      {status === 'error' && error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

function NumberField({ label, unit, hint, value, onChange }: { label: string; unit: string; hint: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="hc-field">
      <span>{label}</span>
      <span className="hc-career-input">
        <input type="number" inputMode="decimal" min="0" step="any" value={value} placeholder={hint} onChange={(e) => onChange(e.target.value)} />
        <em>{unit}</em>
      </span>
    </label>
  );
}
