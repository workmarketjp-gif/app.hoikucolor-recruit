/**
 * Canonical mutation readback for candidate-private scout workflows.
 * A mutation RPC response alone is not proof that the current list/privacy
 * view reflects it. These checks use only the authenticated server readback.
 */
export type ScoutDecision = 'accepted' | 'declined';
export type ScoutDecisionRow = Readonly<{
  scout_id: string;
  scout_status: string;
}>;
export type ScoutBlockRow = Readonly<{ organization_id: string }>;
export type ScoutPrivacyReadback = Readonly<{
  scout_opt_in: boolean;
  manual_blocks: readonly ScoutBlockRow[];
}>;

export function confirmScoutDecision<T extends ScoutDecisionRow>(
  rows: readonly T[],
  scoutId: string,
  decision: ScoutDecision,
): readonly T[] {
  const matching = rows.filter((row) => row.scout_id === scoutId);
  if (matching.length !== 1 || matching[0].scout_status !== decision) {
    throw new Error('スカウト回答の最新状態を確認できませんでした。更新してご確認ください。');
  }
  return rows;
}

export function confirmScoutOptIn<T extends ScoutPrivacyReadback>(
  privacy: T,
  enabled: boolean,
): T {
  if (privacy.scout_opt_in !== enabled) {
    throw new Error('スカウトの公開設定を確認できませんでした。更新してご確認ください。');
  }
  return privacy;
}

export function confirmScoutBlock<T extends ScoutPrivacyReadback>(
  privacy: T,
  organizationId: string,
  shouldBeBlocked: boolean,
): T {
  const matches = privacy.manual_blocks.filter((row) => row.organization_id === organizationId);
  if (matches.length !== (shouldBeBlocked ? 1 : 0)) {
    throw new Error('法人ブロック設定を確認できませんでした。更新してご確認ください。');
  }
  return privacy;
}
