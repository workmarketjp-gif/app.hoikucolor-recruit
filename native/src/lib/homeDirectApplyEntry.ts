import type { HomeInlineApplyDecision } from './homeApplyDecision';
import type { HomeJobAvailability } from './homeFeaturedDetails';

/** A navigation hint may open document selection, NEVER initiate a mutation. */
export function canPreopenHomeDocuments(
  intent: string | undefined,
  decision: HomeInlineApplyDecision,
  availability: HomeJobAvailability,
  pendingOrUncertain: boolean,
): boolean {
  return intent === '1' && decision.kind === 'documents' &&
    availability === 'open' && !pendingOrUncertain;
}
