import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RiotClient } from './riotClient';
import type { MatchDetail, RegionalRouting, SynergySourceType } from './types';

export type FrontierItem = {
  puuid: string;
  depth: number;
  sourceType: SynergySourceType;
  priority: number;
};

export type CrawlMatchNetworkOptions = {
  seedPuuids: Array<{ puuid: string }>;
  region: RegionalRouting;
  queueIds: number[];
  matchesPerPlayer: number;
  maxDepth: number;
  maxPlayers: number;
  maxMatches: number;
  sourceType: Extract<SynergySourceType, 'general-network'>;
  matchIdCacheTtlDays?: number;
  client?: RiotClient;
  collectMatches?: boolean;
  onMatch?: (match: CrawledMatch) => void | Promise<void>;
};

export type CrawledMatch = {
  match: MatchDetail;
  sourceType: SynergySourceType;
};

const cacheRoot = path.resolve('data/cache');
const matchIdCacheDir = path.join(cacheRoot, 'matchIdsByPuuid');
const matchCacheDir = path.join(cacheRoot, 'matches');

export async function crawlMatchNetwork({
  seedPuuids,
  region,
  queueIds,
  matchesPerPlayer,
  maxDepth,
  maxPlayers,
  maxMatches,
  sourceType,
  matchIdCacheTtlDays = 2,
  client = new RiotClient(),
  collectMatches = true,
  onMatch,
}: CrawlMatchNetworkOptions) {
  await mkdir(matchIdCacheDir, { recursive: true });
  await mkdir(matchCacheDir, { recursive: true });

  const visitedPuuids = new Set<string>();
  const queuedPuuids = new Set<string>();
  const fetchedMatchIds = new Set<string>();
  const crawledMatches: CrawledMatch[] = [];
  const playerFrequency = new Map<string, number>();
  let matchesFetchedFromApi = 0;
  let matchesLoadedFromCache = 0;
  let skippedPlayers = 0;
  let skippedMatches = 0;

  const frontier: FrontierItem[] = seedPuuids.map((seed) => ({
    puuid: seed.puuid,
    depth: 0,
    sourceType,
    priority: 1000,
  }));
  frontier.forEach((item) => queuedPuuids.add(item.puuid));

  while (frontier.length > 0 && visitedPuuids.size < maxPlayers && fetchedMatchIds.size < maxMatches) {
    frontier.sort((a, b) => b.priority - a.priority || a.depth - b.depth);
    const current = frontier.shift();
    if (!current || visitedPuuids.has(current.puuid)) continue;

    visitedPuuids.add(current.puuid);
    let matchIds: string[];
    try {
      matchIds = await getCachedMatchIds({
        puuid: current.puuid,
        region,
        queueIds,
        count: matchesPerPlayer,
        ttlDays: matchIdCacheTtlDays,
        client,
      });
    } catch (error) {
      if (current.depth > 0 && isSkippableRiotDataError(error)) {
        skippedPlayers += 1;
        console.warn(`Skipping discovered player with unreadable match history: ${current.puuid}`);
        continue;
      }
      throw error;
    }

    const remaining = Math.max(0, maxMatches - fetchedMatchIds.size);
    const newMatchIds = matchIds.filter((matchId) => !fetchedMatchIds.has(matchId)).slice(0, remaining);

    for (const matchId of newMatchIds) {
      fetchedMatchIds.add(matchId);
      let loaded: { match: MatchDetail; fromCache: boolean };
      try {
        loaded = await getCachedMatch({ matchId, region, client });
      } catch (error) {
        if (isSkippableRiotDataError(error)) {
          skippedMatches += 1;
          console.warn(`Skipping unreadable match: ${matchId}`);
          continue;
        }
        throw error;
      }
      if (loaded.fromCache) matchesLoadedFromCache += 1;
      else matchesFetchedFromApi += 1;

      const crawledMatch = { match: loaded.match, sourceType: current.sourceType };
      if (collectMatches) crawledMatches.push(crawledMatch);
      await onMatch?.(crawledMatch);
      if (fetchedMatchIds.size % 100 === 0) {
        console.log(`network crawl progress: ${fetchedMatchIds.size} match IDs collected, ${visitedPuuids.size} players visited`);
      }

      if (current.depth >= maxDepth) continue;

      for (const participant of loaded.match.info.participants) {
        if (!participant.puuid || visitedPuuids.has(participant.puuid)) continue;
        playerFrequency.set(participant.puuid, (playerFrequency.get(participant.puuid) ?? 0) + 1);
        if (queuedPuuids.has(participant.puuid) || visitedPuuids.size + frontier.length >= maxPlayers) continue;
        queuedPuuids.add(participant.puuid);
        frontier.push({
          puuid: participant.puuid,
          depth: current.depth + 1,
          sourceType,
          priority: getPriority(current.depth + 1, loaded.match.info.queueId, playerFrequency.get(participant.puuid) ?? 1),
        });
      }
    }
  }

  return {
    matches: crawledMatches,
    playersVisited: visitedPuuids.size,
    matchIdsCollected: fetchedMatchIds.size,
    matchesFetchedFromApi,
    matchesLoadedFromCache,
    skippedPlayers,
    skippedMatches,
  };
}

async function getCachedMatchIds(options: {
  puuid: string;
  region: RegionalRouting;
  queueIds: number[];
  count: number;
  ttlDays: number;
  client: RiotClient;
}) {
  const cacheKey = `${options.region}-${options.puuid}-${options.queueIds.join('_')}-${options.count}.json`;
  const cachePath = path.join(matchIdCacheDir, cacheKey);
  if (await isFresh(cachePath, options.ttlDays)) {
    return JSON.parse(await readFile(cachePath, 'utf8')) as string[];
  }

  const matchIds = new Set<string>();
  for (const queue of options.queueIds.length > 0 ? options.queueIds : [undefined]) {
    const ids = await options.client.getMatchV5<string[]>(options.region, `/lol/match/v5/matches/by-puuid/${encodeURIComponent(options.puuid)}/ids`, {
      start: 0,
      count: options.count,
      queue,
    });
    ids.forEach((id) => matchIds.add(id));
  }

  const rows = [...matchIds];
  await writeFile(cachePath, JSON.stringify(rows, null, 2));
  return rows;
}

async function getCachedMatch({ matchId, region, client }: { matchId: string; region: RegionalRouting; client: RiotClient }) {
  const cachePath = path.join(matchCacheDir, `${matchId}.json`);
  try {
    return { match: JSON.parse(await readFile(cachePath, 'utf8')) as MatchDetail, fromCache: true };
  } catch {
    const match = await client.getMatchV5<MatchDetail>(region, `/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
    await writeFile(cachePath, JSON.stringify(match, null, 2));
    return { match, fromCache: false };
  }
}

async function isFresh(filePath: string, ttlDays: number) {
  try {
    const stats = await stat(filePath);
    return Date.now() - stats.mtimeMs < ttlDays * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function getPriority(depth: number, queueId: number, frequency: number) {
  const queueBonus = queueId === 420 || queueId === 440 ? 120 : queueId === 400 ? 60 : 10;
  return 700 - depth * 150 + frequency * 40 + queueBonus;
}

function isSkippableRiotDataError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('400 Bad Request') || message.includes('404 Not Found');
}
