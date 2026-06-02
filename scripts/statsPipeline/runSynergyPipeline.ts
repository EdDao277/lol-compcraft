import { aggregateSynergyStats } from './aggregateSynergyStats';
import { collectMatchIds } from './collectMatchIds';
import { loadPipelineEnv } from './env';
import { fetchMatches } from './fetchMatches';
import { processMatches } from './processMatches';
import { resolveSeedPuuids } from './resolveSeedPuuids';
import { uploadSynergyStatsToSupabase } from './uploadSynergyStatsToSupabase';
import type { RegionalRouting } from './types';

loadPipelineEnv();

const seedRiotIds = [
  '我依然是世一上#我不骗人',
  'Yaho#e12',
  'Dhokla#NA1',
  'MunchyPunchyLOL#TTV1',
  'ScrubNoob#Red',
  'Kenvi#000',
  'snarkyy#krule',
  'young#0000',
  'mrbleetoe#ryann',
  'EDG Viper#NA11',
  'Infernodan#Dan',
  'xa thu pho nui#zzz',
  'duoking1#freex',
  'Afflictive#藍月なくる',
  'Zenden#zzz',
];

const region = (process.env.RIOT_ROUTING_REGION ?? 'americas') as RegionalRouting;
const countPerPuuid = Number(process.env.RIOT_MATCH_COUNT_PER_PUUID ?? 20);
const patch = process.env.RIOT_STATS_PATCH ?? 'unknown';
const queue = process.env.RIOT_STATS_QUEUE ?? 'ranked';
const tier = process.env.RIOT_STATS_TIER ?? null;

async function main() {
  const seedPuuids = await resolveSeedPuuids(seedRiotIds, region);

  const matchIds = await collectMatchIds({ seedPuuids, region, countPerPuuid });
  const matches = await fetchMatches({ matchIds, region });
  const processedTeams = processMatches(matches);
  const synergyStats = aggregateSynergyStats({
    teams: processedTeams,
    patch,
    region,
    queue,
    tier,
  });
  const uploaded = await uploadSynergyStatsToSupabase(synergyStats);

  console.log(`matches fetched: ${matches.length}`);
  console.log(`matches processed: ${processedTeams.length}`);
  console.log(`seed accounts resolved: ${seedPuuids.length}`);
  console.log(`synergy rows generated: ${synergyStats.length}`);
  console.log(`rows uploaded: ${uploaded}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
