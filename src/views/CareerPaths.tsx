import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { InlineError, SkeletonList } from '../components/StateViews';
import { track } from '../lib/analytics';
import { getScenarioJobs, maybe, type CareerConditions, type ScenarioJob, type ScenarioResponse } from '../lib/careerRepository';
import { formatMan, holidayChoices, parseManYen, scenarioSalaryLine } from '../lib/careerSimulation';
import type { JobseekerMatchingPreferences } from '../lib/profilePreferencesRepository';
import { errorMessage } from '../lib/useResource';

/**
 * 大切にしたいことから探す. Three exploration paths, not judgements about the person:
 *   お給料      scenario `keep-income`  (posted pay reaches the person's line)
 *   お休み      scenario `balance` with a minimum of stated annual holidays, pay weight 0
 *   保育観      the existing マッチ度 / 希望条件 screens; no figures are made up here
 * Every number comes from hc_jobseeker_career_scenario_jobs_v1 (SQL), the same rules as /career.
 * Postings that do not state their holidays are never treated as having few.
 */

export type PathId = 'salary' | 'holidays' | 'values';

const paths: { id: PathId; icon: Parameters<typeof Icon>[0]['name']; title: string; lead: string }[] = [
  { id: 'salary', icon: 'yen', title: 'お給料を大切にしたい', lead: '今のお給料に届く求人' },
  { id: 'holidays', icon: 'calendar', title: 'お休みを増やしたい', lead: '年間休日が書かれた求人' },
  { id: 'values', icon: 'sparkles', title: '自分らしい保育をしたい', lead: '保育観から探す' },
];

type Props = {
  prefecture: string;
  /** Text typed in 「月給（額面）」 or 「月給の目安」: shared so the person types it once. */
  salaryText: string;
  onSalaryText: (value: string) => void;
  saved: CareerConditions | null;
  preferences: JobseekerMatchingPreferences | null;
  /** Called when the person asks to widen the area to every prefecture. */
  onWiden: () => void;
  initial?: PathId;
};

export function CareerPaths({ prefecture, salaryText, onSalaryText, saved, preferences, onWiden, initial }: Props) {
  const own = parseManYen(salaryText) ?? saved?.current_monthly_salary ?? null;
  const wish = preferences?.desired_monthly_salary_min ?? null;
  const line = scenarioSalaryLine('keep-income', own, null, wish);
  const [path, setPath] = useState<PathId>(initial ?? (line === null ? 'holidays' : 'salary'));
  const [days, setDays] = useState<number>(() => (saved?.desired_annual_holidays && (holidayChoices as readonly number[]).includes(saved.desired_annual_holidays) ? saved.desired_annual_holidays : 120));

  const choose = (id: PathId) => {
    setPath(id);
    track('hc_dashboard_cta', { cta: `path_${id}` });
  };

  return (
    <section className="hc-paths" id="career-paths" aria-labelledby="paths-heading">
      <h2 id="paths-heading">大切にしたいことから探す</h2>
      <p className="hc-paths-lead">ひとつ選ぶと、求人票に書かれた条件で園を見つけられます。</p>
      <div className="hc-path-cards" role="group" aria-label="大切にしたいこと">
        {paths.map((item) => (
          <button key={item.id} type="button" className={`hc-path-card ${path === item.id ? 'is-active' : ''}`} aria-pressed={path === item.id} aria-controls="career-path-panel" onClick={() => choose(item.id)}>
            <span className="hc-path-icon"><Icon name={item.icon} size={22} /></span>
            <span className="hc-path-text"><strong>{item.title}</strong><span>{item.lead}</span></span>
          </button>
        ))}
      </div>

      <div className="hc-path-panel" id="career-path-panel" role="region" aria-live="polite" aria-label={paths.find((item) => item.id === path)?.title}>
        {path === 'salary' && <SalaryPath prefecture={prefecture} line={line} hasOwn={own !== null} salaryText={salaryText} onSalaryText={onSalaryText} onWiden={onWiden} />}
        {path === 'holidays' && <HolidayPath prefecture={prefecture} days={days} onDays={setDays} onWiden={onWiden} />}
        {path === 'values' && <ValuesPath preferences={preferences} />}
      </div>
    </section>
  );
}

/* ---------------------------------- お給料 ---------------------------------- */

function SalaryPath({ prefecture, line, hasOwn, salaryText, onSalaryText, onWiden }: { prefecture: string; line: number | null; hasOwn: boolean; salaryText: string; onSalaryText: (value: string) => void; onWiden: () => void }) {
  const { state, retry } = useScenario(line === null ? null : { scenario: 'keep-income', prefecture, salaryLine: line, holidayMoreThan: null, holidayAtLeast: null, salaryWeight: 50 });
  return (
    <>
      <p className="hc-note">{line === null ? '今のお給料か、希望する月給を入れると探せます。' : hasOwn ? '今のお給料に、募集の給与が届く求人です。' : '希望する最低月給に、募集の給与が届く求人です。'}</p>
      {line === null && (
        <label className="hc-inline-field">
          <span>月給の目安</span>
          <span className="hc-inline-input"><input type="number" inputMode="decimal" min="0" step="any" value={salaryText} placeholder="例：23" onChange={(event) => onSalaryText(event.target.value)} /><em>万円</em></span>
        </label>
      )}
      {line !== null && <PathResult state={state} onRetry={retry} prefecture={prefecture} onWiden={onWiden} unit="salary" />}
    </>
  );
}

/* ---------------------------------- お休み ---------------------------------- */

function HolidayPath({ prefecture, days, onDays, onWiden }: { prefecture: string; days: number; onDays: (value: number) => void; onWiden: () => void }) {
  const { state, retry } = useScenario({ scenario: 'balance', prefecture, salaryLine: null, holidayMoreThan: null, holidayAtLeast: days, salaryWeight: 0 });
  return (
    <>
      <p className="hc-note">年間休日の日数が求人票に書かれている園だけを、休みの多い順に並べます。</p>
      <div className="hc-day-choices" role="group" aria-label="年間休日の希望">
        {holidayChoices.map((value) => (
          <button key={value} type="button" className={`hc-chip ${days === value ? 'is-active' : ''}`} aria-pressed={days === value} onClick={() => onDays(value)}>{value}日以上</button>
        ))}
      </div>
      <PathResult state={state} onRetry={retry} prefecture={prefecture} onWiden={onWiden} unit="holidays" />
      <p className="hc-note hc-path-caution">日数が書かれていない求人は、休みが少ないという意味ではありません。ここでは数えていません。</p>
    </>
  );
}

/* ---------------------------------- 保育観 ---------------------------------- */

function ValuesPath({ preferences }: { preferences: JobseekerMatchingPreferences | null }) {
  const values = preferences?.childcare_values ?? [];
  return (
    <>
      {values.length > 0 ? (
        <>
          <p className="hc-note">あなたが大切にしたい保育です。</p>
          <ul className="hc-chip-list" aria-label="大切にしたい保育観">{values.map((value) => <li key={value}>{value}</li>)}</ul>
          <a className="primary-button hc-path-action" href="/matches" onClick={() => track('hc_dashboard_cta', { cta: 'values_matches' })}>保育観に合う求人を見る<Icon name="chevron" size={18} /></a>
          <a className="hc-link-button" href="/scouts">大切にしたい保育を見直す</a>
        </>
      ) : (
        <>
          <p className="hc-note">どんな保育をしたいかを選ぶと、考え方が近い園から順に見られます。選ぶのは数個で、あとから変えられます。</p>
          <a className="primary-button hc-path-action" href="/scouts" onClick={() => track('hc_dashboard_cta', { cta: 'values_choose' })}>大切にしたい保育を選ぶ<Icon name="chevron" size={18} /></a>
        </>
      )}
    </>
  );
}

/* ----------------------------------- 結果 ----------------------------------- */

type ScenarioQuery = { scenario: 'keep-income' | 'balance'; prefecture: string; salaryLine: number | null; holidayMoreThan: number | null; holidayAtLeast: number | null; salaryWeight: number };
type ScenarioState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; response: ScenarioResponse };

function useScenario(query: ScenarioQuery | null): { state: ScenarioState; retry: () => void } {
  const [state, setState] = useState<ScenarioState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(query);
  useEffect(() => {
    if (!query) return;
    let active = true;
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    const timer = window.setTimeout(() => {
      maybe(() => getScenarioJobs({ ...query, employmentType: '' }))
        .then((result) => { if (active) setState(result.kind === 'ready' ? { status: 'ready', response: result.data } : { status: 'unavailable' }); })
        .catch((error) => { if (active) setState({ status: 'error', message: errorMessage(error, '求人を読み込めませんでした。') }); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}

function PathResult({ state, onRetry, prefecture, onWiden, unit }: { state: ScenarioState; onRetry: () => void; prefecture: string; onWiden: () => void; unit: 'salary' | 'holidays' }) {
  if (state.status === 'loading') return <SkeletonList rows={2} />;
  if (state.status === 'error') return <InlineError message={state.message} onRetry={onRetry} />;
  if (state.status === 'unavailable') {
    return <p className="hc-note">いまはこの探し方をご用意できていません。<a className="hc-link-button" href="/jobs">求人を探すから直接さがす</a></p>;
  }
  const { response } = state;
  const where = prefecture || '全国';
  if (!response.ready) {
    return (
      <div className="hc-path-empty">
        <p>{unit === 'holidays' ? `${where}では、年間休日の日数が書かれた求人がまだ少ないようです。` : '月給の目安を入れると表示されます。'}</p>
        {unit === 'holidays' && prefecture && <button type="button" className="secondary-button" onClick={onWiden}>全国の求人で探す</button>}
        <a className="hc-link-button" href="/jobs">求人を探すで探す</a>
      </div>
    );
  }
  if (response.jobs.length === 0) {
    return (
      <div className="hc-path-empty">
        <p>{where}では、この条件に合う求人が見つかりませんでした。条件を少しゆるめると見つかることがあります。</p>
        {prefecture && <button type="button" className="secondary-button" onClick={onWiden}>全国の求人で探す</button>}
      </div>
    );
  }
  return (
    <>
      <p className="hc-path-count"><strong>{response.total}件</strong>の求人が見つかりました{prefecture ? `（${prefecture}）` : '（全国）'}</p>
      <ul className="hc-opp-list">
        {response.jobs.slice(0, 3).map((job) => <li key={job.id}><OpportunityCard job={job} emphasis={unit} /></li>)}
      </ul>
      <a className="hc-link-button hc-path-more" href="/jobs">{response.total > 3 ? `ほかの${response.total - 3}件も求人を探すで見る` : '求人を探すで、さらに見る'}<Icon name="chevron" size={16} /></a>
    </>
  );
}

/* ------------------------------ 求人カード（機会） ------------------------------ */

export function OpportunityCard({ job, emphasis }: { job: ScenarioJob; emphasis: 'salary' | 'holidays' }) {
  const salary = `${formatMan(job.salary_min)}${job.salary_max > job.salary_min ? `〜${formatMan(job.salary_max)}` : ''}`;
  const holidays = job.annual_holidays_days === null ? null : `${job.annual_holidays_days}日${job.annual_holidays_basis === 'minimum' ? '以上' : ''}`;
  return (
    <article className="hc-opp">
      <p className="hc-opp-facility">{job.facility_name ?? '園'}</p>
      <p className="hc-opp-title">{job.title}{job.employment_type ? `・${job.employment_type}` : ''}</p>
      <dl className={`hc-opp-facts is-${emphasis}`}>
        <div><dt>月給</dt><dd>{salary}</dd></div>
        {holidays && <div><dt>年間休日</dt><dd>{holidays}</dd></div>}
      </dl>
      {job.reach === 'upper-bound-only' && <p className="hc-opp-note">募集の幅の上のほうなら届く金額です。</p>}
      <a className="hc-opp-link" href={`/jobs?job_id=${encodeURIComponent(job.id)}`} onClick={() => track('hc_career_job_opened')}>くわしく見る<Icon name="chevron" size={16} /></a>
    </article>
  );
}
