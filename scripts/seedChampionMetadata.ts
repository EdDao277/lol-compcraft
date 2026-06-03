import { createClient } from '@supabase/supabase-js';
import generatedChampions from '../src/data/generated/champions.json';
import { getChampionMetadata } from '../src/data/championDraftMetadata';
import { loadPipelineEnv, requirePipelineEnv } from './statsPipeline/env';

loadPipelineEnv();

async function main() {
  const supabase = createClient(requirePipelineEnv('SUPABASE_URL'), requirePipelineEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const championRows = generatedChampions.map((champion) => ({
    id: champion.id,
    riot_key: champion.key,
    name: champion.name,
    title: champion.title,
    image_url: champion.imageUrl,
    riot_tags: champion.riotTags,
  }));

  const { error: championError } = await supabase.from('champions').upsert(championRows, { onConflict: 'id' });
  if (championError) throw championError;

  const metadataRows = generatedChampions.map((champion) => {
    const metadata = getChampionMetadata(champion.id);
    return {
      champion_id: metadata.championId,
      roles: metadata.roles,
      damage_type: metadata.damageType,
      comp_tags: metadata.compTags,
      utility_tags: metadata.utilityTags,
      lane_tags: metadata.laneTags,
      threat_tags: metadata.threatTags,
      weakness_tags: metadata.weaknessTags,
      counter_tags: metadata.counterTags,
      blind_pick_score: metadata.blindPickScore,
      flex_value: metadata.flexValue,
      early_pick_value: metadata.earlyPickValue,
      late_pick_value: metadata.latePickValue,
      synergies: metadata.synergies,
      counters: metadata.counters,
      countered_by: metadata.counteredBy,
      notes: metadata.notes ?? null,
    };
  });

  const { error } = await supabase.from('champion_metadata').upsert(metadataRows, { onConflict: 'champion_id' });
  if (error) throw error;

  console.log(`champion rows upserted: ${championRows.length}`);
  console.log(`champion metadata rows upserted: ${metadataRows.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
