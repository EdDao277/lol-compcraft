import { createClient } from '@supabase/supabase-js';
import generatedChampions from '../src/data/generated/champions.json';
import { getChampionMetadata } from '../src/data/championDraftMetadata';
import type { ChampionMetadata } from '../src/types/champion';
import { loadPipelineEnv, requirePipelineEnv } from './statsPipeline/env';

loadPipelineEnv();

type SynergyRow = {
  champion_id: string;
  ally_champion_id: string;
  games: number;
  delta_vs_average: number | null;
  confidence: number | null;
};

type MatchupRow = {
  champion_id: string;
  enemy_champion_id: string;
  games: number;
  delta_vs_baseline: number | null;
  confidence: number | null;
  matchup_type: string;
};

type SupabaseClientLike = {
  from: (table: string) => SupabaseTableLike;
};

type SupabaseTableLike = {
  select: (columns: string) => SupabaseSelectLike;
  upsert: (rows: unknown[], options?: { onConflict?: string }) => PromiseLike<{ error: unknown }>;
};

type SupabaseSelectLike = {
  gte: (column: string, value: number) => SupabaseSelectLike;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseSelectLike;
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

const pageSize = 1000;
const minSynergyGames = readNumber('METADATA_STATS_MIN_SYNERGY_GAMES', 5);
const minCounterGames = readNumber('METADATA_STATS_MIN_COUNTER_GAMES', 5);
const minPositiveDelta = readNumber('METADATA_STATS_MIN_POSITIVE_DELTA', 0.01);
const maxSynergiesPerChampion = readNumber('METADATA_STATS_MAX_SYNERGIES', 8);
const maxCountersPerChampion = readNumber('METADATA_STATS_MAX_COUNTERS', 8);

async function main() {
  const supabase = createClient(requirePipelineEnv('SUPABASE_URL'), requirePipelineEnv('SUPABASE_SERVICE_ROLE_KEY'));
  await upsertLocalChampions(supabase);

  const [synergyRows, matchupRows] = await Promise.all([fetchSynergyRows(supabase), fetchMatchupRows(supabase)]);
  const inferredSynergies = inferSynergies(synergyRows);
  const inferredCounters = inferCounters(matchupRows);
  const metadataRows = generatedChampions.map((champion) => {
    const metadata = getChampionMetadata(champion.id);
    const synergies = mergeRanked(metadata.synergies, inferredSynergies.get(champion.id), maxSynergiesPerChampion);
    const counters = mergeRanked(metadata.counters, inferredCounters.counters.get(champion.id), maxCountersPerChampion);
    const counteredBy = mergeRanked(metadata.counteredBy, inferredCounters.counteredBy.get(champion.id), maxCountersPerChampion);
    return toMetadataRow({ ...metadata, synergies, counters, counteredBy });
  });

  const { error } = await supabase.from('champion_metadata').upsert(metadataRows, { onConflict: 'champion_id' });
  if (error) throw error;

  console.log(`synergy stat rows considered: ${synergyRows.length}`);
  console.log(`matchup stat rows considered: ${matchupRows.length}`);
  console.log(`champions with inferred synergies: ${inferredSynergies.size}`);
  console.log(`champions with inferred counters: ${inferredCounters.counters.size}`);
  console.log(`champions with inferred countered_by: ${inferredCounters.counteredBy.size}`);
  console.log(`champion metadata rows upserted: ${metadataRows.length}`);
}

async function fetchSynergyRows(supabase: SupabaseClientLike) {
  const rows: SynergyRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('champion_synergy_stats')
      .select('champion_id,ally_champion_id,games,delta_vs_average,confidence')
      .gte('games', minSynergyGames)
      .gte('delta_vs_average', minPositiveDelta)
      .order('games', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as SynergyRow[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchMatchupRows(supabase: SupabaseClientLike) {
  const rows: MatchupRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('champion_matchup_stats')
      .select('champion_id,enemy_champion_id,games,delta_vs_baseline,confidence,matchup_type')
      .gte('games', minCounterGames)
      .gte('delta_vs_baseline', minPositiveDelta)
      .order('games', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as MatchupRow[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function inferSynergies(rows: SynergyRow[]) {
  const grouped = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.champion_id || !row.ally_champion_id || row.champion_id === row.ally_champion_id) continue;
    addRanked(grouped, row.champion_id, row.ally_champion_id, statScore(row.games, row.delta_vs_average, row.confidence));
  }
  return finalizeRanked(grouped, maxSynergiesPerChampion);
}

function inferCounters(rows: MatchupRow[]) {
  const counters = new Map<string, Map<string, number>>();
  const counteredBy = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.champion_id || !row.enemy_champion_id || row.champion_id === row.enemy_champion_id) continue;
    const sameRoleBonus = row.matchup_type === 'same-role' ? 0.25 : 0;
    const score = statScore(row.games, row.delta_vs_baseline, row.confidence) + sameRoleBonus;
    addRanked(counters, row.champion_id, row.enemy_champion_id, score);
    addRanked(counteredBy, row.enemy_champion_id, row.champion_id, score);
  }
  return {
    counters: finalizeRanked(counters, maxCountersPerChampion),
    counteredBy: finalizeRanked(counteredBy, maxCountersPerChampion),
  };
}

function addRanked(grouped: Map<string, Map<string, number>>, championId: string, relatedChampionId: string, score: number) {
  const championMap = grouped.get(championId) ?? new Map<string, number>();
  championMap.set(relatedChampionId, Math.max(championMap.get(relatedChampionId) ?? 0, score));
  grouped.set(championId, championMap);
}

function finalizeRanked(grouped: Map<string, Map<string, number>>, limit: number) {
  return new Map(
    [...grouped.entries()].map(([championId, scores]) => [
      championId,
      [...scores.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit)
        .map(([relatedChampionId]) => relatedChampionId),
    ]),
  );
}

function mergeRanked(existing: string[], inferred: string[] | undefined, limit: number) {
  return [...new Set([...(existing ?? []), ...(inferred ?? [])])].slice(0, limit);
}

function statScore(games: number, delta: number | null, confidence: number | null) {
  return Math.log1p(games) * 0.15 + (delta ?? 0) * 100 + (confidence ?? 0) * 0.5;
}

async function upsertLocalChampions(supabase: SupabaseClientLike) {
  const rows = generatedChampions.map((champion) => ({
    id: champion.id,
    riot_key: champion.key,
    name: champion.name,
    title: champion.title,
    image_url: champion.imageUrl,
    riot_tags: champion.riotTags,
  }));
  const { error } = await supabase.from('champions').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

function toMetadataRow(metadata: ChampionMetadata) {
  return {
    champion_id: metadata.championId,
    roles: metadata.roles,
    damage_type: metadata.damageType,
    comp_tags: metadata.compTags,
    utility_tags: metadata.utilityTags,
    lane_tags: metadata.laneTags,
    threat_tags: metadata.threatTags,
    weakness_tags: metadata.weaknessTags,
    counter_tags: metadata.counterTags,
    blind_pick_score: metadata.blindPickScore,
    flex_value: metadata.flexValue,
    early_pick_value: metadata.earlyPickValue,
    late_pick_value: metadata.latePickValue,
    synergies: metadata.synergies,
    counters: metadata.counters,
    countered_by: metadata.counteredBy,
    notes: metadata.notes ?? null,
  };
}

function readNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${name}: expected a non-negative number.`);
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
