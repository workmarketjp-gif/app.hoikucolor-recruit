const STATIC_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '') ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

const CLERK_KEY_RE = /^pk_(?:test|live)_[A-Za-z0-9._-]+$/;

function validPublishableKey(value: string | null | undefined) {
  return Boolean(value && CLERK_KEY_RE.test(value.trim()));
}

export async function loadHoikuColorClerkPublishableKey(): Promise<string> {
  const fallback = validPublishableKey(STATIC_PUBLISHABLE_KEY) ? STATIC_PUBLISHABLE_KEY : null;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    if (fallback) return fallback;
    throw new Error('ログイン設定を確認できませんでした。');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/get-hoiku-color-clerk-public-key`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) throw new Error(`CLERK_CONFIG_HTTP_${response.status}`);
    const payload = await response.json() as { publishableKey?: unknown };
    const fetched = typeof payload.publishableKey === 'string' ? payload.publishableKey.trim() : '';
    if (validPublishableKey(fetched)) return fetched;
    if (fallback) return fallback;
    throw new Error('CLERK_CONFIG_INVALID');
  } catch (error) {
    if (fallback) return fallback;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
