import { collectMatchIds } from './collectMatchIds';
import { fetchMatches } from './fetchMatches';
import { RiotClient } from './riotClient';
import type { MatchDetail, SynergySourceType } from './types';

type SeedPuuid = {
  puuid: string;
  source: Extract<SynergySourceType, 'personal' | 'friend'>;
};

export type CollectPersonalMatchesOptions = {
  seedPuuids: SeedPuuid[];
  region: 'americas' | 'asia' | 'europe' | 'sea';
  queueIds: number[];
  matchesPerPlayer: number;
  maxDepth: number;
  maxPlayers: number;
  maxMatches: number;
  client?: RiotClient;
};

export async function collectPersonalMatches({
  seedPuuids,
  region,
  queueIds,
  matchesPerPlayer,
  maxDepth,
  maxPlayers,
  maxMatches,
  client = new RiotClient(),
}: CollectPersonalMatchesOptions) {
  const seenPlayers = new Set<string>();
  const seenMatches = new Set<string>();
  const matchesBySource = new Map<SynergySourceType, MatchDetail[]>();
  const frontier = seedPuuids.map((seed) => ({ ...seed, depth: 0 }));

  while (frontier.length > 0 && seenPlayers.size < maxPlayers && seenMatches.size < maxMatches) {
    const current = frontier.shift();
    if (!current || seenPlayers.has(current.puuid)) continue;
    seenPlayers.add(current.puuid);

    const source: SynergySourceType = current.depth === 0 ? current.source : 'recursive-network';
    const matchIds = await collectMatchIds({
      seedPuuids: [current.puuid],
      region,
      countPerPuuid: matchesPerPlayer,
      queueIds,
      client,
    });

    const newMatchIds = matchIds.filter((matchId) => !seenMatches.has(matchId)).slice(0, Math.max(0, maxMatches - seenMatches.size));
    newMatchIds.forEach((matchId) => seenMatches.add(matchId));
    const matches = await fetchMatches({ matchIds: newMatchIds, region, client });
    matchesBySource.set(source, [...(matchesBySource.get(source) ?? []), ...matches]);

    if (current.depth >= maxDepth) continue;

    const participantPuuids = matches.flatMap((match) => match.info.participants.map((participant) => participant.puuid)).filter((puuid) => puuid && !seenPlayers.has(puuid));
    for (const puuid of participantPuuids) {
      if (seenPlayers.size + frontier.length >= maxPlayers) break;
      frontier.push({ puuid, source: 'friend', depth: current.depth + 1 });
    }
  }

  return {
    matchesBySource,
    playersVisited: seenPlayers.size,
    matchesFetched: seenMatches.size,
  };
}
