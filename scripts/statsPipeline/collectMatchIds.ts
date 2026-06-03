import { RiotClient } from './riotClient';
import type { RegionalRouting } from './types';

export type CollectMatchIdsOptions = {
  seedPuuids: string[];
  region: RegionalRouting;
  countPerPuuid: number;
  queueIds?: number[];
  client?: RiotClient;
};

export async function collectMatchIds({ seedPuuids, region, countPerPuuid, queueIds = [], client = new RiotClient() }: CollectMatchIdsOptions) {
  const matchIds = new Set<string>();

  for (const puuid of seedPuuids) {
    const queues = queueIds.length > 0 ? queueIds : [undefined];
    for (const queue of queues) {
      const ids = await client.getMatchV5<string[]>(region, `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`, {
        start: 0,
        count: countPerPuuid,
        queue,
      });
      ids.forEach((id) => matchIds.add(id));
    }
  }

  return [...matchIds];
}
