import type { TeamRow } from '../types/database';
import { getSupabaseOrWarn, warnSupabaseError } from './serviceUtils';

export async function getTeams(): Promise<TeamRow[]> {
  const supabase = getSupabaseOrWarn('teamService.getTeams');
  if (!supabase) return [];
  const { data, error } = await supabase.from('teams').select('*').order('created_at', { ascending: true });
  if (error) {
    warnSupabaseError('teamService.getTeams', error);
    return [];
  }
  return data ?? [];
}

export async function createTeam(name: string): Promise<TeamRow | null> {
  const supabase = getSupabaseOrWarn('teamService.createTeam');
  if (!supabase) return null;
  const { data, error } = await supabase.from('teams').insert({ name }).select('*').single();
  if (error) {
    warnSupabaseError('teamService.createTeam', error);
    return null;
  }
  return data;
}

export async function updateTeam(id: string, updates: Partial<Pick<TeamRow, 'name'>>): Promise<TeamRow | null> {
  const supabase = getSupabaseOrWarn('teamService.updateTeam');
  if (!supabase) return null;
  const { data, error } = await supabase.from('teams').update(updates).eq('id', id).select('*').single();
  if (error) {
    warnSupabaseError('teamService.updateTeam', error);
    return null;
  }
  return data;
}

export async function deleteTeam(id: string): Promise<boolean> {
  const supabase = getSupabaseOrWarn('teamService.deleteTeam');
  if (!supabase) return false;
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) {
    warnSupabaseError('teamService.deleteTeam', error);
    return false;
  }
  return true;
}
