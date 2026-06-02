import type { PlayerChampionRow } from '../types/database';
import { getSupabaseOrWarn, warnSupabaseError } from './serviceUtils';

export type AddPlayerChampionInput = Pick<PlayerChampionRow, 'player_id' | 'champion_id' | 'role'> & Partial<Pick<PlayerChampionRow, 'comfort_score'>>;

export async function getPlayerChampions(playerId: string): Promise<PlayerChampionRow[]> {
  const supabase = getSupabaseOrWarn('playerChampionService.getPlayerChampions');
  if (!supabase) return [];
  const { data, error } = await supabase.from('player_champions').select('*').eq('player_id', playerId).order('created_at', { ascending: true });
  if (error) {
    warnSupabaseError('playerChampionService.getPlayerChampions', error);
    return [];
  }
  return data ?? [];
}

export async function addPlayerChampion(data: AddPlayerChampionInput): Promise<PlayerChampionRow | null> {
  const supabase = getSupabaseOrWarn('playerChampionService.addPlayerChampion');
  if (!supabase) return null;
  const { data: row, error } = await supabase.from('player_champions').insert(data).select('*').single();
  if (error) {
    warnSupabaseError('playerChampionService.addPlayerChampion', error);
    return null;
  }
  return row;
}

export async function updatePlayerChampion(id: string, updates: Partial<Omit<PlayerChampionRow, 'id' | 'created_at'>>): Promise<PlayerChampionRow | null> {
  const supabase = getSupabaseOrWarn('playerChampionService.updatePlayerChampion');
  if (!supabase) return null;
  const { data, error } = await supabase.from('player_champions').update(updates).eq('id', id).select('*').single();
  if (error) {
    warnSupabaseError('playerChampionService.updatePlayerChampion', error);
    return null;
  }
  return data;
}

export async function deletePlayerChampion(id: string): Promise<boolean> {
  const supabase = getSupabaseOrWarn('playerChampionService.deletePlayerChampion');
  if (!supabase) return false;
  const { error } = await supabase.from('player_champions').delete().eq('id', id);
  if (error) {
    warnSupabaseError('playerChampionService.deletePlayerChampion', error);
    return false;
  }
  return true;
}

export async function deletePlayerChampionsByPlayer(playerId: string): Promise<boolean> {
  const supabase = getSupabaseOrWarn('playerChampionService.deletePlayerChampionsByPlayer');
  if (!supabase) return false;
  const { error } = await supabase.from('player_champions').delete().eq('player_id', playerId);
  if (error) {
    warnSupabaseError('playerChampionService.deletePlayerChampionsByPlayer', error);
    return false;
  }
  return true;
}
