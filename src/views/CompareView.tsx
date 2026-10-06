import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EmptyState, InlineError, SkeletonList } from '../components/StateViews';
import { matchJob, type JobMatchResult } from '../lib/jobMatching';
import { getJobseekerMatchingPreferences } from '../lib/profilePreferencesRepository';
import { getProfile, listJobs, type Job, type VerifiedFinanceMetric, type VerifiedWorkplaceMetric } from '../lib/recruitRepository';
import { uuidPattern } from '../lib/router';
import { useResource } from '../lib/useResource';

const maxComparedJobs = 3;

const workplacePriority = [
  'average_monthly_overtime_hours',
  'paid_leave_usage_rate_pct',
  'average_tenure_years',
  'average_monthly_saturday_shift_count',
  'average_monthly_early_shift_count',
  'average_monthly_late_shift_count',
  'nursery_teacher_ratio_pct',
  'full_time_ratio_pct',
];

const financePriority = [
  'finance_monthly_result_stability',
  'finance_budget_managed_months_12m',
  'finance_payroll_finalized_months_12m',
  'finance_closed_months_12m',
  'finance_close_within_45_days_pct',
  'finance_positive_month_ratio_pct',
  'finance_average_result_margin_pct',
];

type ComparedJob = { job: Job; match: JobMatchResult };

type ComparisonRow = {
  key: string;
  label: string;
  source: 'facility' | 'ho_verified' | 'hf_verified' | 'match';
  values: ReactNode[];
  note?: string;
};

function initialJobIds() {
  const params = new URLSearchParams(window.location.search);
  return [...new Set(params.getAll('job_id').filter((id) => uuidPattern.test(id)))].slice(0, maxComparedJobs);
}

/** Two or three jobs side by side; facility-reported values and Verified results never mix. */
export function CompareView({ userKey }: { userKey: string }) {
  const data = useResource(
    `compare:${userKey}`,
    () => Promise.all([listJobs(), getProfile(), getJobseekerMatchingPreferences()]),
    '比較情報を読み込めませんでした。',
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(initialJobIds);
  const jobs = data.data?.[0] ?? [];

  // Drop ids that are not (or no longer) published once the catalog is known.
  useEffect(() => {
    if (!data.data) return;
    const existingIds = new Set(data.data[0].map((job) => job.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => existingIds.has(id)).slice(0, maxComparedJobs);
      return next.length === current.length ? current : next;
    });
  }, [data.data]);

  // The selection is shareable: keep it in the URL without adding history entries.
  useEffect(() => {
    const params = new URLSearchParams();
    selectedIds.forEach((id) => params.append('job_id', id));
    const query = params.toString();
    window.history.replaceState(window.history.state, '', query ? `/compare?${query}` : '/compare');
  }, [selectedIds]);

  const compared = useMemo<ComparedJob[]>(() => {
    if (!data.data) return [];
    const [jobRows, profile, preferences] = data.data;
    const byId = new Map(jobRows.map((job) => [job.id, job]));
    return selectedIds.flatMap((id) => {
      const job = byId.get(id);
      return job ? [{ job, match: matchJob({ job, profile, preferences }) }] : [];
    });
  }, [data.data, selectedIds]);

  const rows = useMemo(() => buildComparisonRows(compared), [compared]);

  const toggleJob = (jobId: string) => {
    setSelectedIds((current) => {
      if (current.includes(jobId)) return current.filter((id) => id !== jobId);
      if (current.length >= maxComparedJobs) return current;
      return [...current, jobId];
    });
  };

  return (
    <div className="hc-view hc-compare">
      <p className="hc-lead">最大3件を並べて比較できます。</p>
      <ul className="hc-source-legend" aria-label="比較データの見方">
        <li><span className="source-pill source-facility">園掲載</span>求人票・園が公開した情報</li>
        <li><span className="source-pill source-ho">HO Verified</span>Hoiku Officeの確定実績から自動集計</li>
        <li><span className="source-pill source-hf">HF Verified</span>Hoiku Financeの確定済み会計実績から自動集計</li>
      </ul>

      {data.status === 'error' && <InlineError message={data.error} onRetry={data.reload} />}
      {data.status === 'loading' && !data.data && <SkeletonList rows={2} />}
      {data.data && (
        <>
          <section className="hc-section" aria-label="比較する求人を選択">
            <div className="hc-section-head"><h2>比較する求人</h2><strong className="hc-count">{selectedIds.length}/{maxComparedJobs}件</strong></div>
            {jobs.length
              ? <div className="hc-pick-list">{jobs.map((job) => {
                  const selected = selectedIds.includes(job.id);
                  const disabled = !selected && selectedIds.length >= maxComparedJobs;
                  return (
                    <button key={job.id} type="button" disabled={disabled} aria-pressed={selected} className={`hc-pick ${selected ? 'is-selected' : ''}`} onClick={() => toggleJob(job.id)}>
                      <span className="hc-pick-check" aria-hidden="true">{selected ? '✓' : '+'}</span>
                      <span className="hc-pick-text"><strong>{job.facility_name}</strong><small>{job.title}</small><small>{[job.prefecture, job.city].filter(Boolean).join(' ') || '地域未設定'}</small></span>
                    </button>
                  );
                })}</div>
              : <EmptyState title="現在比較できる公開求人がありません" body="求人が公開されると、ここから2〜3件を選んで比較できます。" action="求人を探す" href="/jobs" />}
          </section>

          {jobs.length > 0 && (compared.length < 2
            ? <p className="hc-notice">2件以上選ぶと比較表が出ます。</p>
            : <ComparisonTable compared={compared} rows={rows} onRemove={(jobId) => setSelectedIds((current) => current.filter((id) => id !== jobId))} />)}
        </>
      )}
    </div>
  );
}

function ComparisonTable({ compared, rows, onRemove }: { compared: ComparedJob[]; rows: ComparisonRow[]; onRemove: (jobId: string) => void }) {
  return <section className="hc-section compare-table-panel" aria-label="園比較表">
    <p className="hc-scroll-hint">横にスクロールして比較できます</p>
    <div className="compare-table-scroll" tabIndex={0}>
      <table className="compare-table">
        <thead><tr><th className="compare-row-label">比較項目</th>{compared.map(({ job }) => <th key={job.id}><div className="compare-job-heading"><strong>{job.facility_name}</strong><span>{job.title}</span><button type="button" onClick={() => onRemove(job.id)} aria-label={`${job.facility_name}を比較から外す`}>外す</button></div></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}><th className="compare-row-label"><span className={`source-pill source-${row.source === 'ho_verified' ? 'ho' : row.source === 'hf_verified' ? 'hf' : row.source === 'match' ? 'match' : 'facility'}`}>{sourceLabel(row.source)}</span><strong>{row.label}</strong>{row.note && <small>{row.note}</small>}</th>{row.values.map((value, index) => <td key={`${row.key}-${compared[index]?.job.id || index}`}>{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="compare-disclaimer">Verifiedは各サービスの確定実績から取得できた項目だけを表示します。未取得は「実績未公開」とし、園の掲載値で補完しません。</p>
  </section>;
}

function buildComparisonRows(compared: ComparedJob[]): ComparisonRow[] {
  const facilityRows: ComparisonRow[] = [
    { key: 'condition-match', label: '希望条件マッチ', source: 'match', values: compared.map(({ match }) => valueNode(match.condition_score === null ? '希望条件未設定' : `${match.condition_score}%`, match.condition_score !== null && match.condition_score >= 70)) },
    { key: 'childcare-values', label: '保育観サイン', source: 'match', note: '求人文面に明示された表現だけを確認', values: compared.map(({ match }) => textNode(match.matched_childcare_values.length ? match.matched_childcare_values.join('・') : '明示的な一致サインなし')) },
    { key: 'location', label: '勤務地', source: 'facility', values: compared.map(({ job }) => textNode([job.prefecture, job.city, job.address].filter(Boolean).join(' ') || '未掲載')) },
    { key: 'employment', label: '雇用形態', source: 'facility', values: compared.map(({ job }) => textNode(job.employment_type || '未掲載')) },
    { key: 'salary', label: '給与', source: 'facility', values: compared.map(({ job }) => textNode(salaryLabel(job))) },
    { key: 'hours', label: '勤務時間', source: 'facility', values: compared.map(({ job }) => textNode(job.working_hours || '未掲載')) },
    { key: 'holidays', label: '休日', source: 'facility', values: compared.map(({ job }) => textNode(job.holidays || '未掲載')) },
    { key: 'qualification', label: '応募資格', source: 'facility', values: compared.map(({ job }) => textNode(job.required_qualification || '未掲載')) },
    { key: 'take-home-work', label: '持ち帰り', source: 'facility', note: '求人文面の明示のみ', values: compared.map(({ job }) => textNode(explicitTextSignal(job, ['持ち帰りなし', '持ち帰り仕事なし', '持ち帰り業務なし'], '持ち帰りなしと明記'))) },
    { key: 'staffing', label: '配置・人員体制', source: 'facility', note: '求人文面の明示のみ', values: compared.map(({ job }) => textNode(explicitTextSignal(job, ['基準以上の配置', '手厚い配置', '配置に余裕', 'ゆとりある配置'], '手厚い配置の記載あり'))) },
    { key: 'benefits', label: '福利厚生・制度', source: 'facility', values: compared.map(({ job }) => textNode(job.benefits || '未掲載')) },
  ];

  const workplaceRows = workplacePriority.map((metricKey): ComparisonRow => ({
    key: `ho-${metricKey}`,
    label: metricLabel(compared, 'workplace', metricKey),
    source: 'ho_verified',
    values: compared.map(({ job }) => verifiedMetricNode(job.verified_workplace?.verified_metrics?.[metricKey] || null, 'HO')),
  }));

  const financeRows = financePriority.map((metricKey): ComparisonRow => ({
    key: `hf-${metricKey}`,
    label: metricLabel(compared, 'finance', metricKey),
    source: 'hf_verified',
    values: compared.map(({ job }) => verifiedMetricNode(job.verified_finance?.verified_metrics?.[metricKey] || null, 'HF')),
  }));

  return [...facilityRows, ...workplaceRows, ...financeRows].filter((row) => row.source === 'facility' || row.source === 'match' || row.values.some((value) => value !== null));
}

function metricLabel(compared: ComparedJob[], kind: 'workplace' | 'finance', key: string) {
  for (const { job } of compared) {
    const metric = kind === 'workplace' ? job.verified_workplace?.verified_metrics?.[key] : job.verified_finance?.verified_metrics?.[key];
    if (metric?.label) return metric.label;
  }
  const fallback: Record<string, string> = {
    average_monthly_overtime_hours: '平均時間外労働', paid_leave_usage_rate_pct: '有休取得率', average_tenure_years: '平均勤続年数', average_monthly_saturday_shift_count: '平均土曜勤務回数', average_monthly_early_shift_count: '平均早番回数', average_monthly_late_shift_count: '平均遅番回数', nursery_teacher_ratio_pct: '保育士比率', full_time_ratio_pct: '常勤比率', finance_monthly_result_stability: '月次収支安定性', finance_budget_managed_months_12m: '予算管理実績', finance_payroll_finalized_months_12m: '給与確定実績', finance_closed_months_12m: '月次締め実績', finance_close_within_45_days_pct: '45日以内締め率', finance_positive_month_ratio_pct: '黒字月比率', finance_average_result_margin_pct: '平均収支率',
  };
  return fallback[key] || key;
}

function verifiedMetricNode(metric: VerifiedWorkplaceMetric | VerifiedFinanceMetric | null, source: 'HO' | 'HF'): ReactNode {
  if (!metric || metric.value === null || metric.value === undefined) return <span className="compare-missing">実績未公開</span>;
  const value = typeof metric.value === 'number' ? Number(metric.value.toFixed(1)) : metric.value;
  return <div className="compare-verified-value"><strong>{value}{metric.unit || ''}</strong><small>{source} Verified ・ n={metric.sample_size}</small></div>;
}

function textNode(value: string): ReactNode {
  return <span className={value.includes('未掲載') || value.includes('明記なし') ? 'compare-missing' : ''}>{value}</span>;
}

function valueNode(value: string, strong: boolean): ReactNode {
  return <strong className={strong ? 'compare-strong-value' : ''}>{value}</strong>;
}

function explicitTextSignal(job: Job, phrases: string[], positiveLabel: string) {
  const text = [job.description, job.working_hours, job.holidays, job.benefits].filter(Boolean).join('');
  return phrases.some((phrase) => text.includes(phrase)) ? positiveLabel : '求人情報に明記なし';
}

function salaryLabel(job: Job) {
  const format = (value: number | null) => value === null ? null : new Intl.NumberFormat('ja-JP').format(value);
  const min = format(job.salary_min);
  const max = format(job.salary_max);
  const unit = job.salary_type === 'hourly' ? '時給' : job.salary_type === 'annual' ? '年収' : job.salary_type === 'monthly' ? '月給' : '給与';
  if (min && max) return `${unit} ${min}〜${max}円${job.salary_note ? `（${job.salary_note}）` : ''}`;
  if (min) return `${unit} ${min}円〜${job.salary_note ? `（${job.salary_note}）` : ''}`;
  if (max) return `${unit} 〜${max}円${job.salary_note ? `（${job.salary_note}）` : ''}`;
  return job.salary_note || '未掲載';
}

function sourceLabel(source: ComparisonRow['source']) {
  if (source === 'ho_verified') return 'HO Verified';
  if (source === 'hf_verified') return 'HF Verified';
  if (source === 'match') return 'マッチング';
  return '園掲載';
}
