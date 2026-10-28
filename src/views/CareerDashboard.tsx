import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { InlineError, SkeletonList } from '../components/StateViews';
import { track } from '../lib/analytics';
import {
  getCareerConditions, getHolidayMarket, getOfficialWageStats, getSalaryMarket, getScenarioJobs, maybe,
  type CareerConditions, type HolidayMarket, type Maybe, type OfficialWageStats, type SalaryMarket, type ScenarioResponse,
} from '../lib/careerRepository';
import { formatMan, minimumSampleSize, scenarioCopy, scenarioSalaryLine, type ScenarioId } from '../lib/careerSimulation';
import { getJobseekerMatchingPreferences, type JobseekerMatchingPreferences } from '../lib/profilePreferencesRepository';
import type { JobseekerProfile } from '../lib/recruitRepository';
import { errorMessage, useResource } from '../lib/useResource';
import './CareerView.css';
import './CareerDashboard.css';

/**
 * キャリアダッシュボード (Home). Reads only existing sources and never fills a gap:
 *   あなたの給与          hc_jobseeker_get_career_conditions (owner-only, hidden until the person shows it)
 *   求人票の募集給与       hc_jobseeker_salary_market_v1 (SQL aggregate, the postings job search shows)
 *   公的統計の給与実績     hc_jobseeker_official_wage_stats_v1 (準備中 until deployed)
 *   求人票の年間休日       hc_jobseeker_holiday_market_v1 (準備中 until deployed)
 *   有休・残業・離職など   no published source yet → stated as such, never estimated
 * Personal numbers stay on this screen: not in the URL, storage, analytics or logs.
 */

type ProfileState = 'empty' | 'partial' | 'complete';
type CtaSlot = 'profile' | 'career_input' | 'career_jobs';

const dashboardSeenKey = 'hc_dashboard_seen_v1';

export function profileState(profile: JobseekerProfile | null, preferences: JobseekerMatchingPreferences | null): ProfileState {
  const facts = [
    Boolean(preferences?.desired_prefectures.length || profile?.prefecture),
    profile?.years_of_experience !== null && profile?.years_of_experience !== undefined,
    Boolean(profile?.desired_positions.length),
    Boolean(profile?.desired_employment_types.length),
  ];
  const known = facts.filter(Boolean).length;
  return known === 0 ? 'empty' : known === facts.length ? 'complete' : 'partial';
}

export function CareerDashboard({ userKey, profile }: { userKey: string; profile: JobseekerProfile | null }) {
  const base = useResource(
    `dashboard-base:${userKey}`,
    async () => {
      const [preferences, conditions] = await Promise.all([
        getJobseekerMatchingPreferences(),
        maybe(getCareerConditions).catch(() => ({ kind: 'failed' as const })),
      ]);
      return { preferences, conditions };
    },
    'あなたの希望条件を読み込めませんでした。',
  );
  const preferences = base.data?.preferences ?? null;
  const conditions: CareerConditions | null = base.data?.conditions.kind === 'ready' ? base.data.conditions.data : null;
  const prefecture = preferences?.desired_prefectures[0] ?? profile?.prefecture ?? '';
  const ready = Boolean(base.data);

  const market = useResource(ready ? `dashboard-market:${userKey}:${prefecture}` : null, () => maybe(() => getSalaryMarket(prefecture, '')), '求人の相場を読み込めませんでした。');
  const holidays = useResource(ready ? `dashboard-holidays:${userKey}:${prefecture}` : null, () => maybe(() => getHolidayMarket(prefecture)), '年間休日の分布を読み込めませんでした。');
  const official = useResource(ready ? `dashboard-official:${userKey}:${prefecture}` : null, () => maybe(() => getOfficialWageStats(prefecture)), '公的統計を読み込めませんでした。');

  const state = profileState(profile, preferences);
  const ownSalary = conditions?.current_monthly_salary ?? null;
  const wishSalary = preferences?.desired_monthly_salary_min ?? null;
  const next: { slot: CtaSlot; label: string; href: string; body: string } = state !== 'complete'
    ? { slot: 'profile', label: '希望条件を登録する', href: '/profile', body: '地域・経験・職種・働き方がわかると、あなたに合わせて比べられます。' }
    : ownSalary === null && wishSalary === null
      ? { slot: 'career_input', label: '給与と休日を入れて比べる', href: '/career', body: '今の月給と年間休日を入れると、地域の求人と並べて見られます。入力は任意で、あなただけが見られます。' }
      : { slot: 'career_jobs', label: '条件に合う求人を比べる', href: '/career', body: '収入を保つ・休みを増やす・バランスの3つの考え方で、求人を並べ直せます。' };

  // One view event per visit; `first_view` says whether this browser has opened the dashboard before.
  const viewed = useRef(false);
  useEffect(() => {
    if (!ready || viewed.current) return;
    viewed.current = true;
    let first = false;
    try { first = !localStorage.getItem(dashboardSeenKey); localStorage.setItem(dashboardSeenKey, '1'); } catch { /* storage unavailable */ }
    track('hc_dashboard_view', { first_view: first, profile_state: state });
  }, [ready, state]);

  const cta = (slot: CtaSlot) => () => track('hc_dashboard_cta', { cta: slot });

  return (
    <div className="hc-dash">
      {base.status === 'error' && !base.data && <InlineError message={base.error} onRetry={base.reload} />}
      {base.status === 'loading' && !base.data && <SkeletonList rows={2} />}

      {base.data && (
        <>
          <section className="hc-dash-hero" aria-labelledby="dash-career-heading">
            <h2 id="dash-career-heading">あなたのキャリア</h2>
            <CareerFacts profile={profile} preferences={preferences} prefecture={prefecture} />
            <div className="hc-dash-next">
              <p>{next.body}</p>
              <a className="primary-button hc-dash-primary" href={next.href} onClick={cta(next.slot)}>{next.label}<Icon name="chevron" size={18} /></a>
            </div>
          </section>

          <section className="hc-dash-card" aria-labelledby="dash-salary-heading">
            <div className="hc-dash-head">
              <h2 id="dash-salary-heading">給与と地域の相場</h2>
              <p>3つの数字は定義が違うため、混ぜたり平均したりしていません。</p>
            </div>
            <div className="hc-dash-salary">
              <OwnSalary conditions={base.data.conditions} wish={wishSalary} onCta={cta('career_input')} />
              <PostedSalary state={market} prefecture={prefecture} />
              <OfficialSalary state={official} experience={profile?.years_of_experience ?? null} />
            </div>
          </section>

          <section className="hc-dash-card" aria-labelledby="dash-holiday-heading">
            <div className="hc-dash-head">
              <h2 id="dash-holiday-heading">年間休日・有休</h2>
              <p>年間休日（会社の休み）と有休（自分で取る休み）は別の指標です。</p>
            </div>
            <Holidays state={holidays} market={market} prefecture={prefecture} current={conditions?.current_annual_holidays ?? null} />
            <dl className="hc-dash-missing">
              <div><dt>有休の取得率・取得日数</dt><dd>公表データはまだありません</dd></div>
            </dl>
          </section>

          <section className="hc-dash-card" aria-labelledby="dash-workplace-heading">
            <div className="hc-dash-head">
              <h2 id="dash-workplace-heading">残業・離職・定着</h2>
              <p>園や法人が公表した数字、勤怠記録から確認できた数字だけを表示します。推測では埋めません。</p>
            </div>
            <dl className="hc-dash-missing">
              <div><dt>月平均の残業時間</dt><dd>公表データはまだありません</dd></div>
              <div><dt>平均勤続年数</dt><dd>公表データはまだありません</dd></div>
              <div><dt>離職率</dt><dd>公表データはまだありません</dd></div>
              <div><dt>育児休業の取得・復帰</dt><dd>公表データはまだありません</dd></div>
            </dl>
            <p className="hc-note">求人ごとの「勤務実績あり」は、園の勤怠記録から確認できた数字です。求人の詳細で確認できます。平均勤続年数は離職率の代わりにはなりません。</p>
          </section>

          <section className="hc-dash-card" aria-labelledby="dash-jobs-heading">
            <div className="hc-dash-head">
              <h2 id="dash-jobs-heading">あなたに合う求人</h2>
              <p>求人票に書かれた月給と年間休日だけで比べます。日数が書かれていない休日を推測で補いません。</p>
            </div>
            <ScenarioJobs ready={ready} prefecture={prefecture} conditions={conditions} wish={wishSalary} onCta={cta('career_input')} />
          </section>

          <section className="hc-dash-card" aria-labelledby="dash-values-heading">
            <div className="hc-dash-head">
              <h2 id="dash-values-heading">保育観</h2>
              <p>大切にしたい保育と、園の保育方針を比べる準備をしています。</p>
            </div>
            {preferences && preferences.childcare_values.length > 0 ? (
              <ul className="hc-dash-chips" aria-label="大切にしたい保育観">
                {preferences.childcare_values.map((value) => <li key={value}>{value}</li>)}
              </ul>
            ) : (
              <p className="hc-note">大切にしたい保育観はまだ登録されていません。</p>
            )}
            <p className="hc-note">園の保育方針との比較は準備中です。比べられるデータがそろうまで、マッチ率は表示しません。</p>
            <a className="hc-link-button" href="/scouts">{preferences?.childcare_values.length ? '保育観を見直す' : '保育観を登録する'}</a>
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------- あなたのキャリア ------------------------------ */

function CareerFacts({ profile, preferences, prefecture }: { profile: JobseekerProfile | null; preferences: JobseekerMatchingPreferences | null; prefecture: string }) {
  const area = preferences?.desired_prefectures.length ? preferences.desired_prefectures.join('・') : prefecture;
  const experience = profile?.years_of_experience;
  const facts = [
    { label: '勤務希望地域', value: area || null },
    { label: '保育経験', value: experience === null || experience === undefined ? null : `${experience}年` },
    { label: '希望職種', value: profile?.desired_positions.length ? profile.desired_positions.join('・') : null },
    { label: '希望する働き方', value: profile?.desired_employment_types.length ? profile.desired_employment_types.join('・') : null },
  ];
  return (
    <dl className="hc-dash-facts">
      {facts.map((fact) => (
        <div key={fact.label} className={fact.value ? undefined : 'is-missing'}>
          <dt>{fact.label}</dt>
          <dd>{fact.value ?? '未登録'}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------- 給与 ---------------------------------- */

type MaybeResource<T> = { data: Maybe<T> | null; status: string; error: string | null; reload: () => void };

function OwnSalary({ conditions, wish, onCta }: { conditions: Maybe<CareerConditions | null> | { kind: 'failed' }; wish: number | null; onCta: () => void }) {
  const [shown, setShown] = useState(false);
  const own = conditions.kind === 'ready' ? conditions.data?.current_monthly_salary ?? null : null;
  return (
    <article className="hc-dash-metric is-own" aria-labelledby="dash-own-title">
      <h3 id="dash-own-title"><span className="hc-source-pill is-own">あなた</span>現在の月給</h3>
      {conditions.kind === 'failed' && <p className="hc-note" role="status">保存した条件を読み込めませんでした。</p>}
      {conditions.kind === 'unavailable' && <p className="hc-note">給与の保存は準備中です。</p>}
      {conditions.kind === 'ready' && (own === null ? (
        <>
          <p className="hc-dash-value is-empty">未入力</p>
          <p className="hc-note">入力は任意です。保存すると、あなただけが見られます。</p>
          <a className="hc-link-button" href="/career" onClick={onCta}>月給を入れて比べる</a>
        </>
      ) : (
        <>
          <p className="hc-dash-value" aria-live="polite">{shown ? formatMan(own) : '非表示'}</p>
          <button type="button" className="hc-link-button hc-dash-reveal" aria-pressed={shown} onClick={() => setShown((value) => !value)}>
            {shown ? '金額を隠す' : '金額を表示する'}
          </button>
          <p className="hc-note">あなたが保存した額面月給です。園や他の人には見えません。</p>
        </>
      ))}
      {wish !== null && <p className="hc-dash-sub">希望の最低月給 {formatMan(wish)}</p>}
    </article>
  );
}

function PostedSalary({ state, prefecture }: { state: MaybeResource<SalaryMarket>; prefecture: string }) {
  const market = state.data?.kind === 'ready' ? state.data.data : null;
  const stats = market?.monthly_lower_bound ?? null;
  const where = prefecture || '公開中の求人すべて';
  return (
    <article className="hc-dash-metric is-posted" aria-labelledby="dash-posted-title">
      <h3 id="dash-posted-title"><span className="hc-source-pill is-posted">求人票</span>募集給与（月給の下限）</h3>
      {state.status === 'error' && !state.data && <InlineError message={state.error ?? '読み込めませんでした。'} onRetry={state.reload} />}
      {state.status === 'loading' && !state.data && <SkeletonList rows={1} />}
      {state.data?.kind === 'unavailable' && <p className="hc-note">求人の相場は準備中です。</p>}
      {market && (stats ? (
        <>
          <p className="hc-dash-value">{formatMan(stats.median)}<small>中央値</small></p>
          <SalaryRange stats={stats} />
          <p className="hc-dash-sub">{where}・保育士・{stats.count}件</p>
          <details className="hc-dash-table">
            <summary>分布を表で見る</summary>
            <table>
              <caption className="hc-visually-hidden">{where}の募集給与（月給の下限）の分布</caption>
              <thead><tr><th scope="col">月給の下限</th><th scope="col">求人数</th></tr></thead>
              <tbody>{stats.histogram.map((bar) => <tr key={bar.from}><td>{formatMan(bar.from)}台</td><td>{bar.count}件</td></tr>)}</tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="hc-note">
          {market.population.scope_count === 0
            ? `${where}で公開中の保育士の求人はありません。`
            : `月給で掲載されている求人が${market.population.monthly_count}件のため、相場は表示しません（${minimumSampleSize}件以上で表示します）。`}
        </p>
      ))}
      <p className="hc-dash-source">求人票に書かれた募集条件で、実際に支払われた額ではありません。{market && `${formatDate(market.as_of)}時点・Hoiku Colorに公開中の求人。`}</p>
    </article>
  );
}

/** Interquartile band on the min–max scale, with the median marked. Server numbers only. */
function SalaryRange({ stats }: { stats: NonNullable<SalaryMarket['monthly_lower_bound']> }) {
  const span = Math.max(1, stats.max - stats.min);
  const at = (yen: number) => `${((yen - stats.min) / span) * 100}%`;
  return (
    <figure className="hc-dash-range">
      <div className="hc-dash-range-track" role="img" aria-label={`中央の50%は${formatMan(stats.q1)}から${formatMan(stats.q3)}、中央値は${formatMan(stats.median)}`}>
        <span className="hc-dash-range-band" style={{ left: at(stats.q1), width: `calc(${at(stats.q3)} - ${at(stats.q1)})` }} />
        <span className="hc-dash-range-median" style={{ left: at(stats.median) }} />
      </div>
      <figcaption>
        <span>{formatMan(stats.min)}</span>
        <strong>中央の50%：{formatMan(stats.q1)}〜{formatMan(stats.q3)}</strong>
        <span>{formatMan(stats.max)}</span>
      </figcaption>
    </figure>
  );
}

function OfficialSalary({ state, experience }: { state: MaybeResource<OfficialWageStats | null>; experience: number | null }) {
  const stats = state.data?.kind === 'ready' ? state.data.data : null;
  const mine = stats && experience !== null
    ? stats.national_by_experience.find((row) => experience >= row.experience_min_years && (row.experience_max_years === null || experience <= row.experience_max_years))
    : null;
  const regional = stats?.prefecture_all_experience ?? null;
  return (
    <article className="hc-dash-metric is-official" aria-labelledby="dash-official-title">
      <h3 id="dash-official-title"><span className="hc-source-pill is-official">公的統計</span>保育士の給与実績</h3>
      {state.status === 'error' && !state.data && <InlineError message={state.error ?? '読み込めませんでした。'} onRetry={state.reload} />}
      {state.status === 'loading' && !state.data && <SkeletonList rows={1} />}
      {state.data && !stats && (
        <>
          <p className="hc-dash-value is-empty">準備中</p>
          <p className="hc-note">賃金構造基本統計調査（厚生労働省）の数字を登録する準備をしています。登録されるまで、数字は表示しません。</p>
        </>
      )}
      {stats && (
        <>
          {mine?.monthly_scheduled_cash_yen != null ? (
            <>
              <p className="hc-dash-value">{formatMan(mine.monthly_scheduled_cash_yen)}<small>全国・経験{mine.experience_label}</small></p>
              {regional?.monthly_scheduled_cash_yen != null && <p className="hc-dash-sub">{regional.prefecture}・経験年数を区別しない {formatMan(regional.monthly_scheduled_cash_yen)}</p>}
            </>
          ) : regional?.monthly_scheduled_cash_yen != null ? (
            <p className="hc-dash-value">{formatMan(regional.monthly_scheduled_cash_yen)}<small>{regional.prefecture}・経験年数を区別しない</small></p>
          ) : (
            <p className="hc-note">この条件の統計は公表されていません。</p>
          )}
          <p className="hc-dash-source">{stats.reference_year}年 {stats.source}・月額の所定内給与（賞与を含まない）。地域別と経験年数別は別の集計で、組み合わせていません。</p>
        </>
      )}
    </article>
  );
}

/* ---------------------------------- 休日 ---------------------------------- */

function Holidays({ state, market, prefecture, current }: { state: MaybeResource<HolidayMarket>; market: MaybeResource<SalaryMarket>; prefecture: string; current: number | null }) {
  const data = state.data?.kind === 'ready' ? state.data.data : null;
  const fallback = market.data?.kind === 'ready' ? market.data.data.holidays : null;
  const where = prefecture || '公開中の求人すべて';
  const bands = data?.bands ?? null;
  const max = Math.max(1, ...(bands ?? []).map((band) => band.exact_count + band.minimum_count));
  const yours = current === null || !bands ? null : bands.find((band) => current >= band.from && current <= band.to) ?? null;

  return (
    <div className="hc-dash-holidays">
      <h3><span className="hc-source-pill is-posted">求人票</span>{where}の年間休日</h3>
      {state.status === 'error' && !state.data && <InlineError message={state.error ?? '読み込めませんでした。'} onRetry={state.reload} />}
      {state.status === 'loading' && !state.data && <SkeletonList rows={1} />}
      {state.data?.kind === 'unavailable' && (
        <p className="hc-note">
          年間休日の分布は準備中です。
          {fallback && fallback.scope_count > 0 && `いま${where}の保育士の求人${fallback.scope_count}件のうち、年間休日の日数が書かれているのは${fallback.verified_count}件です。`}
        </p>
      )}
      {data && (bands ? (
        <>
          <ol className="hc-career-bars hc-dash-bars" aria-label={`${where}の年間休日の分布（求人票に書かれた日数）`}>
            {bands.map((band) => {
              const count = band.exact_count + band.minimum_count;
              return (
                <li key={band.from} className={band === yours ? 'is-you' : undefined}>
                  <span className="hc-career-bar-label">{band.label}</span>
                  <span className="hc-career-bar"><i style={{ width: `${(count / max) * 100}%` }} /></span>
                  <span className="hc-career-bar-count">{count}件{band === yours && <b>あなた</b>}</span>
                </li>
              );
            })}
          </ol>
          <p className="hc-dash-sub">
            日数が書かれた{data.population.stated_count}件（全{data.population.scope_count}件）。
            {data.population.minimum_count > 0 && `「◯日以上」と書かれた${data.population.minimum_count}件は、その下限の日数で数えています。`}
          </p>
          <details className="hc-dash-table">
            <summary>表で見る</summary>
            <table>
              <caption className="hc-visually-hidden">{where}の年間休日の分布</caption>
              <thead><tr><th scope="col">年間休日</th><th scope="col">日数が書かれた求人</th><th scope="col">うち「以上」</th></tr></thead>
              <tbody>{bands.map((band) => <tr key={band.from}><td>{band.label}</td><td>{band.exact_count + band.minimum_count}件</td><td>{band.minimum_count}件</td></tr>)}</tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="hc-note">年間休日の日数が書かれた求人が{data.population.stated_count}件のため、分布は表示しません（{minimumSampleSize}件以上で表示します）。</p>
      ))}
      <p className="hc-dash-source">求人票に日数が書かれた求人だけを数えています。「完全週休2日」などの記載から日数を推測していません。{data && `${formatDate(data.as_of)}時点。`}</p>
    </div>
  );
}

/* ------------------------------ あなたに合う求人 ----------------------------- */

function ScenarioJobs({ ready, prefecture, conditions, wish, onCta }: { ready: boolean; prefecture: string; conditions: CareerConditions | null; wish: number | null; onCta: () => void }) {
  const [scenario, setScenario] = useState<ScenarioId>(conditions?.scenario ?? 'keep-income');
  const own = conditions?.current_monthly_salary ?? null;
  const salaryLine = scenarioSalaryLine(scenario, own, conditions?.tolerable_salary_drop ?? null, wish);
  const query = useMemo(() => ({
    scenario, prefecture, employmentType: '', salaryLine,
    holidayMoreThan: conditions?.current_annual_holidays ?? null,
    holidayAtLeast: conditions?.desired_annual_holidays ?? null,
    salaryWeight: conditions?.salary_weight ?? 50,
  }), [scenario, prefecture, salaryLine, conditions]);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; response: ScenarioResponse }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setState({ status: 'loading' });
    maybe(() => getScenarioJobs(query))
      .then((result) => { if (active) setState(result.kind === 'ready' ? { status: 'ready', response: result.data } : { status: 'unavailable' }); })
      .catch((error) => { if (active) setState({ status: 'error', message: errorMessage(error, '求人を並べられませんでした。') }); });
    return () => { active = false; };
  }, [ready, query, attempt]);

  return (
    <>
      <div className="hc-career-tabs" role="group" aria-label="比較の考え方">
        {(Object.keys(scenarioCopy) as ScenarioId[]).map((id) => (
          <button key={id} type="button" className={`hc-chip ${scenario === id ? 'is-active' : ''}`} aria-pressed={scenario === id} onClick={() => setScenario(id)}>
            {scenarioCopy[id].label}
          </button>
        ))}
      </div>
      <p className="hc-note">{scenarioCopy[scenario].lead}</p>
      {state.status === 'loading' && <SkeletonList rows={2} />}
      {state.status === 'error' && <InlineError message={state.message} onRetry={() => setAttempt((value) => value + 1)} />}
      {state.status === 'unavailable' && <p className="hc-note">求人の比較は準備中です。</p>}
      {state.status === 'ready' && !state.response.ready && (
        <div className="hc-dash-empty">
          <p>{state.response.missing === 'salary_line'
            ? (scenario === 'more-holidays' ? '今の月給を入れると、この考え方で並べられます。' : '今の月給か、希望の最低月給を入れると並べられます。')
            : '年間休日の日数が書かれた求人が少ないため、この並べ方は表示しません。'}</p>
          {state.response.missing === 'salary_line' && <a className="hc-link-button" href="/career" onClick={onCta}>月給を入れる</a>}
        </div>
      )}
      {state.status === 'ready' && state.response.ready && (
        state.response.jobs.length === 0
          ? <div className="hc-dash-empty"><p>条件に合う求人は見つかりませんでした。転職シミュレーターで条件をゆるめると見つかることがあります。</p></div>
          : (
            <>
              <p className="hc-career-count"><strong>{state.response.total}件</strong>{salaryLine !== null && scenario !== 'balance' && <span>月給の目安 {formatMan(salaryLine)}</span>}</p>
              <ul className="hc-career-jobs">
                {state.response.jobs.slice(0, 3).map((job) => (
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
              <p className="hc-note">求人を開くと、気になる保存・見学・応募に進めます。募集給与の幅に入っていても、採用時の給与を保証するものではありません。</p>
            </>
          )
      )}
      <a className="hc-link-button" href="/career">転職シミュレーターで詳しく比べる</a>
    </>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric' }).format(new Date(value));
}
