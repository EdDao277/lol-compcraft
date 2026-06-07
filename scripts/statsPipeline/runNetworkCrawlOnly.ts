import { crawlMatchNetwork } from './crawlMatchNetwork';
import { loadPipelineEnv } from './env';
import { getNetworkPipelineConfig } from './pipelineConfigs';
import { resolveLadderSeedPuuids } from './resolveLadderSeedPuuids';

loadPipelineEnv();

async function main() {
  const config = getNetworkPipelineConfig();
  const seedPuuids = await resolveLadderSeedPuuids({
    platformRegion: config.platformRegion,
    sources: config.ladderSeedSources,
  });

  const crawl = await crawlMatchNetwork({
    seedPuuids,
    region: config.routingRegion,
    queueIds: config.queueIds,
    matchesPerPlayer: config.matchesPerPlayer,
    maxDepth: config.maxDepth,
    maxPlayers: config.maxPlayers,
    maxMatches: config.maxMatches,
    sourceType: config.sourceType,
    matchIdCacheTtlDays: config.matchIdCacheTtlDays,
    collectMatches: false,
  });

  console.log(`source type: ${config.sourceType}`);
  console.log(`ladder seed accounts resolved: ${seedPuuids.length}`);
  console.log(`ladder seed sources: ${config.ladderSeedSources.length}`);
  console.log(`players visited: ${crawl.playersVisited}`);
  console.log(`match IDs collected: ${crawl.matchIdsCollected}`);
  console.log(`matches fetched from API: ${crawl.matchesFetchedFromApi}`);
  console.log(`matches loaded from cache: ${crawl.matchesLoadedFromCache}`);
  console.log(`players skipped: ${crawl.skippedPlayers}`);
  console.log(`matches skipped: ${crawl.skippedMatches}`);
  console.log('crawl complete; run npm run stats:upload to aggregate cached matches and upload Supabase stats');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
