import type { TeamCompSignatureStatsRow } from '../types/database';
import { getChampion } from './championData';
import { clamp, type ScoreBreakdown } from './scoreTypes';
import { buildTeamCompSignatureFromIds } from './teamCompSignature';

export type ScoreTeamCompSignatureStatsInput = {
  allyChampionIds: string[];
  candidateChampionId: string;
  teamCompSignatureStats: TeamCompSignatureStatsRow[];
};

export function scoreTeamCompSignatureStats({ allyChampionIds, candidateChampionId, teamCompSignatureStats }: ScoreTeamCompSignatureStatsInput): ScoreBreakdown {
  if (teamCompSignatureStats.length === 0) {
    return { score: 50, reasons: ['No team-comp signature data yet; treating comp history as neutral'], risks: [] };
  }

  const candidateName = getChampion(candidateChampionId)?.name ?? candidateChampionId;
  const candidateSignature = buildTeamCompSignatureFromIds([...allyChampionIds, candidateChampionId]);
  const exactRows = teamCompSignatureStats.filter((row) => row.signature === candidateSignature.signature);
  const rows = exactRows.length > 0 ? exactRows : findSimilarSignatureRows(candidateSignature.signature, teamCompSignatureStats);

  if (rows.length === 0) {
    return { score: 50, reasons: [`No close historical comp signature found after adding ${candidateName}`], risks: [] };
  }

  const weighted = weightedAverage(rows);
  const adjustment = (weighted.winRate - 0.5) * 80 * weighted.confidence;
  const score = clamp(50 + adjustment);
  const sampleText = `${Math.round(weighted.games).toLocaleString()} games`;
  const reasons: string[] = [];
  const risks: string[] = [];

  if (adjustment > 2) {
    reasons.push(`Similar comp signatures perform well after adding ${candidateName}: ${(weighted.winRate * 100).toFixed(1)}% over ${sampleText}`);
  } else if (adjustment < -2) {
    risks.push(`Similar comp signatures have struggled after adding ${candidateName}: ${(weighted.winRate * 100).toFixed(1)}% over ${sampleText}`);
  } else {
    reasons.push(`Similar comp signatures are close to baseline after adding ${candidateName}`);
  }

  if (exactRows.length === 0) risks.push('Using nearest historical comp signatures, not an exact signature match');
  if (weighted.games < 100) risks.push(`Low comp-signature sample: ${sampleText}`);

  return { score, reasons: reasons.slice(0, 2), risks: risks.slice(0, 2) };
}

function findSimilarSignatureRows(signature: string, rows: TeamCompSignatureStatsRow[]) {
  const target = new Set(signature === 'none' ? [] : signature.split('|'));
  return [...rows]
    .map((row) => ({ row, overlap: jaccard(target, new Set(row.signature === 'none' ? [] : row.signature.split('|'))) }))
    .filter(({ overlap }) => overlap >= 0.65)
    .sort((a, b) => b.overlap - a.overlap || b.row.games - a.row.games)
    .slice(0, 12)
    .map(({ row }) => row);
}

function weightedAverage(rows: TeamCompSignatureStatsRow[]) {
  let weightSum = 0;
  let winRateSum = 0;
  let confidenceSum = 0;
  let games = 0;

  for (const row of rows) {
    const confidence = Number(row.confidence ?? 0.15);
    const weight = Math.max(1, Number(row.games || 0)) * confidence;
    weightSum += weight;
    winRateSum += Number(row.win_rate || 0.5) * weight;
    confidenceSum += confidence * weight;
    games += Number(row.games || 0);
  }

  return {
    winRate: weightSum > 0 ? winRateSum / weightSum : 0.5,
    confidence: weightSum > 0 ? confidenceSum / weightSum : 0.15,
    games,
  };
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}
