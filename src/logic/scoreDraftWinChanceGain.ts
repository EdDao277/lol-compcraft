import { getChampionMetadata } from '../data/championDraftMetadata';
import type { ChampionMetadata } from '../types/champion';
import type { EnemyCompAnalysis, TeamCompAnalysis } from './pickRecommendationAnalysis';
import { analyzeEnemyComp, analyzeTeamComp } from './pickRecommendationAnalysis';
import { clamp } from './scoreTypes';

type ScoreDraftWinChanceGainInput = {
  candidate: ChampionMetadata;
  allyChampionIds: string[];
  enemyChampionIds: string[];
  teamNeedFit: number;
  counterValue: number;
  statValue: number;
  safetyValue: number;
};

export function scoreDraftWinChanceGain({
  candidate,
  allyChampionIds,
  enemyChampionIds,
  teamNeedFit,
  counterValue,
  statValue,
  safetyValue,
}: ScoreDraftWinChanceGainInput) {
  const before = scoreCompWinProxy(analyzeTeamComp(allyChampionIds), analyzeEnemyComp(enemyChampionIds), allyChampionIds, enemyChampionIds);
  const afterChampionIds = [...allyChampionIds, candidate.championId];
  const after = scoreCompWinProxy(analyzeTeamComp(afterChampionIds), analyzeEnemyComp(enemyChampionIds), afterChampionIds, enemyChampionIds);
  const rawGain = after - before;
  const score = clamp(50 + rawGain * 1.3 + (teamNeedFit - 50) * 0.12 + (counterValue - 50) * 0.1 + (statValue - 50) * 0.1 + (safetyValue - 50) * 0.06);
  const reasons: string[] = [];
  const risks: string[] = [];

  if (rawGain >= 8) reasons.push('Simulated draft improves our projected comp strength');
  if (rawGain >= 4 && rawGain < 8) reasons.push('Simulated draft gives a small projected win-chance lift');
  if (teamNeedFit >= 65) reasons.push('Win simulation likes that this pick fixes a team need');
  if (counterValue >= 65) reasons.push('Win simulation values the enemy answer this pick provides');
  if (statValue >= 60) reasons.push('Stat context supports this simulated pick');
  if (rawGain <= -5) risks.push('Simulation does not improve the current draft shape much');
  if (counterValue < 40) risks.push('Limited projected enemy answer value');

  return {
    score: Math.round(score),
    reasons,
    risks,
  };
}

function scoreCompWinProxy(comp: TeamCompAnalysis, enemy: EnemyCompAnalysis, championIds: string[], enemyChampionIds: string[]) {
  if (championIds.length === 0) return 50;

  const metas = championIds.map(getChampionMetadata);
  let score = 44 + championIds.length * 5;

  if (comp.hasFrontline) score += 9;
  if (comp.hasEngage) score += 8;
  if (comp.hasPeel) score += 7;
  if (comp.hasReliableCC) score += 7;
  if (comp.hasWaveclear) score += 5;
  if (comp.hasScalingCarry) score += 5;
  if (comp.hasDisengage) score += 4;
  if (comp.adCount > 0 && comp.apCount > 0) score += 8;
  if (comp.adCount >= 4 || comp.apCount >= 4) score -= 8;

  score -= comp.missingNeeds.length * (championIds.length >= 4 ? 4 : 2);

  if (enemy.hasDive && metas.some((metadata) => metadata.counterTags.includes('CountersDive') || metadata.threatTags.includes('AntiDive'))) score += 7;
  if (enemy.hasHardEngage && metas.some((metadata) => metadata.counterTags.includes('CountersHardEngage') || metadata.threatTags.includes('AntiEngage'))) score += 6;
  if (enemy.hasFrontline && metas.some((metadata) => metadata.counterTags.includes('CountersTanks') || metadata.threatTags.includes('TankKiller'))) score += 6;
  if (enemy.hasImmobileCarries && metas.some((metadata) => metadata.threatTags.includes('ImmobileCarryPunish') || metadata.utilityTags.includes('BacklineAccess'))) score += 6;

  if (enemy.hasDive && metas.some((metadata) => metadata.weaknessTags.includes('WeakToDive') || metadata.weaknessTags.includes('LowMobility'))) score -= 5;
  if (enemy.hasPoke && metas.some((metadata) => metadata.weaknessTags.includes('WeakToPoke') || metadata.weaknessTags.includes('ShortRange'))) score -= 5;
  if (enemy.hasHardEngage && !comp.hasDisengage && !comp.hasPeel) score -= 5;

  const directCounters = metas.flatMap((metadata) => metadata.counters).filter((championId) => enemyChampionIds.includes(championId)).length;
  const directRisks = metas.flatMap((metadata) => metadata.counteredBy).filter((championId) => enemyChampionIds.includes(championId)).length;
  score += directCounters * 5;
  score -= directRisks * 5;

  return clamp(score);
}
