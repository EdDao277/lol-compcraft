import { RiotClient } from './riotClient';
import type { RegionalRouting, RiotAccount } from './types';

export type SeedRiotId = {
  gameName: string;
  tagLine: string;
};

export function parseRiotId(value: string): SeedRiotId {
  const hashIndex = value.lastIndexOf('#');
  if (hashIndex === -1) throw new Error(`Invalid Riot ID "${value}". Expected GameName#TagLine.`);

  const gameName = value.slice(0, hashIndex).trim();
  const tagLine = value.slice(hashIndex + 1).trim();
  if (!gameName || !tagLine) throw new Error(`Invalid Riot ID "${value}". Expected GameName#TagLine.`);

  return { gameName, tagLine };
}

export async function resolveSeedPuuids(seedRiotIds: string[], region: RegionalRouting, client = new RiotClient()) {
  const puuids = new Set<string>();

  for (const seedRiotId of seedRiotIds) {
    const { gameName, tagLine } = parseRiotId(seedRiotId);
    const account = await client.getAccountV1<RiotAccount>(
      region,
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    );
    puuids.add(account.puuid);
  }

  return [...puuids];
}
