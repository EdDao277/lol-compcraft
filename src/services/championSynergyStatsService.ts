import type { ChampionSynergyStatsRow } from '../types/database';
import { getSupabaseOrWarn, warnSupabaseError } from './serviceUtils';

export type SynergyStatsFilters = {
  patch?: string;
  region?: string;
  queue?: string;
  tier?: string | null;
  championId?: string;
  role?: string;
  allyChampionId?: string;
  allyRole?: string;
};

export async function getSynergyStats(filters: SynergyStatsFilters = {}): Promise<ChampionSynergyStatsRow[]> {
  const supabase = getSupabaseOrWarn('championSynergyStatsService.getSynergyStats');
  if (!supabase) return [];

  let query = supabase.from('champion_synergy_stats').select('*');
  if (filters.patch) query = query.eq('patch', filters.patch);
  if (filters.region) query = query.eq('region', filters.region);
  if (filters.queue) query = query.eq('queue', filters.queue);
  if (filters.tier !== undefined) query = filters.tier === null ? query.is('tier', null) : query.eq('tier', filters.tier);
  if (filters.championId) query = query.eq('champion_id', filters.championId);
  if (filters.role) query = query.eq('role', filters.role);
  if (filters.allyChampionId) query = query.eq('ally_champion_id', filters.allyChampionId);
  if (filters.allyRole) query = query.eq('ally_role', filters.allyRole);

  const { data, error } = await query.order('games', { ascending: false });
  if (error) {
    warnSupabaseError('championSynergyStatsService.getSynergyStats', error);
    return [];
  }

  return data ?? [];
}
