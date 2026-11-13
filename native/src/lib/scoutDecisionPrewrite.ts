/**
 * The candidate consents to a specific anonymous Scout offer as displayed.
 * A confirmation alert can outlive a refresh, expiry, or recruiter-side edit.
 * Require a fresh candidate-scoped canonical read of the same offer BEFORE
 * starting a response RPC that can disclose identifying information.
 * This does not replace authorization and expiry checks in the server RPC.
 */
export type ScoutDecisionOffer = Readonly<{
  scout_id: string;
  scout_status: string;
  organization_name: string;
  facility_name: string;
  job_id: string | null;
  job_title: string | null;
  employment_type: string | null;
  invitation_message: string;
  sent_at: string;
  expires_at: string;
}>;

const consentFields = [
  'organization_name', 'facility_name', 'job_id', 'job_title',
  'employment_type', 'invitation_message', 'sent_at', 'expires_at',
] as const;

/** Throws to block the response RPC if the displayed consent context is stale. */
export function requireCurrentPendingScout<T extends ScoutDecisionOffer>(
  freshRows: readonly T[],
  displayed: ScoutDecisionOffer,
  nowMs: number,
): T {
  const id = displayed.scout_id.toLowerCase();
  const matches = freshRows.filter((row) => row.scout_id.toLowerCase() === id);
  if (matches.length !== 1 || displayed.scout_status !== 'pending' ||
      matches[0].scout_status !== 'pending') {
    throw new Error('スカウトの回答状態が変わりました。最新情報をご確認ください。');
  }
  const latest = matches[0];
  if (consentFields.some((field) => latest[field] !== displayed[field])) {
    throw new Error('スカウトの園・求人・招待内容が更新されました。再確認してから回答してください。');
  }
  const expiry = Date.parse(latest.expires_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiry) || expiry <= nowMs) {
    throw new Error('回答期限を確認できないか、期限を過ぎています。最新情報をご確認ください。');
  }
  return latest;
}
