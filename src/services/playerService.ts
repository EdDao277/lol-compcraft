import type { PlayerRow } from '../types/database';
import { getSupabaseOrWarn, warnSupabaseError } from './serviceUtils';

export type CreatePlayerInput = Pick<PlayerRow, 'team_id' | 'name' | 'primary_role'>;

export async function getPlayersByTeam(teamId: string): Promise<PlayerRow[]> {
  const supabase = getSupabaseOrWarn('playerService.getPlayersByTeam');
  if (!supabase) return [];
  const { data, error } = await supabase.from('players').select('*').eq('team_id', teamId).order('created_at', { ascending: true });
  if (error) {
    warnSupabaseError('playerService.getPlayersByTeam', error);
    return [];
  }
  return data ?? [];
}

export async function createPlayer(player: CreatePlayerInput): Promise<PlayerRow | null> {
  const supabase = getSupabaseOrWarn('playerService.createPlayer');
  if (!supabase) return null;
  const { data, error } = await supabase.from('players').insert(player).select('*').single();
  if (error) {
    warnSupabaseError('playerService.createPlayer', error);
    return null;
  }
  return data;
}

export async function updatePlayer(id: string, updates: Partial<Omit<PlayerRow, 'id' | 'created_at'>>): Promise<PlayerRow | null> {
  const supabase = getSupabaseOrWarn('playerService.updatePlayer');
  if (!supabase) return null;
  const { data, error } = await supabase.from('players').update(updates).eq('id', id).select('*').single();
  if (error) {
    warnSupabaseError('playerService.updatePlayer', error);
    return null;
  }
  return data;
}

export async function deletePlayer(id: string): Promise<boolean> {
  const supabase = getSupabaseOrWarn('playerService.deletePlayer');
  if (!supabase) return false;
  const { error } = await supabase.from('players').delete().eq('id', id);
  if (error) {
    warnSupabaseError('playerService.deletePlayer', error);
    return false;
  }
  return true;
}
