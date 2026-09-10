import type { Job, VerifiedFinanceMetric } from '../lib/recruitRepository';
import './VerifiedFinanceSummary.css';

const financePriority = [
  'finance_monthly_result_stability',
  'finance_budget_managed_months_12m',
  'finance_payroll_finalized_months_12m',
  'finance_closed_months_12m',
  'finance_close_within_45_days_pct',
  'finance_positive_month_ratio_pct',
  'finance_average_result_margin_pct',
];

function formatMonth(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatMetric(metric: VerifiedFinanceMetric) {
  const value = typeof metric.value === 'number' ? Number(metric.value.toFixed(1)) : metric.value;
  return `${value}${metric.unit || ''}`;
}

export function VerifiedFinanceSummary({ job, expanded }: { job: Job; expanded: boolean }) {
  const profile = job.verified_finance;
  if (!profile?.verified_metric_count) return null;

  const entries = financePriority
    .map((key) => [key, profile.verified_metrics[key]] as const)
    .filter((entry): entry is readonly [string, VerifiedFinanceMetric] => Boolean(entry[1]?.value !== null && entry[1]?.value !== undefined))
    .slice(0, expanded ? financePriority.length : 3);

  if (!entries.length) return null;

  return <section className="verified-finance" aria-label="Hoiku Finance実績データ">
    <div className="verified-finance-head">
      <strong>✓ Hoiku Finance 実績</strong>
      <span>情報公開率 {Math.round(Number(profile.transparency_pct || 0))}%</span>
    </div>
    <div className="verified-finance-grid">
      {entries.map(([key, metric]) => <div className="verified-finance-metric" key={key}>
        <span>{metric.label}</span>
        <strong>{formatMetric(metric)}</strong>
        <small>実績 n={metric.sample_size}か月</small>
      </div>)}
    </div>
    <small className="verified-finance-period">
      集計期間 {formatMonth(profile.period_start)}〜{formatMonth(profile.period_end)} ・ 園の申告値ではなくHoiku Financeの確定済み実績から自動集計
    </small>
    {entries.some(([key]) => key === 'finance_monthly_result_stability') && <small className="verified-finance-note">
      「月次収支安定性」は月次収支の推移を示す指標で、法人全体の信用力・支払能力・将来の経営継続を保証するものではありません。
    </small>}
  </section>;
}
