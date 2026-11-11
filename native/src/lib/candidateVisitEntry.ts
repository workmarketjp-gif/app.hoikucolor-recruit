/**
 * A navigational entry to the existing visit-settings/readback flow, NOT a
 * promise of bookability or permission to create a reservation. The canonical
 * getVisitSettings/requestVisit RPCs still determine actual availability.
 *
 * Web JobCard renders VisitTrialPanel for an internal, non-closed posting,
 * independently of its can_apply_direct flag. That application flag must not
 * suppress a separate visit journey. Fail closed on untrusted source/expiry.
 */
export type CandidateVisitEntryJob = Readonly<{
  is_open?: boolean;
  is_external?: boolean;
  source_kind?: string | null;
  can_apply_direct?: boolean;
  closing_at?: string | null;
}>;

export function canOpenCandidateVisit(job: CandidateVisitEntryJob | null | undefined, now: number): boolean {
  if (!job || !Number.isFinite(now) || job.is_open === false || job.is_external !== false) return false;
  // Saved-job RPC provides is_open; v2 published-job RPC instead carries
  // the canonical internal source identity. Arbitrary partial objects cannot
  // create a visit entry.
  if (job.is_open !== true && job.source_kind !== 'hoiku_color') return false;
  if (job.closing_at != null) {
    if (typeof job.closing_at !== 'string' || !job.closing_at.trim()) return false;
    const expiry = Date.parse(job.closing_at);
    if (!Number.isFinite(expiry) || expiry < now) return false;
  }
  return true;
}
