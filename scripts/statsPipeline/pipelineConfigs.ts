import type { PlatformRegion, RegionalRouting, SynergySourceType } from './types';

export type SeedRiotIdConfig = {
  gameName: string;
  tagLine: string;
  source: Extract<SynergySourceType, 'personal' | 'friend'>;
};

export type NetworkPipelineConfig = {
  sourceType: Extract<SynergySourceType, 'personal-network' | 'general-network'>;
  seedRiotIds: SeedRiotIdConfig[];
  routingRegion: RegionalRouting;
  platformRegion: PlatformRegion;
  queueIds: number[];
  matchesPerPlayer: number;
  maxDepth: number;
  maxPlayers: number;
  maxMatches: number;
  matchIdCacheTtlDays: number;
};

export const personalNetworkConfig: NetworkPipelineConfig = {
  sourceType: 'personal-network',
  seedRiotIds: [],
  routingRegion: 'americas',
  platformRegion: 'na1',
  queueIds: [400, 420, 440],
  matchesPerPlayer: 40,
  maxDepth: 1,
  maxPlayers: 150,
  maxMatches: 5000,
  matchIdCacheTtlDays: 2,
};

export const generalNetworkConfig: NetworkPipelineConfig = {
  sourceType: 'general-network',
  seedRiotIds: [],
  routingRegion: 'americas',
  platformRegion: 'na1',
  queueIds: [420, 440],
  matchesPerPlayer: 40,
  maxDepth: 1,
  maxPlayers: 150,
  maxMatches: 5000,
  matchIdCacheTtlDays: 2,
};

export function getNetworkPipelineConfig(name: string | undefined) {
  const seedRiotIds = getSeedRiotIds();
  if (name === 'general') return { ...generalNetworkConfig, seedRiotIds };
  return { ...personalNetworkConfig, seedRiotIds };
}

export function getLegacySynergyPipelineConfig() {
  return {
    seedRiotIds: getSeedRiotIds(),
    routingRegion: 'americas' as RegionalRouting,
    platformRegion: 'na1' as PlatformRegion,
    queueIds: [400, 420, 440],
    matchesPerPlayer: 20,
    maxDepth: 1,
    maxPlayers: 50,
    maxMatches: 1000,
  };
}

function getSeedRiotIds() {
  const seeds = parseSeedRiotIdsFromEnv();
  if (seeds.length === 0) {
    throw new Error('Missing RIOT_SEED_IDS in .env.pipeline. Example: RIOT_SEED_IDS=YourName#TAG:personal,FriendName#TAG:friend');
  }
  return seeds;
}

function parseSeedRiotIdsFromEnv(): SeedRiotIdConfig[] {
  const raw = process.env.RIOT_SEED_IDS ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [riotId, sourceValue] = entry.split(':').map((part) => part.trim());
      const hashIndex = riotId.lastIndexOf('#');
      if (hashIndex === -1) throw new Error(`Invalid RIOT_SEED_IDS entry "${entry}". Expected GameName#TagLine:friend.`);
      const source = sourceValue === 'personal' ? 'personal' : 'friend';
      return {
        gameName: riotId.slice(0, hashIndex).trim(),
        tagLine: riotId.slice(hashIndex + 1).trim(),
        source,
      };
    });
}
