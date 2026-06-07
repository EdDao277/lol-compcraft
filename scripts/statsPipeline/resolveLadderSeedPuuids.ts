import type { HighEloTier, LadderSeedSource } from './pipelineConfigs';
import { RiotClient } from './riotClient';
import type { PlatformRegion } from './types';

type LeagueEntry = {
  puuid?: string;
  summonerId?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
};

type LeagueList = {
  entries: LeagueEntry[];
};

type Summoner = {
  puuid: string;
};

export type ResolvedLadderSeedPuuid = {
  puuid: string;
  source: 'ladder';
};

export async function resolveLadderSeedPuuids({
  platformRegion,
  sources,
  client = new RiotClient(),
}: {
  platformRegion: PlatformRegion;
  sources: LadderSeedSource[];
  client?: RiotClient;
}) {
  const byPuuid = new Map<string, ResolvedLadderSeedPuuid>();
  const bySummonerId = new Set<string>();

  for (const source of sources) {
    const entries = source.kind === 'high-elo' ? await getHighEloEntries(client, platformRegion, source) : await getRankedEntries(client, platformRegion, source);

    for (const entry of entries) {
      if (entry.puuid) {
        byPuuid.set(entry.puuid, { puuid: entry.puuid, source: 'ladder' });
        continue;
      }

      if (!entry.summonerId || bySummonerId.has(entry.summonerId)) continue;
      bySummonerId.add(entry.summonerId);

      const summoner = await client.getSummonerV4<Summoner>(platformRegion, `/lol/summoner/v4/summoners/${encodeURIComponent(entry.summonerId)}`);
      byPuuid.set(summoner.puuid, { puuid: summoner.puuid, source: 'ladder' });
    }
  }

  return [...byPuuid.values()];
}

async function getHighEloEntries(client: RiotClient, platformRegion: PlatformRegion, source: Extract<LadderSeedSource, { kind: 'high-elo' }>) {
  const league = await client.getLeagueV4<LeagueList>(platformRegion, getHighEloPath(source.tier, source.queue));
  return sortEntries(league.entries).slice(0, source.maxPlayers);
}

async function getRankedEntries(client: RiotClient, platformRegion: PlatformRegion, source: Extract<LadderSeedSource, { kind: 'ranked' }>) {
  const entries: LeagueEntry[] = [];
  for (let page = 1; page <= source.pages; page += 1) {
    const pageEntries = await client.getLeagueV4<LeagueEntry[]>(
      platformRegion,
      `/lol/league/v4/entries/${source.queue}/${source.tier}/${source.division}`,
      { page },
    );
    entries.push(...pageEntries);
    if (entries.length >= source.maxPlayers) break;
  }

  return sortEntries(entries).slice(0, source.maxPlayers);
}

function getHighEloPath(tier: HighEloTier, queue: string) {
  if (tier === 'CHALLENGER') return `/lol/league/v4/challengerleagues/by-queue/${queue}`;
  if (tier === 'GRANDMASTER') return `/lol/league/v4/grandmasterleagues/by-queue/${queue}`;
  return `/lol/league/v4/masterleagues/by-queue/${queue}`;
}

function sortEntries(entries: LeagueEntry[]) {
  return [...entries].sort((a, b) => getEntryStrength(b) - getEntryStrength(a));
}

function getEntryStrength(entry: LeagueEntry) {
  const games = (entry.wins ?? 0) + (entry.losses ?? 0);
  return (entry.leaguePoints ?? 0) * 1000 + games;
}
