const DEFAULT_SUPABASE_URL = 'https://kcmmpjyngcysdfbumchk.supabase.co';
const CONFIG_FUNCTION = 'get-hoiku-color-clerk-public-key';

export async function loadHoikuColorClerkPublishableKey(): Promise<string> {
  const direct = (
    import.meta.env.VITE_CLERK_HOIKU_COLOR_PUBLIC_KEY ||
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    ''
  ).trim();
  if (direct) return direct;

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const response = await fetch(`${supabaseUrl}/functions/v1/${CONFIG_FUNCTION}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as { publishableKey?: string; error?: string } | null;
  const key = payload?.publishableKey?.trim();
  if (!response.ok || !key) throw new Error(payload?.error || 'Hoiku Colorのログイン設定を取得できませんでした。');
  return key;
}
