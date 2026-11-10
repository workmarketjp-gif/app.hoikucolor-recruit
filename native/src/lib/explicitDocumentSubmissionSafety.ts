/**
 * Explicit document choice must never downgrade to the legacy application RPC:
 * legacy submission can snapshot/attach the candidate's default documents,
 * rather than only the documents expressly selected for this application.
 *
 * Failure classification is deliberately narrower than the generic missing-RPC
 * detector. Only the two known SQL/PostgREST undefined-function codes prove
 * that the v2 application transaction was not invoked at all. A message-only
 * or transport failure still requires ordinary ambiguous-write quarantine.
 */
export class ExplicitDocumentSubmissionUnavailableError extends Error {
  readonly definitivelyNotSubmitted: boolean;

  constructor(rpcError: unknown) {
    super('選択した書類の安全な提出機能を確認できませんでした。応募管理で状況を確認してください。');
    this.name = 'ExplicitDocumentSubmissionUnavailableError';
    const code = rpcError && typeof rpcError === 'object'
      ? (rpcError as { code?: unknown }).code
      : null;
    this.definitivelyNotSubmitted = code === 'PGRST202' || code === '42883';
  }
}

export function isDefinitiveExplicitDocumentRpcUnavailable(
  error: unknown,
): error is ExplicitDocumentSubmissionUnavailableError {
  return error instanceof ExplicitDocumentSubmissionUnavailableError && error.definitivelyNotSubmitted;
}
