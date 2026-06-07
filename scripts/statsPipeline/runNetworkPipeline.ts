import { aggregateChampionMatchupStats } from './aggregateChampionMatchupStats';
import { aggregateChampionRoleStats } from './aggregateChampionRoleStats';
import { aggregateSynergyStats } from './aggregateSynergyStats';
import { aggregateTeamCompSignatureStats } from './aggregateTeamCompSignatureStats';
import { crawlMatchNetwork } from './crawlMatchNetwork';
import { loadPipelineEnv } from './env';
import { getNetworkPipelineConfig } from './pipelineConfigs';
import { processMatches } from './processMatches';
import { resolveLadderSeedPuuids } from './resolveLadderSeedPuuids';
import { uploadNetworkStatsToSupabase } from './uploadNetworkStatsToSupabase';
import type { ProcessedTeam } from './types';

loadPipelineEnv();

async function main() {
  const config = getNetworkPipelineConfig();
  const seedPuuids = await resolveLadderSeedPuuids({
    platformRegion: config.platformRegion,
    sources: config.ladderSeedSources,
  });
  const processedTeams: ProcessedTeam[] = [];
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
    onMatch: ({ match, sourceType }) => {
      processedTeams.push(...processMatches([match], { region: config.routingRegion, sourceType }));
    },
  });

  const roleStats = aggregateChampionRoleStats(processedTeams);
  const synergyStats = aggregateSynergyStats({ teams: processedTeams });
  const matchupStats = aggregateChampionMatchupStats(processedTeams, roleStats);
  const teamCompSignatureStats = aggregateTeamCompSignatureStats(processedTeams);
  const uploaded = await uploadNetworkStatsToSupabase({ roleStats, synergyStats, matchupStats, teamCompSignatureStats });

  console.log(`source type: ${config.sourceType}`);
  console.log(`ladder seed accounts resolved: ${seedPuuids.length}`);
  console.log(`ladder seed sources: ${config.ladderSeedSources.length}`);
  console.log(`players visited: ${crawl.playersVisited}`);
  console.log(`match IDs collected: ${crawl.matchIdsCollected}`);
  console.log(`matches fetched from API: ${crawl.matchesFetchedFromApi}`);
  console.log(`matches loaded from cache: ${crawl.matchesLoadedFromCache}`);
  console.log(`players skipped: ${crawl.skippedPlayers}`);
  console.log(`matches skipped: ${crawl.skippedMatches}`);
  console.log(`matches processed: ${processedTeams.length}`);
  console.log(`champion role rows generated: ${roleStats.length}`);
  console.log(`synergy rows generated: ${synergyStats.length}`);
  console.log(`matchup rows generated: ${matchupStats.length}`);
  console.log(`team comp signature rows generated: ${teamCompSignatureStats.length}`);
  console.log(`rows uploaded to Supabase: ${uploaded.totalRows}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
