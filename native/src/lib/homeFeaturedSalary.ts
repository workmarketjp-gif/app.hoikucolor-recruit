import type { JobseekerJob } from './jobseekerCoreApi';

/** Match the Web's job-card salary precedence without inventing a missing salary. */
export function homeFeaturedSalary(job: Pick<JobseekerJob,
  'salary_type' | 'salary_min' | 'salary_max' | 'salary_note' | 'is_external'>): string {
  const validMin = typeof job.salary_min === 'number' && Number.isFinite(job.salary_min) && job.salary_min > 0;
  const validMax = typeof job.salary_max === 'number' && Number.isFinite(job.salary_max) && job.salary_max >= job.salary_min!;
  const prefix = job.salary_type === 'hourly' ? '時給' : job.salary_type === 'annual' ? '年収' : '月給';
  const range = validMin
    ? validMax
      ? `${prefix} ${job.salary_min!.toLocaleString('ja-JP')}${job.salary_max === job.salary_min ? '' : `〜${job.salary_max!.toLocaleString('ja-JP')}`}円`
      : `${prefix} ${job.salary_min!.toLocaleString('ja-JP')}円〜`
    : null;
  // Imported records can contain a duplicated raw number without its pay unit.
  // When structured compensation is valid it is the clearer canonical source.
  if (job.is_external && range) return range;
  return job.salary_note?.trim() || range || '給与は詳細をご確認ください';
}
