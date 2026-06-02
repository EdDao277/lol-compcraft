import { RiotClient } from './riotClient';
import type { RegionalRouting } from './types';

export type CollectMatchIdsOptions = {
  seedPuuids: string[];
  region: RegionalRouting;
  countPerPuuid: number;
  client?: RiotClient;
};

export async function collectMatchIds({ seedPuuids, region, countPerPuuid, client = new RiotClient() }: CollectMatchIdsOptions) {
  const matchIds = new Set<string>();

  for (const puuid of seedPuuids) {
    const ids = await client.getMatchV5<string[]>(region, `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`, {
      start: 0,
      count: countPerPuuid,
    });
    ids.forEach((id) => matchIds.add(id));
  }

  return [...matchIds];
}
