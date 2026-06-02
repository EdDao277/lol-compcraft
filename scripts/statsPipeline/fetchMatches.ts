import { mkdir, writeFile } from 'node:fs/promises';
import { RiotClient } from './riotClient';
import type { MatchDetail, RegionalRouting } from './types';

export type FetchMatchesOptions = {
  matchIds: string[];
  region: RegionalRouting;
  client?: RiotClient;
  outputDir?: string;
};

export async function fetchMatches({ matchIds, region, client = new RiotClient(), outputDir }: FetchMatchesOptions) {
  const matches: MatchDetail[] = [];
  if (outputDir) await mkdir(outputDir, { recursive: true });

  for (const matchId of matchIds) {
    const match = await client.getMatchV5<MatchDetail>(region, `/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
    matches.push(match);
    if (outputDir) {
      await writeFile(`${outputDir}/${matchId}.json`, JSON.stringify(match, null, 2));
    }
  }

  return matches;
}
