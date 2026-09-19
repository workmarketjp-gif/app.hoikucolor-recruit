import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

export type ClerkTokenGetter = () => Promise<string | null>;

export function createNativeSupabase(getToken: ClerkTokenGetter) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase環境変数が設定されていません。');

  return createClient(url, key, {
    accessToken: async () => getToken(),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
