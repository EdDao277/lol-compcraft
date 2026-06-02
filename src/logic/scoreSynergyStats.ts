import type { Role } from '../types/champion';
import type { ChampionSynergyStatsRow } from '../types/database';
import { getChampion } from './championData';
import { clamp, type ScoreBreakdown } from './scoreTypes';

export type ScoreSynergyStatsInput = {
  candidateChampionId: string;
  candidateRole: Role;
  allyChampionIds: string[];
  stats: ChampionSynergyStatsRow[];
  minReliableGames?: number;
};

export function scoreSynergyStats({ candidateChampionId, candidateRole, allyChampionIds, stats, minReliableGames = 50 }: ScoreSynergyStatsInput): ScoreBreakdown {
  const matchingRows = stats.filter(
    (row) => row.champion_id === candidateChampionId && row.role === candidateRole && row.ally_champion_id && allyChampionIds.includes(row.ally_champion_id),
  );

  if (matchingRows.length === 0) {
    return {
      score: 50,
      reasons: ['No statistical synergy data yet; treating synergy as neutral'],
      risks: [],
    };
  }

  let score = 50;
  const reasons: string[] = [];
  const risks: string[] = [];

  for (const row of matchingRows) {
    const delta = Number(row.delta_vs_average ?? 0);
    const confidence = row.games >= minReliableGames ? 1 : 0.4;
    const allyName = row.ally_champion_id ? (getChampion(row.ally_champion_id)?.name ?? row.ally_champion_id) : 'ally pick';
    const formattedDelta = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;
    const gamesText = row.games.toLocaleString();

    score += delta * 100 * 2 * confidence;

    if (delta > 0) {
      reasons.push(`Strong statistical synergy with ${allyName}: ${formattedDelta} over baseline across ${gamesText} games.`);
    } else if (delta < 0) {
      risks.push(`Statistical pairing with ${allyName} is ${formattedDelta} below baseline across ${gamesText} games.`);
    }

    if (row.games < minReliableGames) {
      risks.push(`Low sample size with ${allyName}: ${gamesText} games.`);
    }
  }

  return {
    score: clamp(score),
    reasons: reasons.length > 0 ? reasons.slice(0, 3) : ['Statistical synergy is close to baseline'],
    risks: risks.slice(0, 3),
  };
}
