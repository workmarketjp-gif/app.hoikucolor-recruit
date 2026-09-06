import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://kcmmpjyngcysdfbumchk.supabase.co').trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
let accessTokenGetter: (() => Promise<string | null>) | null = null;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => accessTokenGetter?.() ?? null,
      auth: { persistSession: false },
    })
  : null;

export function setSupabaseAccessTokenGetter(getter: (() => Promise<string | null>) | null) {
  accessTokenGetter = getter;
}
