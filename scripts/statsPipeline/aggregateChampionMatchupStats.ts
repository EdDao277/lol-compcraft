import { buildChampionRoleBaselineMap } from './aggregateChampionRoleStats';
import { roundStat, sampleConfidence } from './sampleConfidence';
import type { ChampionMatchupStat, ChampionRoleStat, ProcessedTeam } from './types';

type Counter = { games: number; wins: number; matchupType: ChampionMatchupStat['matchup_type'] };

function key(parts: Array<string | number>) {
  return parts.join('::');
}

export function aggregateChampionMatchupStats(teams: ProcessedTeam[], roleStats: ChampionRoleStat[]): ChampionMatchupStat[] {
  const baselines = buildChampionRoleBaselineMap(roleStats);
  const byMatch = new Map<string, ProcessedTeam[]>();
  for (const team of teams) byMatch.set(team.matchId, [...(byMatch.get(team.matchId) ?? []), team]);

  const counters = new Map<string, Counter>();

  for (const matchTeams of byMatch.values()) {
    if (matchTeams.length !== 2) continue;
    const [teamA, teamB] = matchTeams;
    addMatchups(counters, teamA, teamB);
    addMatchups(counters, teamB, teamA);
  }

  return [...counters.entries()].map(([rowKey, counter]) => {
    const [patch, region, queueId, sourceType, championId, role, enemyChampionId, enemyRole] = rowKey.split('::') as [
      string,
      string,
      string,
      ChampionMatchupStat['source_type'],
      string,
      ChampionMatchupStat['role'],
      string,
      ChampionMatchupStat['enemy_role'],
    ];
    const winRate = counter.wins / counter.games;
    const baseline = baselines.get(key([patch, region, queueId, sourceType, championId, role]));
    return {
      patch,
      region,
      queue_id: Number(queueId),
      source_type: sourceType,
      champion_id: championId,
      role,
      enemy_champion_id: enemyChampionId,
      enemy_role: enemyRole,
      matchup_type: counter.matchupType,
      games: counter.games,
      wins: counter.wins,
      win_rate: roundStat(winRate),
      delta_vs_baseline: baseline ? roundStat(winRate - baseline.win_rate) : null,
      confidence: sampleConfidence(counter.games),
    };
  });
}

function addMatchups(counters: Map<string, Counter>, team: ProcessedTeam, enemyTeam: ProcessedTeam) {
  for (const champion of team.participants) {
    for (const enemy of enemyTeam.participants) {
      const matchupType = champion.role === enemy.role ? 'same-role' : 'cross-team';
      const rowKey = key([team.patch, team.region, team.queueId, team.sourceType, champion.championId, champion.role, enemy.championId, enemy.role]);
      const counter = counters.get(rowKey) ?? { games: 0, wins: 0, matchupType };
      counter.games += 1;
      counter.wins += team.win ? 1 : 0;
      counters.set(rowKey, counter);
    }
  }
}
