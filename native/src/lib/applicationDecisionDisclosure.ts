/**
 * Web-equivalent, read-only disclosure for irreversible candidate withdrawal.
 * Reference: src/components/ApplicationDetail.tsx on Web main fa779e73.
 * This model never authorizes an RPC; candidate/session and server state remain authoritative.
 */
const WITHDRAWABLE = new Set(['new', 'reviewing', 'interview', 'offered']);

export function applicationDecisionDisclosure(
  status: string | null | undefined,
  offerResponse: string | null | undefined,
) {
  if (!status || !WITHDRAWABLE.has(status)) return null;
  const offered = status === 'offered';
  const accepted = offered && offerResponse === 'accepted';
  return {
    offered,
    accepted,
    canAccept: offered && !accepted,
    heading: accepted ? '内定を承諾済み' : offered ? '内定への回答' : '応募の辞退',
    explanation: accepted
      ? 'これからの案内は、園とのやり取りで確認できます。事情が変わったときは、ここから辞退することもできます。'
      : offered
        ? '内定を承諾するか、辞退するかを選んでください。回答は園にもすぐに届きます。'
        : '選考を続けない場合は、ここから応募を辞退できます。予定している面接・見学・体験も、あわせてキャンセルされます。',
    withdrawLabel: accepted
      ? '承諾を取り消して辞退する'
      : offered ? '内定を辞退する' : '応募を辞退する',
    confirmationWarning: offered
      ? '辞退すると、この内定は取り消せません。'
      : '辞退すると、この応募は取り消せません。',
  } as const;
}

/** A tap on the disclosure opener alone must never authorize a withdrawal. */
export function canConfirmApplicationWithdrawal(
  status: string | null | undefined,
  offerResponse: string | null | undefined,
  confirmationOpen: boolean,
): boolean {
  return confirmationOpen && applicationDecisionDisclosure(status, offerResponse) !== null;
}

/**
 * The withdrawal sheet is a snapshot, not an authorization to act on a later
 * facility decision. Compare it with a fresh authorized application readback
 * immediately before invoking the irreversible withdrawal RPC.
 * This is a UI safety gate; the backend remains the final authority.
 */
type WithdrawalApplicationSnapshot = {
  id: string;
  status: string;
  candidate_offer_response?: string | null;
};

export function isFreshApplicationWithdrawal(
  confirmation: WithdrawalApplicationSnapshot | null | undefined,
  canonical: WithdrawalApplicationSnapshot | null | undefined,
): boolean {
  if (!confirmation || !canonical || !confirmation.id || confirmation.id !== canonical.id) return false;
  if (confirmation.status !== canonical.status ||
      (confirmation.candidate_offer_response ?? null) !== (canonical.candidate_offer_response ?? null)) return false;
  return applicationDecisionDisclosure(canonical.status, canonical.candidate_offer_response) !== null;
}
