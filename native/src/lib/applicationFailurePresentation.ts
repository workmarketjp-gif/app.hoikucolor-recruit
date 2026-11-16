/**
 * Candidate application / interview reads and decisions may cross Clerk and
 * Supabase boundaries. Their raw exception text can contain user identifiers,
 * RPC parameters, signed document URLs or storage paths. Show only fixed,
 * operation-specific Japanese copy; never stringify an untrusted exception.
 *
 * A decision or interview mutation can have an ambiguous network result.
 * The presentation must not call it a definite failure or encourage blind
 * resubmission. Canonical reload (not another write) is the recovery path.
 */
export type ApplicationFailureOperation = 'detail-read' | 'interview-response' | 'decision';

export function presentApplicationFailure(
  operation: ApplicationFailureOperation,
  _cause: unknown,
): string {
  switch (operation) {
    case 'detail-read':
      return '応募情報を読み込めませんでした。通信状態を確認し、再読み込みしてください。';
    case 'interview-response':
      return '面接への回答結果を確認できませんでした。重複送信を避けるため、応募情報を再読み込みして確認してください。';
    case 'decision':
      return '応募に関する操作結果を確認できませんでした。操作を繰り返さず、応募情報を再読み込みして確認してください。';
  }
}
