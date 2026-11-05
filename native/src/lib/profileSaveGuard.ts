import type { JobseekerProfileInput } from './jobseekerCoreApi';

/** Compare only editable profile fields; server-owned metadata is never client authority. */
export function canonicalProfileMatchesSubmission(
  submitted: JobseekerProfileInput,
  reread: JobseekerProfileInput | null,
): boolean {
  if (!reread) return false;
  const textFields = [
    'email', 'name', 'name_kana', 'phone', 'prefecture',
    'desired_start_date', 'self_intro',
  ] as const;
  if (textFields.some((key) => submitted[key] !== reread[key])) return false;
  if (submitted.years_of_experience !== reread.years_of_experience) return false;
  const listFields = ['desired_positions', 'desired_employment_types', 'qualifications'] as const;
  return listFields.every((key) => {
    if (!Array.isArray(reread[key]) || submitted[key].length !== reread[key].length) return false;
    const expected = [...submitted[key]].sort();
    const actual = [...reread[key]].sort();
    return expected.every((value, i) => value === actual[i]);
  });
}

/** A delayed response may only touch the same live, unshielded candidate view. */
export function canPresentProfileResult(
  requestOwnerKey: string | null,
  currentOwnerKey: string | null,
  requestGeneration: number,
  currentGeneration: number,
  privateDataAllowed: boolean,
): boolean {
  return requestOwnerKey !== null &&
    requestOwnerKey === currentOwnerKey &&
    requestGeneration === currentGeneration &&
    privateDataAllowed;
}
