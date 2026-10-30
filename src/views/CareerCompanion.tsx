import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { InlineError, SkeletonList } from '../components/StateViews';
import { track } from '../lib/analytics';
import {
  getCareerConditions, getHolidayMarket, getOfficialWageStats, getSalaryMarket, maybe, saveCareerConditions,
  type CareerConditions, type HolidayMarket, type Maybe, type OfficialWageStats, type SalaryMarket,
} from '../lib/careerRepository';
import { comparePhrase, formatMan, manText, minimumSampleSize, parseManYen } from '../lib/careerSimulation';
import { getJobseekerMatchingPreferences, type JobseekerMatchingPreferences } from '../lib/profilePreferencesRepository';
import type { JobseekerProfile } from '../lib/recruitRepository';
import { errorMessage, useResource } from '../lib/useResource';
import { CareerPaths } from './CareerPaths';
import './CareerView.css';
import './CareerCompanion.css';

/**
 * 私のお給料、比べてみる + 大切にしたいことから探す. Used on Home (with the hero) and at the top of
 * お給料・働き方. Reads only existing sources and never fills a gap:
 *   あなた            typed here, or the owner-only saved value (never shown until the person chooses 月給)
 *   求人票に書かれた    hc_jobseeker_salary_market_v1  (SQL aggregate of the postings job search shows)
 *   公的統計           hc_jobseeker_official_wage_stats_v1  (the card appears only when the RPC returns a figure)
 * A dataset that cannot help yet is not drawn as an empty card. Statistics live under 「詳しいデータを見る」.
 * Personal numbers stay on this screen: not in the URL, storage, analytics or logs.
 */

type ProfileState = 'empty' | 'partial' | 'complete';
type Basis = 'monthly' | 'hourly' | 'none';

const seenKey = 'hc_dashboard_seen_v1';

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

type Props = {
  variant: 'home' | 'page';
  userKey: string;
  profile: JobseekerProfile | null;
  /** The profile read has finished (a failed read counts; the screen then simply knows less). */
  profileLoaded: boolean;
};

export function CareerCompanion({ variant, userKey, profile, profileLoaded }: Props) {
  const base = useResource(
    `companion-base:${userKey}`,
    async () => {
      const [preferences, conditions] = await Promise.all([
        getJobseekerMatchingPreferences(),
        maybe(getCareerConditions).catch(() => ({ kind: 'failed' as const })),
      ]);
      return { preferences, conditions };
    },
    'あなたの希望条件を読み込めませんでした。',
  );
  // Everything below is derived from both reads, so nothing renders (or is counted) from half the picture.
  const ready = Boolean(base.data) && profileLoaded;
  const preferences = base.data?.preferences ?? null;
  const [savedOverride, setSavedOverride] = useState<CareerConditions | null>(null);
  const conditionsState = base.data?.conditions ?? { kind: 'failed' as const };
  const saved: CareerConditions | null = savedOverride ?? (conditionsState.kind === 'ready' ? conditionsState.data : null);

  const [prefecture, setPrefecture] = useState<string | null>(null);
  const [basis, setBasis] = useState<Basis | null>(null);
  const [salaryText, setSalaryText] = useState('');
  const [checkOpen, setCheckOpen] = useState(variant === 'page');
  const checkRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ready && prefecture === null) setPrefecture(preferences?.desired_prefectures[0] ?? profile?.prefecture ?? '');
  }, [ready, prefecture, preferences, profile]);
  const area = prefecture ?? '';

  // One view event per visit; `first_view` says whether this browser has opened it before.
  const viewed = useRef(false);
  const state = profileState(profile, preferences);
  useEffect(() => {
    if (!ready || viewed.current || variant !== 'home') return;
    viewed.current = true;
    let first = false;
    try { first = !localStorage.getItem(seenKey); localStorage.setItem(seenKey, '1'); } catch { /* storage unavailable */ }
    track('hc_dashboard_view', { first_view: first, profile_state: state });
  }, [ready, state, variant]);

  const openCheck = () => {
    setCheckOpen(true);
    track('hc_dashboard_cta', { cta: 'salary_check' });
    window.setTimeout(() => {
      checkRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      checkRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  const market = useResource(ready && checkOpen ? `companion-market:${userKey}:${area}` : null, () => maybe(() => getSalaryMarket(area, '')), '求人の相場を読み込めませんでした。');
  const official = useResource(ready && checkOpen ? `companion-official:${userKey}:${area}` : null, () => maybe(() => getOfficialWageStats(area)), '公的統計を読み込めませんでした。');
  const holidays = useResource(ready && checkOpen ? `companion-holidays:${userKey}:${area}` : null, () => maybe(() => getHolidayMarket(area)), '年間休日を読み込めませんでした。');

  const coverage = market.data?.kind === 'ready' ? market.data.data.facets.coverage : [];
  const areaOptions = useMemo(() => {
    const options = new Map(coverage.map((row) => [row.prefecture, row.count]));
    if (area && !options.has(area)) options.set(area, 0);
    return [...options.entries()].sort(([a], [b]) => a.localeCompare(b, 'ja'));
  }, [coverage, area]);

  const edit = (next: string) => {
    if (salaryText === '' && next !== '') track('hc_career_started');
    setSalaryText(next);
  };

  return (
    <div className={`hc-companion is-${variant}`}>
      {variant === 'home' && <Hero onOpen={openCheck} checkOpen={checkOpen} />}

      {!ready && base.status !== 'error' && <SkeletonList rows={2} />}
      {base.status === 'error' && !base.data && <InlineError message={base.error} onRetry={base.reload} />}

      {ready && (
        <>
          <div className="hc-area">
            <Icon name="map" size={20} />
            <label htmlFor="companion-area">さがす地域</label>
            <select id="companion-area" value={area} onChange={(event) => setPrefecture(event.target.value)}>
              <option value="">全国の求人</option>
              {(areaOptions.length ? areaOptions : [[area, 0] as [string, number]]).filter(([name]) => name).map(([name]) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          {checkOpen && (
            <SalaryCheck
              ref={checkRef} area={area} saved={saved} savedState={conditionsState.kind} basis={basis} onBasis={setBasis}
              salaryText={salaryText} onSalaryText={edit} market={market} official={official} holidays={holidays}
              onWiden={() => setPrefecture('')} onSaved={setSavedOverride} showAllLink={variant === 'home'}
            />
          )}

          <CareerPaths
            prefecture={area} salaryText={salaryText} onSalaryText={edit} saved={saved} preferences={preferences}
            onWiden={() => setPrefecture('')}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------ ヒーロー ------------------------------------ */

function Hero({ onOpen, checkOpen }: { onOpen: () => void; checkOpen: boolean }) {
  return (
    <section className="hc-hero" aria-labelledby="hero-heading">
      <svg className="hc-hero-flower" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <rect x="6" y="6" width="52" height="52" rx="19" ry="19" />
        <rect x="62" y="6" width="52" height="52" rx="19" ry="19" />
        <rect x="6" y="62" width="52" height="52" rx="19" ry="19" />
        <rect x="62" y="62" width="52" height="52" rx="19" ry="19" />
      </svg>
      <h2 id="hero-heading">あなたに合う<wbr />働き方、<wbr />見つけてみませんか？</h2>
      <p className="hc-hero-lead">お給料も、お休みも、保育への想いも。あなたが大切にしたいことから探せます。</p>
      <div className="hc-hero-actions">
        <button type="button" className="primary-button hc-hero-primary" onClick={onOpen} aria-expanded={checkOpen} aria-controls="salary-check">
          私のお給料、比べてみる<Icon name="chevron" size={18} />
        </button>
        <a className="hc-link-button" href="#career-paths" onClick={() => track('hc_dashboard_cta', { cta: 'find_by_priority' })}>お休みや保育観から探す</a>
      </div>
    </section>
  );
}

/* ---------------------------------- 給料を比べる ---------------------------------- */

type MaybeRes<T> = { data: Maybe<T> | null; status: string; error: string | null; reload: () => void };

type CheckProps = {
  area: string;
  saved: CareerConditions | null;
  savedState: 'ready' | 'unavailable' | 'failed';
  basis: Basis | null;
  onBasis: (basis: Basis) => void;
  salaryText: string;
  onSalaryText: (value: string) => void;
  market: MaybeRes<SalaryMarket>;
  official: MaybeRes<OfficialWageStats | null>;
  holidays: MaybeRes<HolidayMarket>;
  onWiden: () => void;
  onSaved: (conditions: CareerConditions) => void;
  showAllLink: boolean;
};

const SalaryCheck = forwardRef<HTMLElement, CheckProps>(function SalaryCheck(props, ref) {
  const { area, saved, savedState, basis, onBasis, salaryText, onSalaryText, market, official, holidays, onWiden, onSaved, showAllLink } = props;
  const own = basis === 'monthly' ? parseManYen(salaryText) : null;
  const marketData = market.data?.kind === 'ready' ? market.data.data : null;
  const stats = marketData?.monthly_lower_bound ?? null;
  const where = area || '全国';

  const choose = (next: Basis) => {
    onBasis(next);
    if (next === 'monthly' && salaryText === '' && saved?.current_monthly_salary != null) onSalaryText(manText(saved.current_monthly_salary));
  };

  return (
    <section ref={ref} id="salary-check" className="hc-check" tabIndex={-1} aria-labelledby="check-heading">
      <h2 id="check-heading">今のお給料はどのくらい？</h2>
      <p className="hc-note">入力は任意です。選ばなくても、{where}の求人の目安は見られます。</p>
      <div className="hc-choices" role="group" aria-label="お給料の形">
        {([['monthly', '月給'], ['hourly', '時給'], ['none', 'まだ働いていない']] as const).map(([id, label]) => (
          <button key={id} type="button" className={`hc-chip ${basis === id ? 'is-active' : ''}`} aria-pressed={basis === id} onClick={() => choose(id)}>{label}</button>
        ))}
      </div>

      {basis === 'monthly' && (
        <div className="hc-check-input">
          <label className="hc-inline-field">
            <span>月給（額面）</span>
            <span className="hc-inline-input"><input type="number" inputMode="decimal" min="0" step="any" value={salaryText} placeholder="例：23" onChange={(event) => onSalaryText(event.target.value)} /><em>万円</em></span>
          </label>
          <p className="hc-note">入力した金額は、保存ボタンを押さない限り記録されません。</p>
        </div>
      )}
      {basis === 'hourly' && (
        <p className="hc-note hc-check-hourly">時給の求人は、時間の決め方がさまざまなため、月給のようには並べて比べられません。
          <a className="hc-link-button" href="/jobs">時給の求人を、求人を探すで見る</a></p>
      )}

      {market.status === 'error' && !market.data && <InlineError message={market.error ?? '読み込めませんでした。'} onRetry={market.reload} />}
      {market.status === 'loading' && !market.data && <SkeletonList rows={1} />}
      {market.data?.kind === 'unavailable' && <p className="hc-note">求人の目安を、いまはお見せできません。<a className="hc-link-button" href="/jobs">求人を探す</a></p>}

      {marketData && !stats && (
        <div className="hc-path-empty">
          <p>{marketData.population.scope_count === 0 ? `${where}では、いま公開中の保育士の求人がありません。` : `${where}は月給が書かれた求人が${marketData.population.monthly_count}件と少なく、比べる目安をまだ作れません（${minimumSampleSize}件以上で表示します）。`}</p>
          {area && <button type="button" className="secondary-button" onClick={onWiden}>全国の求人で比べる</button>}
        </div>
      )}

      {stats && marketData && (
        <>
          <div className="hc-compare" role="group" aria-label="お給料の比べ方">
            {own !== null && (
              <article className="hc-compare-card is-own">
                <p className="hc-compare-label"><span className="hc-source-pill is-own">あなた</span>今のお給料</p>
                <p className="hc-big">{formatMan(own)}<small>月給</small></p>
                <p className="hc-compare-sub">あなたが入力した額面の月給</p>
              </article>
            )}
            <article className="hc-compare-card is-posted">
              <p className="hc-compare-label"><span className="hc-source-pill is-posted">求人票</span>求人票に書かれたお給料</p>
              <p className="hc-big">{formatMan(stats.median)}<small>月給</small></p>
              <p className="hc-compare-sub">{where}の保育士の求人{stats.count}件で、書かれている月給の真ん中あたり</p>
            </article>
            <OfficialCard state={official} />
          </div>

          {own !== null && <Verdict own={own} median={stats.median} />}
          <p className="hc-note hc-compare-caution">求人票の金額は募集の条件で、実際に支払われた給与ではありません。</p>

          {own !== null && <SaveSalary own={own} saved={saved} savedState={savedState} onSaved={onSaved} />}

          <div className="hc-check-next">
            {own !== null && <a className="primary-button" href="#career-paths" onClick={() => track('hc_dashboard_cta', { cta: 'find_higher' })}>今よりお給料が高い求人を探す<Icon name="chevron" size={18} /></a>}
            {showAllLink && <a className="hc-link-button" href="/career">条件を細かく決めて比べる</a>}
          </div>

          <MoreData market={marketData} official={official} holidays={holidays} where={where} />
        </>
      )}
    </section>
  );
});

function Verdict({ own, median }: { own: number; median: number }) {
  const result = comparePhrase(own, median);
  return (
    <p className={`hc-verdict is-${result.direction}`} role="status">
      <span className="hc-verdict-mark" aria-hidden="true">{result.direction === 'higher' ? '▲' : result.direction === 'lower' ? '▼' : '＝'}</span>
      <span>{result.text}<small>求人票の数字との違いで、あなたの価値や能力を示すものではありません。</small></span>
    </p>
  );
}

/** Shown only when the official-statistics RPC returns a figure for this person's experience or region. */
function OfficialCard({ state }: { state: MaybeRes<OfficialWageStats | null> }) {
  const stats = state.data?.kind === 'ready' ? state.data.data : null;
  if (!stats) return null;
  const regional = stats.prefecture_all_experience;
  const national = stats.national_by_experience.find((row) => row.monthly_scheduled_cash_yen != null) ?? null;
  const value = regional?.monthly_scheduled_cash_yen ?? national?.monthly_scheduled_cash_yen ?? null;
  if (value == null) return null;
  const scope = regional?.monthly_scheduled_cash_yen != null ? `${regional.prefecture}・経験年数を区別しない` : `全国・経験${national?.experience_label}`;
  return (
    <article className="hc-compare-card is-official">
      <p className="hc-compare-label"><span className="hc-source-pill is-official">公的統計</span>公的統計で見る実際の給与</p>
      <p className="hc-big">{formatMan(value)}<small>月額</small></p>
      <p className="hc-compare-sub">{stats.reference_year}年 {stats.source}・{stats.occupation}・{scope}（賞与を含まない所定内給与）</p>
    </article>
  );
}

function SaveSalary({ own, saved, savedState, onSaved }: { own: number; saved: CareerConditions | null; savedState: 'ready' | 'unavailable' | 'failed'; onSaved: (conditions: CareerConditions) => void }) {
  const [status, setStatus] = useState<'idle' | 'working' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (savedState !== 'ready') return null;
  const already = saved?.current_monthly_salary === own;
  const save = async () => {
    setStatus('working'); setError(null);
    try {
      onSaved(await saveCareerConditions({
        current_monthly_salary: own,
        current_annual_holidays: saved?.current_annual_holidays ?? null,
        tolerable_salary_drop: saved?.tolerable_salary_drop ?? null,
        desired_annual_holidays: saved?.desired_annual_holidays ?? null,
        scenario: saved?.scenario ?? 'keep-income',
        salary_weight: saved?.salary_weight ?? 50,
      }));
      setStatus('saved');
    } catch (err) {
      setError(errorMessage(err, '保存できませんでした。もう一度お試しください。'));
      setStatus('error');
    }
  };
  return (
    <div className="hc-check-save">
      {already || status === 'saved'
        ? <p className="form-success" role="status">この金額を保存しました。あなただけが見られます。</p>
        : <button type="button" className="secondary-button" disabled={status === 'working'} onClick={save}>{status === 'working' ? '保存中…' : 'この金額を保存する'}</button>}
      {status === 'error' && error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

/* ------------------------------- 詳しいデータを見る ------------------------------- */

function MoreData({ market, official, holidays, where }: { market: SalaryMarket; official: MaybeRes<OfficialWageStats | null>; holidays: MaybeRes<HolidayMarket>; where: string }) {
  const stats = market.monthly_lower_bound;
  const bands = holidays.data?.kind === 'ready' ? holidays.data.data.bands : null;
  const officialShown = official.data?.kind === 'ready' && official.data.data !== null;
  const asOf = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric' }).format(new Date(market.as_of));
  if (!stats) return null;
  return (
    <details className="hc-more">
      <summary>詳しいデータを見る</summary>
      <dl className="hc-more-facts">
        <div><dt>書かれている月給の真ん中あたり（中央値）</dt><dd>{formatMan(stats.median)}</dd></div>
        <div><dt>真ん中の半分の求人が入る範囲</dt><dd>{formatMan(stats.q1)}〜{formatMan(stats.q3)}</dd></div>
        <div><dt>いちばん低い・高い月給</dt><dd>{formatMan(stats.min)}〜{formatMan(stats.max)}</dd></div>
        <div><dt>数えた求人</dt><dd>{stats.count}件</dd></div>
      </dl>
      <table className="hc-more-table">
        <caption>{where}の保育士の求人の月給（下限）の分布</caption>
        <thead><tr><th scope="col">月給</th><th scope="col">求人の数</th></tr></thead>
        <tbody>{stats.histogram.map((bar) => <tr key={bar.from}><td>{formatMan(bar.from)}台</td><td>{bar.count}件</td></tr>)}</tbody>
      </table>
      {bands && (
        <table className="hc-more-table">
          <caption>年間休日が書かれた求人の分布（日数が書かれた求人だけ）</caption>
          <thead><tr><th scope="col">年間休日</th><th scope="col">求人の数</th></tr></thead>
          <tbody>{bands.map((band) => <tr key={band.from}><td>{band.label}</td><td>{band.exact_count + band.minimum_count}件</td></tr>)}</tbody>
        </table>
      )}
      <p className="hc-note">
        {asOf}時点で、Hoiku Colorに公開中の求人から集めています。{where}の保育士の求人{market.population.scope_count}件のうち、月給で書かれているのは{market.population.monthly_count}件です（時給などは含みません）。
        月給の幅が書かれている求人は、いちばん低い金額（下限）で数えています。
      </p>
      {!officialShown && <p className="hc-note">公的統計（厚生労働省）の給与との比較は、データの準備ができ次第お届けします。上の金額は求人票の募集条件で、実際の給与ではありません。</p>}
    </details>
  );
}
