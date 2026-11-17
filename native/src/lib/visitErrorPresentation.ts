/**
 * Opaque candidate-private visit RPC errors may contain identifiers, URLs,
 * Storage paths or server internals. Use static Japanese instructions instead
 * of Error.message; never inspect or stringify the supplied object.
 * The mutation outcomes are ambiguous if the dispatch may have started.
 */
export function safeVisitErrorMessage(
  stage: 'load' | 'readback_request' | 'readback_cancel' | 'request' | 'cancel',
  _untrustedCause: unknown,
): string {
  switch (stage) {
    case 'load':
      return '見学・体験の予約情報を取得できませんでした。通信状態を確認して更新してください。';
    case 'readback_request':
      return '予約の操作後、最新の受付状況を確認できませんでした。再申込せず、予約一覧を更新して確認してください。';
    case 'readback_cancel':
      return 'キャンセルの操作後、最新の予約状況を確認できませんでした。再操作せず、予約一覧を更新して確認してください。';
    case 'request':
      return '予約申込の結果を確認できませんでした。重複申込を防ぐため、再申込せず予約一覧を更新してください。';
    case 'cancel':
      return 'キャンセルの結果を確認できませんでした。再操作せず予約一覧を更新してください。';
  }
}
