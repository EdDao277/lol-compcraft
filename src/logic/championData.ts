import generatedChampions from '../data/generated/champions.json';
import { getChampionMetadata } from '../data/championDraftMetadata';
import type { Champion } from '../types/champion';

type GeneratedChampion = {
  id: string;
  key: number;
  name: string;
  title: string;
  image: string;
  imageUrl: string;
  riotTags: string[];
};

export const champions: Champion[] = (generatedChampions as GeneratedChampion[]).map((champion) => ({
  ...champion,
  ...getChampionMetadata(champion.id),
}));

export const championById = new Map(champions.map((champion) => [champion.id, champion]));

export function getChampion(championId: string | null | undefined): Champion | undefined {
  if (!championId) return undefined;
  return championById.get(championId);
}

export function findChampionId(query: string): string | undefined {
  const normalized = query.trim().toLowerCase();
  return champions.find((champion) => champion.id.toLowerCase() === normalized || champion.name.toLowerCase() === normalized)?.id;
}
