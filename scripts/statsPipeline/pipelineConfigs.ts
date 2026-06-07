import type { PlatformRegion, RegionalRouting, SynergySourceType } from './types';

export type LadderQueue = 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
export type RankedTier = 'DIAMOND' | 'EMERALD' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'IRON';
export type RankedDivision = 'I' | 'II' | 'III' | 'IV';
export type HighEloTier = 'CHALLENGER' | 'GRANDMASTER' | 'MASTER';

export type LadderSeedSource =
  | {
      kind: 'ranked';
      queue: LadderQueue;
      tier: RankedTier;
      division: RankedDivision;
      pages: number;
      maxPlayers: number;
    }
  | {
      kind: 'high-elo';
      queue: LadderQueue;
      tier: HighEloTier;
      maxPlayers: number;
    };

export type NetworkPipelineConfig = {
  sourceType: Extract<SynergySourceType, 'general-network'>;
  ladderSeedSources: LadderSeedSource[];
  routingRegion: RegionalRouting;
  platformRegion: PlatformRegion;
  queueIds: number[];
  matchesPerPlayer: number;
  maxDepth: number;
  maxPlayers: number;
  maxMatches: number;
  matchIdCacheTtlDays: number;
};

export const generalNetworkConfig: NetworkPipelineConfig = {
  sourceType: 'general-network',
  ladderSeedSources: buildDefaultLadderSeedSources(),
  routingRegion: 'americas',
  platformRegion: 'na1',
  queueIds: [400, 420, 440],
  matchesPerPlayer: 80,
  maxDepth: 2,
  maxPlayers: 1500,
  maxMatches: 75000,
  matchIdCacheTtlDays: 2,
};

export function getNetworkPipelineConfig() {
  return {
    ...generalNetworkConfig,
    platformRegion: parsePlatformRegionFromEnv('RIOT_PLATFORM_REGION', generalNetworkConfig.platformRegion),
    routingRegion: parseRegionalRoutingFromEnv('RIOT_ROUTING_REGION', generalNetworkConfig.routingRegion),
    ladderSeedSources: buildLadderSeedSourcesFromEnv(),
    queueIds: parseNumberListFromEnv('RIOT_NETWORK_QUEUE_IDS', generalNetworkConfig.queueIds),
    matchesPerPlayer: parseNumberFromEnv('RIOT_NETWORK_MATCHES_PER_PLAYER', generalNetworkConfig.matchesPerPlayer),
    maxDepth: parseNumberFromEnv('RIOT_NETWORK_MAX_DEPTH', generalNetworkConfig.maxDepth),
    maxPlayers: parseNumberFromEnv('RIOT_NETWORK_MAX_PLAYERS', generalNetworkConfig.maxPlayers),
    maxMatches: parseNumberFromEnv('RIOT_NETWORK_MAX_MATCHES', generalNetworkConfig.maxMatches),
    matchIdCacheTtlDays: parseNumberFromEnv('RIOT_NETWORK_CACHE_TTL_DAYS', generalNetworkConfig.matchIdCacheTtlDays),
  };
}

function buildDefaultLadderSeedSources(): LadderSeedSource[] {
  const queues: LadderQueue[] = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR'].map(normalizeLadderQueue);
  const mixedTiers: RankedTier[] = ['DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD'];
  const mixedDivisions: RankedDivision[] = ['I', 'II'];
  const highEloTiers: HighEloTier[] = ['CHALLENGER', 'GRANDMASTER', 'MASTER'];
  const sources: LadderSeedSource[] = [];

  for (const queue of queues) {
    for (const tier of highEloTiers) {
      sources.push({ kind: 'high-elo', queue, tier, maxPlayers: 75 });
    }

    for (const tier of mixedTiers) {
      for (const division of mixedDivisions) {
        sources.push({ kind: 'ranked', queue, tier, division, pages: 2, maxPlayers: 50 });
      }
    }
  }

  return sources;
}

function buildLadderSeedSourcesFromEnv(): LadderSeedSource[] {
  const queues = parseListFromEnv('RIOT_LADDER_QUEUES', ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR']).map(normalizeLadderQueue);
  const mixedTiers = parseListFromEnv('RIOT_LADDER_MIXED_TIERS', ['DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD']).map(normalizeRankedTier);
  const mixedDivisions = parseListFromEnv('RIOT_LADDER_MIXED_DIVISIONS', ['I', 'II']).map(normalizeRankedDivision);
  const highEloTiers = parseListFromEnv('RIOT_LADDER_HIGH_ELO_TIERS', ['CHALLENGER', 'GRANDMASTER', 'MASTER']).map(normalizeHighEloTier);
  const rankedPages = parseNumberFromEnv('RIOT_LADDER_RANKED_PAGES', 2);
  const rankedPlayersPerSource = parseNumberFromEnv('RIOT_LADDER_RANKED_PLAYERS_PER_SOURCE', 50);
  const highEloPlayersPerSource = parseNumberFromEnv('RIOT_LADDER_HIGH_ELO_PLAYERS_PER_SOURCE', 75);
  const includeHighElo = parseBooleanFromEnv('RIOT_LADDER_INCLUDE_HIGH_ELO', true);
  const includeMixedRanked = parseBooleanFromEnv('RIOT_LADDER_INCLUDE_MIXED_RANKED', true);
  const sources: LadderSeedSource[] = [];

  for (const queue of queues) {
    if (includeHighElo) {
      for (const tier of highEloTiers) {
        sources.push({ kind: 'high-elo', queue, tier, maxPlayers: highEloPlayersPerSource });
      }
    }

    if (includeMixedRanked) {
      for (const tier of mixedTiers) {
        for (const division of mixedDivisions) {
          sources.push({ kind: 'ranked', queue, tier, division, pages: rankedPages, maxPlayers: rankedPlayersPerSource });
        }
      }
    }
  }

  if (sources.length === 0) throw new Error('No Riot ladder seed sources configured. Enable high-elo or mixed ranked ladder seeds.');
  return sources;
}

function parseNumberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${name}: expected a non-negative number.`);
  return parsed;
}

function parseNumberListFromEnv(name: string, fallback: number[]) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  if (parsed.length === 0) throw new Error(`Invalid ${name}: expected comma-separated queue IDs.`);
  return parsed;
}

function parseListFromEnv(name: string, fallback: string[]) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (parsed.length === 0) throw new Error(`Invalid ${name}: expected a comma-separated list.`);
  return parsed;
}

function parseBooleanFromEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(raw.trim().toLowerCase());
}

function parsePlatformRegionFromEnv(name: string, fallback: PlatformRegion) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw as PlatformRegion;
}

function parseRegionalRoutingFromEnv(name: string, fallback: RegionalRouting) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw as RegionalRouting;
}

function normalizeLadderQueue(value: string): LadderQueue {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'RANKED_SOLO_5X5') return 'RANKED_SOLO_5x5';
  if (normalized === 'RANKED_SOLO_5V5') return 'RANKED_SOLO_5x5';
  if (normalized === 'RANKED_FLEX_SR') return 'RANKED_FLEX_SR';
  throw new Error(`Invalid ladder queue "${value}". Expected RANKED_SOLO_5x5 or RANKED_FLEX_SR.`);
}

function normalizeRankedTier(value: string): RankedTier {
  const normalized = value.trim().toUpperCase();
  if (['DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON'].includes(normalized)) return normalized as RankedTier;
  throw new Error(`Invalid ranked tier "${value}".`);
}

function normalizeRankedDivision(value: string): RankedDivision {
  const normalized = value.trim().toUpperCase();
  if (['I', 'II', 'III', 'IV'].includes(normalized)) return normalized as RankedDivision;
  throw new Error(`Invalid ranked division "${value}".`);
}

function normalizeHighEloTier(value: string): HighEloTier {
  const normalized = value.trim().toUpperCase();
  if (['CHALLENGER', 'GRANDMASTER', 'MASTER'].includes(normalized)) return normalized as HighEloTier;
  throw new Error(`Invalid high-elo tier "${value}".`);
}
