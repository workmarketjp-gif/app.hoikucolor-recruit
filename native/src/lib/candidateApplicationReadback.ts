/**
 * Validate the candidate-owned application list returned by the existing
 * hc_jobseeker_list_applications SQL RPC. An absent/malformed result is NOT an
 * empty application history or an empty message inbox.
 *
 * Authorization belongs to the server's candidate-scoped RPC, not this parser.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VerifiedCandidateApplication = {
  id: string;
  job_id: string;
  applicant_name: string;
  status: string;
  desired_start_date: string | null;
  message: string | null;
  applied_at: string;
  updated_at: string;
  job_title: string;
  employment_type: string | null;
  facility_name: string;
  prefecture: string | null;
  city: string | null;
  candidate_offer_response?: 'accepted' | 'declined' | null;
  candidate_offer_responded_at?: string | null;
  candidate_offer_message?: string | null;
};

const failed = () => new Error('応募履歴の整合性を確認できませんでした。再読み込みしてください。');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isOptionalText = (value: unknown): value is string | null => value === null || isText(value);
const isTime = (value: unknown): value is string =>
  isText(value) && value.trim().length > 0 && Number.isFinite(Date.parse(value));
const isOptionalTime = (value: unknown): value is string | null => value === null || isTime(value);
const isOptionalDate = (value: unknown): value is string | null =>
  value === null || (isText(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);

function validApplication(row: unknown): row is VerifiedCandidateApplication {
  if (!isRecord(row)) return false;
  if (!isText(row.id) || !UUID.test(row.id) ||
      !isText(row.job_id) || !UUID.test(row.job_id) ||
      !isText(row.applicant_name) || !isText(row.status) || !row.status.trim() ||
      !isText(row.job_title) || !isText(row.facility_name) ||
      !isTime(row.applied_at) || !isTime(row.updated_at) ||
      !isOptionalDate(row.desired_start_date) || !isOptionalText(row.message) ||
      !isOptionalText(row.employment_type) || !isOptionalText(row.prefecture) ||
      !isOptionalText(row.city)) return false;
  // These three fields are present only where the later offer extension is
  // deployed; missing means older compatible read model, never invented offer.
  if ('candidate_offer_response' in row && row.candidate_offer_response !== null &&
      row.candidate_offer_response !== 'accepted' && row.candidate_offer_response !== 'declined') return false;
  if ('candidate_offer_responded_at' in row && !isOptionalTime(row.candidate_offer_responded_at)) return false;
  if ('candidate_offer_message' in row && !isOptionalText(row.candidate_offer_message)) return false;
  return true;
}

export function verifiedCandidateApplicationRows(data: unknown): VerifiedCandidateApplication[] {
  // PostgreSQL returns [] for a genuine candidate with no applications.
  // Null, missing, and non-arrays indicate an unconfirmed result, not "0".
  if (!Array.isArray(data)) throw failed();
  const seen = new Set<string>();
  for (const row of data) {
    if (!validApplication(row) || seen.has(row.id)) throw failed();
    seen.add(row.id);
  }
  return data;
}
