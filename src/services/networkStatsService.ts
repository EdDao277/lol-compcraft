import type { ChampionMatchupStatsRow, ChampionRoleStatsRow, TeamCompSignatureStatsRow } from '../types/database';
import { getSupabaseOrWarn, warnSupabaseError } from './serviceUtils';

export type NetworkStats = {
  roleStats: ChampionRoleStatsRow[];
  matchupStats: ChampionMatchupStatsRow[];
  teamCompSignatureStats: TeamCompSignatureStatsRow[];
};

export async function getNetworkStats(): Promise<NetworkStats> {
  const supabase = getSupabaseOrWarn('networkStatsService.getNetworkStats');
  if (!supabase) return emptyNetworkStats();

  const [roleStats, matchupStats, teamCompSignatureStats] = await Promise.all([
    safeSelect<ChampionRoleStatsRow>('champion_role_stats'),
    safeSelect<ChampionMatchupStatsRow>('champion_matchup_stats'),
    safeSelect<TeamCompSignatureStatsRow>('team_comp_signature_stats'),
  ]);

  return { roleStats, matchupStats, teamCompSignatureStats };
}

function emptyNetworkStats(): NetworkStats {
  return { roleStats: [], matchupStats: [], teamCompSignatureStats: [] };
}

async function safeSelect<T>(table: string): Promise<T[]> {
  const supabase = getSupabaseOrWarn(`networkStatsService.${table}`);
  if (!supabase) return [];

  const { data, error } = await supabase.from(table).select('*').order('games', { ascending: false }).limit(5000);
  if (error) {
    warnSupabaseError(`networkStatsService.${table}`, error);
    return [];
  }

  return (data ?? []) as T[];
}
