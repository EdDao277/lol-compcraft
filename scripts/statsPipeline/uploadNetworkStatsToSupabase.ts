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

export async function uploadNetworkStatsToSupabase(payload: NetworkStatsUploadPayload) {
  const supabase = createClient(requirePipelineEnv('SUPABASE_URL'), requirePipelineEnv('SUPABASE_SERVICE_ROLE_KEY'));
  await upsertLocalChampions(supabase);

  console.log(`uploading champion_role_stats rows: ${payload.roleStats.length}`);
  const championRoleRows = await upsertChunked(supabase, 'champion_role_stats', payload.roleStats, 'patch,region,queue_id,source_type,champion_id,role');
  console.log(`uploaded champion_role_stats rows: ${championRoleRows}`);
  console.log(`uploading champion_synergy_stats rows: ${payload.synergyStats.length}`);
  const synergyRows = await upsertChunked(
    supabase,
    'champion_synergy_stats',
    payload.synergyStats.map((row) => ({ ...row, source_type: row.source_type ?? row.source, source: row.source ?? row.source_type })),
    'patch,region,queue_id,source_type,champion_id,role,ally_champion_id,ally_role',
  );
  console.log(`uploaded champion_synergy_stats rows: ${synergyRows}`);
  console.log(`uploading champion_matchup_stats rows: ${payload.matchupStats.length}`);
  const matchupRows = await upsertChunked(
    supabase,
    'champion_matchup_stats',
    payload.matchupStats,
    'patch,region,queue_id,source_type,champion_id,role,enemy_champion_id,enemy_role,matchup_type',
  );
  console.log(`uploaded champion_matchup_stats rows: ${matchupRows}`);
  console.log(`uploading team_comp_signature_stats rows: ${payload.teamCompSignatureStats.length}`);
  const teamCompSignatureRows = await upsertChunked(supabase, 'team_comp_signature_stats', payload.teamCompSignatureStats, 'patch,region,queue_id,source_type,signature');
  console.log(`uploaded team_comp_signature_stats rows: ${teamCompSignatureRows}`);

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
    if (error) {
      throw new Error(`Failed to upsert ${table} rows ${index + 1}-${index + chunk.length} with conflict target "${onConflict}": ${JSON.stringify(error)}`);
    }
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
