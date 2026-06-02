import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(supabaseUrl as string, supabaseAnonKey as string) : null;

const warnedMessages = new Set<string>();

export function warnSupabaseFallback(message: string) {
  if (warnedMessages.has(message)) return;
  warnedMessages.add(message);
  console.warn(message);
}
