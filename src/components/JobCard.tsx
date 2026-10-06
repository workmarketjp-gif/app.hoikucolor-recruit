import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { VisitTrialPanel } from './VisitTrialPanel';
import { VerifiedFinanceSummary } from './VerifiedFinanceSummary';
import { getProfile, submitApplication, type Job, type VerifiedWorkplaceMetric } from '../lib/recruitRepository';
import type { SavedJobWithStatus } from '../lib/savedJobStatusRepository';
import { errorMessage } from '../lib/useResource';

const verifiedPriority = [
  'average_monthly_overtime_hours',
  'paid_leave_usage_rate_pct',
  'average_tenure_years',
  'average_monthly_saturday_shift_count',
  'nursery_teacher_ratio_pct',
  'average_experience_years',
  'average_monthly_early_shift_count',
  'average_monthly_late_shift_count',
  'full_time_ratio_pct',
  'average_age_years',
];

type Props = {
  job: Job;
  saved: boolean;
  onToggleSaved: (id: string) => void;
  /** No usable profile yet: collect the minimum, then come back to this job. */
  onStartApplication: (jobId: string) => void;
  /** The application was created. */
  onApplied: (applicationId: string) => void;
  initiallyExpanded?: boolean;
  /** Ranking disclosure for this position in the list (e.g. 「表示順 3」「指定求人」). */
  rankLabel?: { text: string; ariaLabel: string } | null;
  /** Screen-specific evidence shown under the summary (match reasons etc.). */
  children?: ReactNode;
  expandLabel?: string;
};

/** The one job card used by Home, search, saved and matching. */
export function JobCard({ job, saved, onToggleSaved, onStartApplication, onApplied, initiallyExpanded = false, rankLabel, children, expandLabel = '詳しく見る' }: Props) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const isClosed = (job as Partial<SavedJobWithStatus>).is_open === false || Boolean(job.closing_at && new Date(job.closing_at).getTime() < Date.now());
  const isExternal = job.is_external === true;
  const canApplyDirect = job.can_apply_direct !== false && !isExternal;
  const location = [job.prefecture, job.city].filter(Boolean).join(' ') || '勤務地は詳細をご確認ください';

  const apply = async () => {
    if (isClosed) { setApplyError('この求人は募集を終了しています。'); return; }
    setApplying(true); setApplyError(null);
    try {
      const profile = await getProfile();
      if (!profile?.name?.trim()) { onStartApplication(job.id); return; }
      const applicationId = await submitApplication(job.id, profile);
      onApplied(applicationId);
    } catch (err) {
      setApplyError(errorMessage(err, '応募を送信できませんでした。'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <article id={`job-${job.id}`} tabIndex={-1} className={`hc-job-card ${expanded ? 'is-expanded' : ''} ${rankLabel?.text === '指定求人' ? 'is-targeted' : ''}`} data-job-id={job.id}>
      {rankLabel && <span className="hc-rank-label" aria-label={rankLabel.ariaLabel}>{rankLabel.text}</span>}
      <header className="hc-job-head">
        <div className="hc-job-identity">
          <span className="hc-job-facility">{job.facility_name}</span>
          <h3>{job.title}</h3>
        </div>
        <button type="button" className={`heart-button ${saved ? 'saved' : ''}`} onClick={() => onToggleSaved(job.id)} aria-label={saved ? '気になるから外す' : '気になるに保存'} aria-pressed={saved}><Icon name="heart" size={22} /></button>
      </header>
      <p className="hc-job-salary">{salaryLabel(job)}</p>
      <p className="hc-job-meta"><Icon name="map" size={16} /> {location}{job.employment_type ? ` ・ ${job.employment_type}` : ''}</p>
      <div className="hc-job-tags">
        {isClosed && <span className="status-badge status-rejected">募集終了</span>}
        {job.verified_workplace?.verified_metric_count ? <span className="verified-tag">✓ 勤務実績あり</span> : null}
        {job.verified_finance?.verified_metric_count ? <span className="finance-verified-tag">✓ 会計実績あり</span> : null}
      </div>

      {children}

      {expanded && (
        <div className="hc-job-detail">
          <section><h4>園</h4><p>{job.facility_name}{job.facility_type ? `（${job.facility_type}）` : ''}</p><p>{job.address || location}</p></section>
          <section><h4>条件</h4>
            <dl>
              <dt>給与</dt><dd>{salaryLabel(job)}</dd>
              {job.employment_type && <><dt>雇用形態</dt><dd>{job.employment_type}</dd></>}
              {job.working_hours && <><dt>勤務時間</dt><dd>{job.working_hours}</dd></>}
              {job.holidays && <><dt>休日</dt><dd>{job.holidays}</dd></>}
              {job.required_qualification && <><dt>応募資格</dt><dd>{job.required_qualification}</dd></>}
              {job.benefits && <><dt>待遇</dt><dd>{job.benefits}</dd></>}
              <dt>募集人数</dt><dd>{job.number_of_positions}名</dd>
            </dl>
          </section>
          {(job.verified_workplace || job.verified_finance) && (
            <section><h4>実際の働き方</h4>
              {job.verified_workplace && <VerifiedWorkplaceSummary job={job} expanded={expanded} />}
              {job.verified_finance && <VerifiedFinanceSummary job={job} expanded={expanded} />}
            </section>
          )}
          {job.description && <section><h4>仕事内容・保育観</h4><p className="hc-job-description">{job.description}</p></section>}
          {!isExternal && !isClosed && <VisitTrialPanel jobId={job.id} facilityId={job.facility_id} />}
          {isClosed && <p className="form-error">募集は終了しています。保存履歴として求人内容を確認できます。</p>}
          {isExternal && job.source_name && (
            <footer className="hc-job-source-footer">
              <span>出典：{job.source_name}{job.source_job_id ? `（求人番号 ${job.source_job_id}）` : ''}</span>
              {job.source_last_verified_at && <span>最終確認 {formatSourceDate(job.source_last_verified_at)}</span>}
            </footer>
          )}
        </div>
      )}

      {applyError && <p className="form-error" role="alert">{applyError}</p>}
      <div className="hc-job-actions">
        <button className="secondary-button" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? '閉じる' : expandLabel}</button>
        {!canApplyDirect ? (
          <a className="primary-button hc-external-job-link" href={job.source_url || '#'} target="_blank" rel="noopener noreferrer" aria-disabled={!job.source_url}>
            {job.source_kind === 'hellowork' ? 'ハローワークで応募方法を確認' : '掲載元で応募方法を確認'}
          </a>
        ) : (
          <button className="primary-button" type="button" onClick={apply} disabled={applying || isClosed}>{isClosed ? '募集終了' : applying ? '応募中…' : '応募する'}</button>
        )}
      </div>
    </article>
  );
}

function VerifiedWorkplaceSummary({ job, expanded }: { job: Job; expanded: boolean }) {
  const profile = job.verified_workplace;
  const entries = useMemo(() => profile?.verified_metric_count
    ? verifiedPriority
      .map((key) => [key, profile.verified_metrics[key]] as const)
      .filter((entry): entry is readonly [string, VerifiedWorkplaceMetric] => Boolean(entry[1]?.value !== null && entry[1]?.value !== undefined))
      .slice(0, expanded ? 10 : 4)
    : [], [profile, expanded]);
  if (!profile?.verified_metric_count || !entries.length) return null;
  return <section className="verified-workplace" aria-label="勤務実績">
    <div className="verified-workplace-head"><strong>✓ 勤務実績</strong><span>情報公開率 {Math.round(Number(profile.transparency_pct || 0))}%</span></div>
    <div className="verified-metric-grid">{entries.map(([key, metric]) => <div className="verified-metric" key={key}><span>{metric.label}</span><strong>{formatVerifiedMetric(metric)}</strong><small>{metric.sample_size}件の記録</small></div>)}</div>
    <small className="verified-period">集計期間 {formatMonth(profile.period_start)}〜{formatMonth(profile.period_end)} ・ 園の申告ではなく実際の勤務記録から集計</small>
  </section>;
}

export function salaryLabel(job: Job) {
  if (job.salary_note) return job.salary_note;
  const prefix = job.salary_type === 'hourly' ? '時給' : '月給';
  if (job.salary_min && job.salary_max) return `${prefix} ${job.salary_min.toLocaleString()}〜${job.salary_max.toLocaleString()}円`;
  if (job.salary_min) return `${prefix} ${job.salary_min.toLocaleString()}円〜`;
  return '給与は詳細をご確認ください';
}

function formatSourceDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`; }
function formatMonth(value: string) { const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : `${date.getFullYear()}年${date.getMonth() + 1}月`; }
function formatVerifiedMetric(metric: VerifiedWorkplaceMetric) { const value = typeof metric.value === 'number' ? Number(metric.value.toFixed(1)) : metric.value; return `${value}${metric.unit || ''}`; }

