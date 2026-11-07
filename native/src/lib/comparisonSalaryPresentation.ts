/**
 * Candidate job-comparison salary disclosure, aligned with Web CompareView's
 * salaryLabel. Keep employer-supplied salary_note visible alongside any
 * numeric range: losing that qualifier misstates employment conditions.
 * This is presentation only; the server remains the source of truth.
 */
export type ComparisonSalarySource = {
  salary_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_note: string | null;
};

export function comparisonSalaryLabel(job: ComparisonSalarySource): string {
  const format = (value: number | null): string | null =>
    typeof value === 'number' && Number.isFinite(value)
      ? new Intl.NumberFormat('ja-JP').format(value)
      : null;
  const min = format(job.salary_min);
  const max = format(job.salary_max);
  const unit = job.salary_type === 'hourly' ? '時給'
    : job.salary_type === 'annual' ? '年収'
    : job.salary_type === 'monthly' ? '月給'
    : '給与';
  const note = job.salary_note ? `（${job.salary_note}）` : '';
  if (min !== null && max !== null) return `${unit} ${min}〜${max}円${note}`;
  if (min !== null) return `${unit} ${min}円〜${note}`;
  if (max !== null) return `${unit} 〜${max}円${note}`;
  return job.salary_note || '未掲載';
}
