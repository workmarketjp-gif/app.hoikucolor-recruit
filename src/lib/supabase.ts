import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://kcmmpjyngcysdfbumchk.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0JMZLIzMrL20S58JpNk-jw_lQrtT3H5';

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_PUBLIC_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL
).trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY
).trim();
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
