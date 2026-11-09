import type { JobseekerJob, JobseekerProfile } from './jobseekerCoreApi';
import { homeInlineApplyDecision } from './homeApplyDecision.ts';

export type JobDetailReadbackState = Readonly<{
  existingApplicationId: string | null;
  quarantine: boolean;
}>;

/**
 * Only a candidate-owned, well-formed canonical application may release a
 * previous ambiguous submit. A malformed matching row must NOT clear the
 * private recovery marker merely because its job_id matches.
 *
 * This pure policy does not grant application access or perform an API write.
 * The RPC/RLS remains the sole authorization boundary.
 */
export function jobDetailReadbackRecovery(
  job: JobseekerJob | null,
  profile: JobseekerProfile | null,
  applications: readonly { id: string; job_id: string }[],
  jobId: string,
  pending: boolean,
  wasUncertain: boolean,
  now: number,
): JobDetailReadbackState {
  const decision = homeInlineApplyDecision(job, profile, applications, jobId, now);
  if (decision.kind === 'existing') {
    return { existingApplicationId: decision.applicationId, quarantine: false };
  }
  // The provider returned a matching application, but its identity or the
  // surrounding canonical data failed validation. Never treat it as proof of
  // success or an absence that permits an additional mutation.
  const malformedMatch = applications.some((application) =>
    typeof application?.job_id === 'string' && application.job_id.toLowerCase() === jobId.toLowerCase());
  return {
    existingApplicationId: null,
    quarantine: Boolean(pending || wasUncertain || malformedMatch),
  };
}
