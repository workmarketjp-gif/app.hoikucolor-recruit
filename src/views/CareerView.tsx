import { useEffect, useMemo, useState } from 'react';
import { EmptyState, InlineError, SkeletonList } from '../components/StateViews';
import {
  emptySimulationInput, minimumSampleSize, salaryHistogram, salaryPosition, scenarioBalance, scenarioKeepIncome,
  scenarioMoreHolidays, summarizeSalaries, toPostedJobs, type ScenarioId, type ScenarioResult, type SimulationInput,
} from '../lib/careerSimulation';
import { getJobseekerMatchingPreferences } from '../lib/profilePreferencesRepository';
import { getProfile, listJobs } from '../lib/recruitRepository';
import { useResource } from '../lib/useResource';
import './CareerView.css';

const man = (yen: number) => `${(yen / 10000).toFixed(1).replace(/\.0$/, '')}万円`;
const toYen = (value: string) => {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) && number >= 0 ? Math.round(number * 10000) : null;
};
const toDays = (value: string) => {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) && number >= 0 && number <= 366 ? Math.round(number) : null;
};

const scenarioCopy: Record<ScenarioId, { label: string; lead: string }> = {
  'keep-income': { label: '収入を保つ', lead: '今の月給（または希望の最低月給）に、募集の給与が届く求人です。' },
  'more-holidays': { label: '休みを増やす', lead: '許容できる減額の範囲で、今より年間休日が多い求人です。' },
  balance: { label: 'バランス', lead: '給与と休日の優先度を、下のつまみで決めた順に並べます。' },
};

/** 転職シミュレーター: posted-condition comparison only. Nothing typed here is saved, sent or put in the URL. */
export function CareerView({ userKey }: { userKey: string }) {
  const data = useResource(
    `career:${userKey}`,
    () => Promise.all([listJobs(), getProfile(), getJobseekerMatchingPreferences()]),
    '求人情報を読み込めませんでした。',
  );
  const [fields, setFields] = useState({ salary: '', holidays: '', drop: '', wishHolidays: '', wishSalary: '' });
  const [area, setArea] = useState<{ prefecture: string; employmentType: string }>({ prefecture: '', employmentType: '' });
  const [salaryWeight, setSalaryWeight] = useState(50);
  const [scenario, setScenario] = useState<ScenarioId>('keep-income');
  const [areaTouched, setAreaTouched] = useState(false);

  const jobs = data.data?.[0] ?? [];
  const prefectures = useMemo(() => [...new Set(jobs.map((job) => job.prefecture).filter((p): p is string => Boolean(p)))].sort(), [jobs]);
  const employmentTypes = useMemo(() => [...new Set(jobs.map((job) => job.employment_type).filter((t): t is string => Boolean(t)))].sort(), [jobs]);

  // Reuse what the person already told us (希望地域・希望最低月給) once, without overwriting their edits.
  useEffect(() => {
    if (!data.data || areaTouched) return;
    const [, profile, preferences] = data.data;
    const candidates = [...preferences.desired_prefectures, profile?.prefecture ?? ''];
    const known = new Set(data.data[0].map((job) => job.prefecture));
    const prefecture = candidates.find((candidate) => candidate && known.has(candidate)) ?? '';
    setArea((current) => (current.prefecture ? current : { ...current, prefecture }));
    if (preferences.desired_monthly_salary_min) {
      setFields((current) => (current.wishSalary ? current : { ...current, wishSalary: String(preferences.desired_monthly_salary_min! / 10000) }));
    }
  }, [data.data, areaTouched]);

  const input: SimulationInput = {
    ...emptySimulationInput,
    currentMonthlySalary: toYen(fields.salary),
    currentAnnualHolidays: toDays(fields.holidays),
    tolerableSalaryDrop: toYen(fields.drop),
    desiredAnnualHolidays: toDays(fields.wishHolidays),
    desiredMinimumSalary: toYen(fields.wishSalary),
    prefecture: area.prefecture,
    employmentType: area.employmentType,
    salaryWeight,
  };

  const posted = useMemo(() => toPostedJobs(jobs, input), [jobs, input.prefecture, input.employmentType]);
  const summary = summarizeSalaries(posted);
  const position = salaryPosition(posted, input.currentMonthlySalary);
  const bins = useMemo(() => salaryHistogram(posted, summary ? input.currentMonthlySalary : null), [posted, summary, input.currentMonthlySalary]);
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const results: Record<ScenarioId, ScenarioResult> = {
    'keep-income': scenarioKeepIncome(posted, input),
    'more-holidays': scenarioMoreHolidays(posted, input),
    balance: scenarioBalance(posted, input),
  };
  const current = results[scenario];
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const where = [input.prefecture || '全国', input.employmentType].filter(Boolean).join('・');

  return (
    <div className="hc-view hc-career">
      <p className="hc-lead">給与も、休みも。いまの条件と、公開されている求人を並べて考えられます。入力はすべて任意で、この画面を閉じると消えます。</p>

      {data.status === 'error' && <InlineError message={data.error} onRetry={data.reload} />}
      {data.status === 'loading' && !data.data && <SkeletonList rows={2} />}

      {data.data && (
        <>
          <section className="hc-section is-first" aria-labelledby="career-input-heading">
            <div className="hc-section-head"><h2 id="career-input-heading">あなたの条件</h2></div>
            <div className="hc-career-form">
              <NumberField label="今の月給（額面）" unit="万円" hint="例：23" value={fields.salary} onChange={(salary) => setFields({ ...fields, salary })} />
              <NumberField label="今の年間休日" unit="日" hint="例：110" value={fields.holidays} onChange={(holidays) => setFields({ ...fields, holidays })} />
              <NumberField label="下がってもよい月給" unit="万円まで" hint="例：1" value={fields.drop} onChange={(drop) => setFields({ ...fields, drop })} />
              <NumberField label="希望の最低月給" unit="万円" hint="例：22" value={fields.wishSalary} onChange={(wishSalary) => setFields({ ...fields, wishSalary })} />
              <NumberField label="希望の年間休日" unit="日以上" hint="例：120" value={fields.wishHolidays} onChange={(wishHolidays) => setFields({ ...fields, wishHolidays })} />
              <label className="hc-field">
                <span>地域</span>
                <select value={area.prefecture} onChange={(e) => { setAreaTouched(true); setArea({ ...area, prefecture: e.target.value }); }}>
                  <option value="">全国</option>
                  {prefectures.map((prefecture) => <option key={prefecture} value={prefecture}>{prefecture}</option>)}
                </select>
              </label>
              <label className="hc-field">
                <span>雇用形態</span>
                <select value={area.employmentType} onChange={(e) => { setAreaTouched(true); setArea({ ...area, employmentType: e.target.value }); }}>
                  <option value="">指定なし</option>
                  {employmentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="hc-section" aria-labelledby="career-market-heading">
            <div className="hc-section-head"><h2 id="career-market-heading">{where}の募集給与</h2></div>
            {summary ? (
              <>
                <dl className="hc-career-figures">
                  <div><dt>中央値</dt><dd>{man(summary.median)}</dd></div>
                  <div><dt>中央の50%</dt><dd>{man(summary.q1)}〜{man(summary.q3)}</dd></div>
                  <div><dt>対象</dt><dd>{summary.count}件</dd></div>
                </dl>
                {input.currentMonthlySalary !== null && position !== null && (
                  <p className="hc-career-position" role="status">
                    あなたの月給 {man(input.currentMonthlySalary)} は、募集給与の下限が {position}% の求人より上にあります。
                    {input.currentMonthlySalary >= summary.median ? '中央値と同じか、それより上です。' : '中央値より下です。'}
                    <span>これは求人票の数字との比較で、あなたの価値や能力を示すものではありません。</span>
                  </p>
                )}
                <ol className="hc-career-bars" aria-label="募集給与（下限）の分布">
                  {bins.map((bin) => (
                    <li key={bin.from} className={bin.containsYou ? 'is-you' : undefined}>
                      <span className="hc-career-bar-label">{man(bin.from)}台</span>
                      <span className="hc-career-bar"><i style={{ width: `${(bin.count / maxCount) * 100}%` }} /></span>
                      <span className="hc-career-bar-count">{bin.count}件{bin.containsYou && <b>あなた</b>}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <EmptyState
                title="参考件数が足りません"
                body={`月給で掲載されている求人が${posted.length}件のため、相場は表示しません（${minimumSampleSize}件以上で表示します）。地域や雇用形態を広げてみてください。`}
              />
            )}
            <p className="hc-note hc-career-source">
              出典：Hoiku Colorに公開中の求人の、月給の下限（時給の求人は含めません）。表示時点の集計です。
              統計調査（e-Stat）の給与実績や、法人が公表したモデル給与とは別のデータで、混ぜて計算していません。経験年数別の統計は準備中です。
            </p>
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
                <input type="range" min={0} max={100} step={10} value={salaryWeight} onChange={(e) => setSalaryWeight(Number(e.target.value))} aria-valuetext={salaryWeight === 50 ? '給与と休日を同じくらい' : salaryWeight > 50 ? '給与を優先' : '休日を優先'} />
                <small><span>休日を優先</span><span>給与を優先</span></small>
              </label>
            )}
            <ScenarioList result={current} jobById={jobById} />
            <p className="hc-note">
              募集給与の幅に希望額が入っていても、採用時の給与を保証するものではありません。年間休日が求人票から読み取れない求人は、休日の順位づけには入れていません。
            </p>
          </section>
        </>
      )}
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

function ScenarioList({ result, jobById }: { result: ScenarioResult; jobById: Map<string, import('../lib/recruitRepository').Job> }) {
  if (!result.ready) {
    return <EmptyState title="入力すると表示されます" body={`${result.missing}を入力してください。`} />;
  }
  const shown = result.matches.slice(0, 5);
  return (
    <>
      <p className="hc-career-count" aria-live="polite">
        <strong>{result.matches.length}件</strong>
        {result.salaryLine !== null && <span>月給の目安ライン {man(result.salaryLine)}</span>}
        {result.holidayUnknown > 0 && <span>休日が読み取れない{result.holidayUnknown}件は除外</span>}
      </p>
      {shown.length === 0 && <EmptyState title="条件に合う求人は見つかりませんでした" body="下がってもよい月給や希望の休日、地域を少しゆるめると見つかることがあります。" />}
      <ul className="hc-career-jobs">
        {shown.map(({ posted, reach, holidayGain }) => {
          const job = jobById.get(posted.job.id);
          return (
            <li key={posted.job.id}>
              <a href={`/jobs?job_id=${encodeURIComponent(posted.job.id)}`}>
                <strong>{job?.facility_name ?? '園'}</strong>
                <span>{job?.title}</span>
                <span className="hc-career-job-facts">
                  <b>月給 {man(posted.monthlyMin)}{posted.monthlyMax > posted.monthlyMin ? `〜${man(posted.monthlyMax)}` : ''}</b>
                  {posted.annualHolidays !== null && <b>年間休日 {posted.annualHolidays}日{holidayGain ? `（${holidayGain > 0 ? '+' : ''}${holidayGain}日）` : ''}</b>}
                  {reach === 'upper-bound-only' && <em>上限なら届く幅</em>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {result.matches.length > shown.length && <p className="hc-note">ほかに{result.matches.length - shown.length}件あります。気になる条件が決まったら「求人を探す」で絞り込めます。</p>}
    </>
  );
}
