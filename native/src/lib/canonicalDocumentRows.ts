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
