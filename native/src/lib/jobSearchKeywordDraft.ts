/**
 * The React TextInput draft is written synchronously from onChangeText.
 * The controlled render value may still be one keystroke behind when the
 * keyboard submit or a filter chip is tapped. Never search with that stale
 * render value, or with a previous candidate's draft after an account switch.
 * This selects a query string only; server search and authorization remain
 * the canonical RPC and candidate-pinned session.
 */
export type CandidateKeywordDraft = Readonly<{
  ownerKey: string | null;
  value: string;
}>;

export function keywordForCurrentCandidate(
  ownerKey: string | null,
  draft: CandidateKeywordDraft,
  renderedKeyword: string,
): string {
  if (!ownerKey) return '';
  return draft.ownerKey === ownerKey ? draft.value : renderedKeyword;
}
