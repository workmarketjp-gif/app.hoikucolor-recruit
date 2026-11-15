import { isFreshApplicationOfferAcceptance } from './applicationDecisionDisclosure.ts';

type OfferSnapshot = Readonly<{
  id: string;
  status: string;
  candidate_offer_response?: string | null;
}>;

/**
 * A candidate must not accept an offer that changed while the Native card was
 * visible. Read the candidate-authorized current application before invoking
 * the existing acceptance RPC. Revoked sessions must not launch or present a
 * write after a slow read. The RPC still owns final atomic authorization.
 *
 * This is deliberately not a retry or an alternate acceptance endpoint.
 */
export async function acceptCandidateOfferWithFreshReadback<TDetail extends { application: OfferSnapshot }>(options: {
  presented: OfferSnapshot | null;
  isCurrent: () => boolean;
  readCurrent: () => Promise<TDetail | null>;
  accept: () => Promise<TDetail>;
}): Promise<{ kind: 'accepted'; detail: TDetail } | { kind: 'stale'; detail: TDetail | null }> {
  const assertCurrent = () => {
    if (!options.isCurrent()) throw new Error('認証または閲覧状態が変わりました。応募管理で最新の内定状況をご確認ください。');
  };
  assertCurrent();
  const fresh = await options.readCurrent();
  assertCurrent();
  if (!isFreshApplicationOfferAcceptance(options.presented, fresh?.application)) {
    return { kind: 'stale', detail: fresh };
  }
  assertCurrent();
  const accepted = await options.accept();
  assertCurrent();
  return { kind: 'accepted', detail: accepted };
}
