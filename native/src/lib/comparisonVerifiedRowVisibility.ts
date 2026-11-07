type MetricEvidence = { verified_metrics?: Record<string, { value?: string | number | null }> };
type ComparisonJobEvidence = {
  verified_workplace?: MetricEvidence | null;
  verified_finance?: MetricEvidence | null;
};
type ComparisonEvidenceKind = 'workplace' | 'finance';

/**
 * Web /compare only renders a verified-metric row if at least one of the
 * compared jobs actually publishes that metric. A real 0 remains evidence;
 * missing evidence stays "実績未公開" in the other selected jobs' cells.
 * A profile-level metric count or quality score is not evidence for this row.
 */
export function visibleComparisonMetricKeys(
  jobs: readonly ComparisonJobEvidence[],
  kind: ComparisonEvidenceKind,
  priority: readonly string[],
): string[] {
  return priority.filter((key) => jobs.some((job) => {
    const metric = (kind === 'workplace' ? job.verified_workplace : job.verified_finance)
      ?.verified_metrics?.[key];
    return metric !== undefined && metric.value !== null && metric.value !== undefined;
  }));
}
