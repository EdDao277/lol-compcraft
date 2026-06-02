import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Champion } from '../src/types/champion';

type RiotChampion = {
  id: string;
  key: string;
  name: string;
  title: string;
  image: { full: string };
  tags: string[];
};

type RiotChampionResponse = {
  data: Record<string, RiotChampion>;
};

const versionsUrl = 'https://ddragon.leagueoflegends.com/api/versions.json';
const outputPath = resolve('src/data/generated/champions.json');

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function main() {
  const versions = await fetchJson<string[]>(versionsUrl);
  const version = versions[0];
  const championUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`;
  const championResponse = await fetchJson<RiotChampionResponse>(championUrl);

  const champions: Champion[] = Object.values(championResponse.data)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((champion) => ({
      id: champion.id,
      key: Number(champion.key),
      name: champion.name,
      title: champion.title,
      image: champion.image.full,
      imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}`,
      riotTags: champion.tags ?? [],
      championId: champion.id,
      roles: [],
      damageType: 'Mixed',
      compTags: [],
      utilityTags: [],
      laneTags: [],
      threatTags: [],
      weaknessTags: [],
      counterTags: [],
      blindPickScore: 5,
      flexValue: 1,
      earlyPickValue: 5,
      latePickValue: 5,
      synergies: [],
      counters: [],
      counteredBy: [],
    }));

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(champions, null, 2)}\n`, 'utf8');
  console.log(`Saved ${champions.length} champions from Data Dragon ${version} to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
