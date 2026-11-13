import { boundedPrivateRead } from './privateReadDeadline.ts';

export type MissingScoutSection<T> =
  | Readonly<{ status: 'skipped' }>
  | Readonly<{ status: 'fulfilled'; value: T }>
  | Readonly<{ status: 'rejected' }>;

/**
 * Retry only the Scout panels whose canonical initial read failed. A verified
 * preferences draft may already contain unsaved edits: re-fetching/hydrating
 * every panel on a partial failure would silently discard those edits.
 *
 * 'skipped' is not a fresh verification. Callers must leave its existing view
 * untouched and only publish fulfilled values for the same pinned candidate.
 */
export async function retryMissingScoutSections<TScouts, TPrivacy, TPreferences>(options: {
  missing: Readonly<{ scouts: boolean; privacy: boolean; preferences: boolean }>;
  loadScouts: () => Promise<TScouts>;
  loadPrivacy: () => Promise<TPrivacy>;
  loadPreferences: () => Promise<TPreferences>;
  isCurrent: () => boolean;
  timeoutMs?: number;
}): Promise<Readonly<{
  scouts: MissingScoutSection<TScouts>;
  privacy: MissingScoutSection<TPrivacy>;
  preferences: MissingScoutSection<TPreferences>;
}> | null> {
  if (!options.isCurrent()) return null;
  const attempt = async <T>(enabled: boolean, read: () => Promise<T>): Promise<MissingScoutSection<T>> => {
    if (!enabled) return { status: 'skipped' };
    try {
      const value = await boundedPrivateRead(() => {
        if (!options.isCurrent()) throw new Error('閲覧状態が変わったため読み込みを中止しました。');
        return read();
      }, options.timeoutMs);
      return { status: 'fulfilled', value };
    } catch {
      return { status: 'rejected' };
    }
  };
  const [scouts, privacy, preferences] = await Promise.all([
    attempt(options.missing.scouts, options.loadScouts),
    attempt(options.missing.privacy, options.loadPrivacy),
    attempt(options.missing.preferences, options.loadPreferences),
  ]);
  return options.isCurrent() ? { scouts, privacy, preferences } : null;
}
