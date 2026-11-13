/**
 * Pick the correct explicit/gesture refresh after an independently loaded
 * Scout screen. An inbox response does not imply the privacy panel or the
 * matching preferences were verified. Re-fetch missing panels first and
 * never replace a verified, potentially edited preferences draft.
 *
 * The UI owns the account/session lease and canonical read; this pure policy
 * makes no authorization or freshness claims and does not start an RPC.
 */
export type ScoutRefreshTarget = 'missing-sections' | 'scout-inbox';

export function scoutRefreshTarget(input: Readonly<{
  scoutsVerified: boolean;
  privacyVerified: boolean;
  preferencesVerified: boolean;
}>): ScoutRefreshTarget {
  return input.scoutsVerified && input.privacyVerified && input.preferencesVerified
    ? 'scout-inbox'
    : 'missing-sections';
}
