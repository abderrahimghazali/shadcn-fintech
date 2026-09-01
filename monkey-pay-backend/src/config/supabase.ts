import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Supabase client using the service-role key.
 * This bypasses RLS — use ONLY on the backend, never expose to the client.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: 'public',
  },
});

export type SupabaseClient = typeof supabase;
export type Database = {
  public: {
    Tables: Record<string, unknown>;
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
  };
};
