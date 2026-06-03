import { RiotClient } from './riotClient';
import type { RegionalRouting, RiotAccount, SynergySourceType } from './types';

export type SeedRiotId = {
  gameName: string;
  tagLine: string;
  source?: Extract<SynergySourceType, 'personal' | 'friend'>;
};

export function parseRiotId(value: string): SeedRiotId {
  const hashIndex = value.lastIndexOf('#');
  if (hashIndex === -1) throw new Error(`Invalid Riot ID "${value}". Expected GameName#TagLine.`);

  const gameName = value.slice(0, hashIndex).trim();
  const tagLine = value.slice(hashIndex + 1).trim();
  if (!gameName || !tagLine) throw new Error(`Invalid Riot ID "${value}". Expected GameName#TagLine.`);

  return { gameName, tagLine };
}

export type ResolvedSeedPuuid = {
  puuid: string;
  gameName: string;
  tagLine: string;
  source: Extract<SynergySourceType, 'personal' | 'friend'>;
};

export async function resolveSeedPuuids(seedRiotIds: Array<string | SeedRiotId>, region: RegionalRouting, client = new RiotClient()) {
  const byPuuid = new Map<string, ResolvedSeedPuuid>();

  for (const seedRiotId of seedRiotIds) {
    const seed = typeof seedRiotId === 'string' ? parseRiotId(seedRiotId) : seedRiotId;
    const { gameName, tagLine } = seed;
    const account = await client.getAccountV1<RiotAccount>(
      region,
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    );
    byPuuid.set(account.puuid, {
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      source: seed.source ?? 'friend',
    });
  }

  return [...byPuuid.values()];
}
