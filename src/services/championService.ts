import type { Champion } from '../types/champion';
import type { ChampionMetadataRow, ChampionRow } from '../types/database';
import { getSupabaseOrWarn, warnSupabaseError } from './serviceUtils';

export async function getChampions(): Promise<ChampionRow[]> {
  const supabase = getSupabaseOrWarn('championService.getChampions');
  if (!supabase) return [];
  const { data, error } = await supabase.from('champions').select('*').order('name', { ascending: true });
  if (error) {
    warnSupabaseError('championService.getChampions', error);
    return [];
  }
  return data ?? [];
}

export async function upsertChampions(champions: Champion[]): Promise<ChampionRow[]> {
  const supabase = getSupabaseOrWarn('championService.upsertChampions');
  if (!supabase) return [];
  const rows = champions.map((champion) => ({
    id: champion.id,
    riot_key: champion.key,
    name: champion.name,
    title: champion.title,
    image_url: champion.imageUrl,
    riot_tags: champion.riotTags,
  }));
  const { data, error } = await supabase.from('champions').upsert(rows, { onConflict: 'id' }).select('*');
  if (error) {
    warnSupabaseError('championService.upsertChampions', error);
    return [];
  }
  return data ?? [];
}

export async function getChampionMetadata(): Promise<ChampionMetadataRow[]> {
  const supabase = getSupabaseOrWarn('championService.getChampionMetadata');
  if (!supabase) return [];
  const { data, error } = await supabase.from('champion_metadata').select('*');
  if (error) {
    warnSupabaseError('championService.getChampionMetadata', error);
    return [];
  }
  return data ?? [];
}

export async function upsertChampionMetadata(metadata: ChampionMetadataRow[]): Promise<ChampionMetadataRow[]> {
  const supabase = getSupabaseOrWarn('championService.upsertChampionMetadata');
  if (!supabase) return [];
  const { data, error } = await supabase.from('champion_metadata').upsert(metadata, { onConflict: 'champion_id' }).select('*');
  if (error) {
    warnSupabaseError('championService.upsertChampionMetadata', error);
    return [];
  }
  return data ?? [];
}
