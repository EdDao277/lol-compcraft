import { roundStat, sampleConfidence } from './sampleConfidence';
import type { ChampionRoleStat, ProcessedTeam } from './types';

type Counter = { games: number; wins: number };

function key(parts: Array<string | number>) {
  return parts.join('::');
}

export function aggregateChampionRoleStats(teams: ProcessedTeam[]): ChampionRoleStat[] {
  const counters = new Map<string, Counter>();

  for (const team of teams) {
    for (const participant of team.participants) {
      const rowKey = key([team.patch, team.region, team.queueId, team.sourceType, participant.championId, participant.role]);
      const counter = counters.get(rowKey) ?? { games: 0, wins: 0 };
      counter.games += 1;
      counter.wins += team.win ? 1 : 0;
      counters.set(rowKey, counter);
    }
  }

  return [...counters.entries()].map(([rowKey, counter]) => {
    const [patch, region, queueId, sourceType, championId, role] = rowKey.split('::') as [string, string, string, ChampionRoleStat['source_type'], string, ChampionRoleStat['role']];
    return {
      patch,
      region,
      queue_id: Number(queueId),
      source_type: sourceType,
      champion_id: championId,
      role,
      games: counter.games,
      wins: counter.wins,
      win_rate: roundStat(counter.wins / counter.games),
      confidence: sampleConfidence(counter.games),
    };
  });
}

export function buildChampionRoleBaselineMap(roleStats: ChampionRoleStat[]) {
  const map = new Map<string, ChampionRoleStat>();
  for (const row of roleStats) {
    map.set(key([row.patch, row.region, row.queue_id, row.source_type, row.champion_id, row.role]), row);
  }
  return map;
}
