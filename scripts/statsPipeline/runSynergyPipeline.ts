import { aggregateSynergyStats } from './aggregateSynergyStats';
import { collectPersonalMatches } from './collectPersonalMatches';
import { loadPipelineEnv } from './env';
import { getLegacySynergyPipelineConfig } from './pipelineConfigs';
import { processMatches } from './processMatches';
import { resolveSeedPuuids } from './resolveSeedPuuids';
import { uploadSynergyStatsToSupabase } from './uploadSynergyStatsToSupabase';

loadPipelineEnv();

const config = getLegacySynergyPipelineConfig();
const patch = process.env.RIOT_STATS_PATCH ?? 'unknown';
const queue = process.env.RIOT_STATS_QUEUE ?? config.queueIds.join(',');
const tier = process.env.RIOT_STATS_TIER ?? 'all';

async function main() {
  const seedPuuids = await resolveSeedPuuids(config.seedRiotIds, config.routingRegion);
  const collection = await collectPersonalMatches({
    seedPuuids,
    region: config.routingRegion,
    queueIds: config.queueIds,
    matchesPerPlayer: config.matchesPerPlayer,
    maxDepth: config.maxDepth,
    maxPlayers: config.maxPlayers,
    maxMatches: config.maxMatches,
  });

  let matchesProcessed = 0;
  const synergyStats = [...collection.matchesBySource.entries()].flatMap(([source, matches]) => {
    const processedTeams = processMatches(matches);
    matchesProcessed += processedTeams.length;
    return aggregateSynergyStats({
      teams: processedTeams,
      patch,
      region: config.routingRegion,
      queue,
      tier,
      source,
    });
  });

  const uploaded = await uploadSynergyStatsToSupabase(synergyStats);

  console.log(`seed accounts resolved: ${seedPuuids.length}`);
  console.log(`players visited: ${collection.playersVisited}`);
  console.log(`matches fetched: ${collection.matchesFetched}`);
  console.log(`matches processed: ${matchesProcessed}`);
  console.log(`synergy rows generated: ${synergyStats.length}`);
  console.log(`rows uploaded: ${uploaded}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
