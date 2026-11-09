import type { JobseekerJob, JobseekerProfile } from './jobseekerCoreApi';

export type HomeInlineApplyDecision =
  | Readonly<{ kind: 'documents' }>
  | Readonly<{ kind: 'profile_required' }>
  | Readonly<{ kind: 'existing'; applicationId: string }>
  | Readonly<{ kind: 'unavailable' }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only canonical v2 RPC's explicit flags authorize the direct-apply UI. */
export function isExplicitlyDirectJob(
  job: Pick<JobseekerJob, 'is_external' | 'can_apply_direct'> | null | undefined,
): boolean {
  return job?.is_external === false && job.can_apply_direct === true;
}

/**
 * Fail closed until the signed-in candidate has fresh authoritative job,
 * applications and profile reads. The list RPC enforces candidate access, and
 * submission must still pass the server's own eligibility and document gates.
 * No remote mutation occurs in this helper.
 */
export function homeInlineApplyDecision(
  canonicalJob: (JobseekerJob & { is_open?: boolean }) | null,
  profile: JobseekerProfile | null,
  applications: readonly { id: string; job_id: string }[] | null,
  requestedJobId: string,
  now: number,
): HomeInlineApplyDecision {
  if (!UUID.test(requestedJobId) || !canonicalJob || typeof canonicalJob.id !== 'string' ||
      canonicalJob.id.toLowerCase() !== requestedJobId.toLowerCase() ||
      !Array.isArray(applications) || !Number.isFinite(now)) return { kind: 'unavailable' };
  if (applications.some((application) => !application || typeof application.job_id !== 'string' ||
      typeof application.id !== 'string' || !UUID.test(application.id))) return { kind: 'unavailable' };

  // UUID casing is not part of the canonical vacancy identity. This matters
  // for valid deep links and for reading back a prior candidate-owned application.
  const existing = applications.find((application) => application.job_id.toLowerCase() === requestedJobId.toLowerCase());
  if (existing) return { kind: 'existing', applicationId: existing.id };

  // An explicit canonical closed flag overrides an absent/future closing date.
  // Keep this AFTER the existing application check so closed jobs remain viewable.
  if ((canonicalJob.is_open !== undefined && typeof canonicalJob.is_open !== 'boolean') ||
      canonicalJob.is_open === false || !isExplicitlyDirectJob(canonicalJob)) {
    return { kind: 'unavailable' };
  }
  if (canonicalJob.closing_at != null) {
    const closing = typeof canonicalJob.closing_at === 'string' && canonicalJob.closing_at.trim()
      ? Date.parse(canonicalJob.closing_at) : NaN;
    // An ambiguous closing date is not authoritative evidence the vacancy is open.
    if (!Number.isFinite(closing) || closing < now) return { kind: 'unavailable' };
  }
  if (!profile?.name?.trim()) return { kind: 'profile_required' };
  return { kind: 'documents' };
}
