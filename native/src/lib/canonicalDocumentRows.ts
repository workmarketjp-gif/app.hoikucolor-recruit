/**
 * Supabase returns [] for a successful, empty collection. A null/undefined or
 * non-array result without a transport error is NOT proof that no private
 * documents exist. Fail closed instead of clearing a candidate's vault,
 * application attachments, or required-document warning.
 *
 * Caller-provided labels are fixed product strings, never private row data.
 */
export function requireCanonicalDocumentRows<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}の取得結果を確認できませんでした。もう一度読み込んでください。`);
  }
  return value as T[];
}

/**
 * An application-scoped read is usable only when every returned row belongs
 * to the requested application. This supplements server RLS and protects the
 * direct two-source parent-warning read, which does not use the three-source
 * snapshot owner check. Never leak unexpected row IDs into the error.
 */
export function requireApplicationScopedDocumentRows<T extends { application_id: string }>(
  value: unknown,
  applicationId: string,
  label: string,
): T[] {
  const rows = requireCanonicalDocumentRows<T>(value, label);
  if (typeof applicationId !== 'string' || !applicationId.trim() ||
      !rows.every((row) => row !== null && typeof row === 'object' &&
        row.application_id === applicationId)) {
    throw new Error(`${label}の応募先を確認できませんでした。もう一度読み込んでください。`);
  }
  return rows;
}
