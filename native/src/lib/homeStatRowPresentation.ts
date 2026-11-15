/**
 * Match the Web Home StatRow contract (src/App.tsx at Web main 5d9f4491):
 * a failed private read with no confirmed count is retried by tapping the
 * row; a pending read stays unknown (ellipsis), not a fabricated zero.
 * A confirmed count remains actionable even when a separate partial warning
 * exists elsewhere in the notification snapshot.
 */
export type HomeStatRowPresentation = {
  value: string;
  retry: boolean;
};

export function homeStatRowPresentation(
  count: number | null,
  error: string | null,
): HomeStatRowPresentation {
  const confirmed = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
  if (confirmed) return { value: String(count), retry: false };
  if (error) return { value: '読み込めませんでした', retry: true };
  return { value: '…', retry: false };
}
