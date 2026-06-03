import type { Role } from '../types/champion';
import type { ChampionMatchupStatsRow, ChampionRoleStatsRow } from '../types/database';
import { getChampion } from './championData';
import { clamp, type ScoreBreakdown } from './scoreTypes';

export type ScoreNetworkStatsInput = {
  candidateChampionId: string;
  candidateRole: Role;
  enemyChampionIds: string[];
  roleStats: ChampionRoleStatsRow[];
  matchupStats: ChampionMatchupStatsRow[];
};

export function scoreNetworkStats({ candidateChampionId, candidateRole, enemyChampionIds, roleStats, matchupStats }: ScoreNetworkStatsInput): ScoreBreakdown {
  const baselineRows = roleStats.filter((row) => row.champion_id === candidateChampionId && row.role === candidateRole);
  const matchupRows = matchupStats.filter(
    (row) => row.champion_id === candidateChampionId && row.role === candidateRole && row.enemy_champion_id && enemyChampionIds.includes(row.enemy_champion_id),
  );

  if (baselineRows.length === 0 && matchupRows.length === 0) {
    return { score: 50, reasons: ['No network matchup data yet; treating stats as neutral'], risks: [] };
  }

  let score = 50;
  const reasons: string[] = [];
  const risks: string[] = [];
  const bestBaseline = [...baselineRows].sort((a, b) => weightedWinRate(b) - weightedWinRate(a))[0];

  if (bestBaseline && bestBaseline.games >= 20) {
    const winRate = Number(bestBaseline.win_rate);
    const adjustment = (winRate - 0.5) * 40 * Number(bestBaseline.confidence ?? 0.15);
    score += adjustment;
    if (adjustment > 2) reasons.push(`${candidateRole} baseline is positive in network stats across ${bestBaseline.games.toLocaleString()} games`);
    if (adjustment < -2) risks.push(`${candidateRole} baseline is below average in network stats across ${bestBaseline.games.toLocaleString()} games`);
  }

  for (const row of matchupRows.slice(0, 5)) {
    const delta = Number(row.delta_vs_baseline ?? 0);
    const confidence = Number(row.confidence ?? 0.15);
    const enemyName = row.enemy_champion_id ? (getChampion(row.enemy_champion_id)?.name ?? row.enemy_champion_id) : 'enemy pick';
    const adjustment = delta * 100 * 0.6 * confidence;
    score += adjustment;
    if (delta > 0) reasons.push(`Network matchup looks good into ${enemyName}: +${(delta * 100).toFixed(1)}% over baseline`);
    if (delta < 0) risks.push(`Network matchup risk into ${enemyName}: ${(delta * 100).toFixed(1)}% below baseline`);
    if (row.games < 50) risks.push(`Low matchup sample into ${enemyName}: ${row.games.toLocaleString()} games`);
  }

  return {
    score: clamp(score),
    reasons: reasons.slice(0, 3),
    risks: risks.slice(0, 3),
  };
}

function weightedWinRate(row: ChampionRoleStatsRow) {
  return Number(row.win_rate) * Number(row.confidence ?? 0.15);
}
