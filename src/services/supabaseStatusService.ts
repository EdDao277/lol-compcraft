import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

export type SupabaseStatus = 'connected' | 'local';

export async function getSupabaseStatus(): Promise<SupabaseStatus> {
  if (!isSupabaseConfigured || !supabase) return 'local';
  const { error } = await supabase.from('teams').select('id').limit(1);
  return error ? 'local' : 'connected';
}
