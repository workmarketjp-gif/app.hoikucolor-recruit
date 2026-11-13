import { boundedPrivateRead } from './privateReadDeadline.ts';

/** A failed optional section is unknown, never an empty list or default setting. */
export type ScoutSectionResult<T> =
  | Readonly<{ status: 'fulfilled'; value: T }>
  | Readonly<{ status: 'rejected' }>;

export type ScoutSectionSnapshot<TScouts, TPrivacy, TPreferences> = Readonly<{
  scouts: ScoutSectionResult<TScouts>;
  privacy: ScoutSectionResult<TPrivacy>;
  preferences: ScoutSectionResult<TPreferences>;
}>;

/**
 * Web renders its scout inbox, privacy controls and matching preferences
 * independently. A failure in one candidate-private RPC must not conceal a
 * separately verified section. Each read is time-bounded and tied to the same
 * current Clerk/Supabase candidate view; none is automatically retried.
 *
 * The caller still has to verify pinned identity/RLS and prevent writes from
 * a section whose own canonical read failed. This is not an authorization gate.
 */
export async function readIndependentScoutSections<TScouts, TPrivacy, TPreferences>(options: {
  loadScouts: () => Promise<TScouts>;
  loadPrivacy: () => Promise<TPrivacy>;
  loadPreferences: () => Promise<TPreferences>;
  isCurrent: () => boolean;
  timeoutMs?: number;
}): Promise<ScoutSectionSnapshot<TScouts, TPrivacy, TPreferences> | null> {
  if (!options.isCurrent()) return null;
  const read = async <T>(loader: () => Promise<T>): Promise<ScoutSectionResult<T>> => {
    try {
      const value = await boundedPrivateRead(() => {
        if (!options.isCurrent()) throw new Error('閲覧状態が変わったため読み込みを中止しました。');
        return loader();
      }, options.timeoutMs);
      return { status: 'fulfilled', value };
    } catch {
      return { status: 'rejected' };
    }
  };
  const [scouts, privacy, preferences] = await Promise.all([
    read(options.loadScouts),
    read(options.loadPrivacy),
    read(options.loadPreferences),
  ]);
  return options.isCurrent() ? { scouts, privacy, preferences } : null;
}
