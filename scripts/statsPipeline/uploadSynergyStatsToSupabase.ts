import { createClient } from '@supabase/supabase-js';
import generatedChampions from '../../src/data/generated/champions.json';
import { loadPipelineEnv, requirePipelineEnv } from './env';
import type { ChampionMatchupStat, ChampionRoleStat, ChampionSynergyStat, TeamCompSignatureStat } from './types';

loadPipelineEnv();

type SupabaseUpsertClient = {
  from: (table: string) => {
    upsert: (rows: unknown[], options?: { onConflict?: string }) => PromiseLike<{ error: unknown }>;
  };
};

export type NetworkStatsUploadPayload = {
  roleStats: ChampionRoleStat[];
  synergyStats: ChampionSynergyStat[];
  matchupStats: ChampionMatchupStat[];
  teamCompSignatureStats: TeamCompSignatureStat[];
};

export async function uploadSynergyStatsToSupabase(stats: ChampionSynergyStat[]) {
  if (stats.length === 0) return 0;

  const supabase = createClient(requirePipelineEnv('SUPABASE_URL'), requirePipelineEnv('SUPABASE_SERVICE_ROLE_KEY'));
  await upsertLocalChampions(supabase);

  const chunkSize = 500;
  let uploaded = 0;

  for (let index = 0; index < stats.length; index += chunkSize) {
    const chunk = stats.slice(index, index + chunkSize).map((row) => ({
      ...row,
      queue_id: row.queue_id ?? Number(row.queue.split(',')[0]),
      source_type: row.source_type ?? row.source,
    }));
    const { error } = await supabase.from('champion_synergy_stats').upsert(chunk, {
      onConflict: 'patch,region,queue_id,source_type,champion_id,role,ally_champion_id,ally_role',
    });

    if (error) throw error;
    uploaded += chunk.length;
  }

  return uploaded;
}

export async function uploadNetworkStatsToSupabase(payload: NetworkStatsUploadPayload) {
  const supabase = createClient(requirePipelineEnv('SUPABASE_URL'), requirePipelineEnv('SUPABASE_SERVICE_ROLE_KEY'));
  await upsertLocalChampions(supabase);

  const championRoleRows = await upsertChunked(supabase, 'champion_role_stats', payload.roleStats, 'patch,region,queue_id,source_type,champion_id,role');
  const synergyRows = await upsertChunked(
    supabase,
    'champion_synergy_stats',
    payload.synergyStats.map((row) => ({ ...row, source_type: row.source_type ?? row.source, source: row.source ?? row.source_type })),
    'patch,region,queue_id,source_type,champion_id,role,ally_champion_id,ally_role',
  );
  const matchupRows = await upsertChunked(
    supabase,
    'champion_matchup_stats',
    payload.matchupStats,
    'patch,region,queue_id,source_type,champion_id,role,enemy_champion_id,enemy_role,matchup_type',
  );
  const teamCompSignatureRows = await upsertChunked(supabase, 'team_comp_signature_stats', payload.teamCompSignatureStats, 'patch,region,queue_id,source_type,signature');

  return {
    championRoleRows,
    synergyRows,
    matchupRows,
    teamCompSignatureRows,
    totalRows: championRoleRows + synergyRows + matchupRows + teamCompSignatureRows,
  };
}

async function upsertChunked(supabase: SupabaseUpsertClient, table: string, rows: unknown[], onConflict: string) {
  const chunkSize = 500;
  let uploaded = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    if (chunk.length === 0) continue;
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
    uploaded += chunk.length;
  }

  return uploaded;
}

async function upsertLocalChampions(supabase: SupabaseUpsertClient) {
  const rows = generatedChampions.map((champion) => ({
    id: champion.id,
    riot_key: champion.key,
    name: champion.name,
    title: champion.title,
    image_url: champion.imageUrl,
    riot_tags: champion.riotTags,
  }));

  const { error } = await supabase.from('champions').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}
