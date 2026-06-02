import { supabase, warnSupabaseFallback } from '../lib/supabaseClient';

export function getSupabaseOrWarn(serviceName: string) {
  if (!supabase) {
    warnSupabaseFallback(`${serviceName}: Supabase is not configured; using local mock data fallback.`);
    return null;
  }
  return supabase;
}

export function warnSupabaseError(serviceName: string, error: unknown) {
  console.warn(`${serviceName}: Supabase request failed; using safe fallback.`, error);
}
