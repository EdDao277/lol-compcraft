import { createClient } from '@supabase/supabase-js';
import generatedChampions from '../../src/data/generated/champions.json';
import { loadPipelineEnv, requirePipelineEnv } from './env';
import type { ChampionSynergyStat } from './types';

loadPipelineEnv();

type SupabaseUpsertClient = {
  from: (table: string) => {
    upsert: (rows: unknown[], options?: { onConflict?: string }) => PromiseLike<{ error: unknown }>;
  };
};

export async function uploadSynergyStatsToSupabase(stats: ChampionSynergyStat[]) {
  if (stats.length === 0) return 0;

  const supabase = createClient(requirePipelineEnv('SUPABASE_URL'), requirePipelineEnv('SUPABASE_SERVICE_ROLE_KEY'));
  await upsertLocalChampions(supabase);

  const chunkSize = 500;
  let uploaded = 0;

  for (let index = 0; index < stats.length; index += chunkSize) {
    const chunk = stats.slice(index, index + chunkSize);
    const { error } = await supabase.from('champion_synergy_stats').upsert(chunk, {
      onConflict: 'patch,region,queue,tier,champion_id,role,ally_champion_id,ally_role',
    });

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
