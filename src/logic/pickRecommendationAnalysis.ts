import { getChampionMetadata } from '../data/championDraftMetadata';
import type { DraftFormat } from '../types/draft';
import type { ChampionMetadata, CompTag } from '../types/champion';

export type PickTiming = 'firstPick' | 'responsePick' | 'early' | 'middle' | 'late';
export type TeamNeed = 'Frontline' | 'Engage' | 'Peel' | 'APDamage' | 'ADDamage' | 'CrowdControl' | 'Waveclear' | 'Scaling' | 'EarlyPressure';
export type DraftPlan = CompTag | 'Balanced';

export type TeamCompAnalysis = {
  adCount: number;
  apCount: number;
  hasFrontline: boolean;
  hasEngage: boolean;
  hasDisengage: boolean;
  hasPeel: boolean;
  hasReliableCC: boolean;
  hasWaveclear: boolean;
  hasScalingCarry: boolean;
  currentPlan: DraftPlan;
  missingNeeds: TeamNeed[];
};

export type EnemyCompAnalysis = {
  adThreats: number;
  apThreats: number;
  hasDive: boolean;
  hasPoke: boolean;
  hasFrontline: boolean;
  hasScaling: boolean;
  hasImmobileCarries: boolean;
  hasHardEngage: boolean;
  hasBacklineAccess: boolean;
  mainThreats: string[];
};

export function getPickTiming(allyPickCount: number, enemyPickCount = 0, ourSide: 'blue' | 'red' = 'blue', format: DraftFormat = 'ranked'): PickTiming {
  if (allyPickCount === 0 && ourSide === 'red' && enemyPickCount > 0) return 'responsePick';
  if (allyPickCount === 0) return 'firstPick';
  if (format === 'tournament' && allyPickCount >= 4) return 'late';
  if (format === 'tournament' && allyPickCount >= 3 && enemyPickCount >= 3) return 'middle';
  if (allyPickCount <= 2) return 'early';
  if (allyPickCount <= 3) return 'middle';
  return 'late';
}

export function analyzeTeamComp(allyChampionIds: string[]): TeamCompAnalysis {
  const metas = allyChampionIds.map(getChampionMetadata);
  const compCounts = new Map<CompTag, number>();
  for (const metadata of metas) {
    metadata.compTags.forEach((tag) => compCounts.set(tag, (compCounts.get(tag) ?? 0) + 1));
  }

  const currentPlan = [...compCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Balanced';
  const adCount = metas.filter((metadata) => metadata.damageType === 'AD' || metadata.damageType === 'Mixed' || metadata.damageType === 'True').length;
  const apCount = metas.filter((metadata) => metadata.damageType === 'AP' || metadata.damageType === 'Mixed').length;
  const hasFrontline = metas.some((metadata) => metadata.utilityTags.includes('Frontline'));
  const hasEngage = metas.some((metadata) => metadata.utilityTags.includes('Engage') || metadata.utilityTags.includes('HardEngage'));
  const hasDisengage = metas.some((metadata) => metadata.utilityTags.includes('Disengage'));
  const hasPeel = metas.some((metadata) => metadata.utilityTags.includes('Peel'));
  const hasReliableCC = metas.some((metadata) => metadata.utilityTags.includes('CrowdControl') || metadata.utilityTags.includes('PointClickCC'));
  const hasWaveclear = metas.some((metadata) => metadata.utilityTags.includes('Waveclear'));
  const hasScalingCarry = metas.some((metadata) => metadata.compTags.includes('Scaling') || metadata.laneTags.includes('Carry'));

  const missingNeeds: TeamNeed[] = [];
  if (!hasFrontline) missingNeeds.push('Frontline');
  if (!hasEngage) missingNeeds.push('Engage');
  if (!hasPeel && metas.some((metadata) => metadata.weaknessTags.includes('NeedsPeel') || metadata.weaknessTags.includes('LowMobility'))) missingNeeds.push('Peel');
  if (apCount === 0) missingNeeds.push('APDamage');
  if (adCount === 0) missingNeeds.push('ADDamage');
  if (!hasReliableCC) missingNeeds.push('CrowdControl');
  if (!hasWaveclear) missingNeeds.push('Waveclear');
  if (!hasScalingCarry) missingNeeds.push('Scaling');
  if (!metas.some((metadata) => metadata.compTags.includes('EarlySnowball') || metadata.laneTags.includes('LaneBully'))) missingNeeds.push('EarlyPressure');

  return { adCount, apCount, hasFrontline, hasEngage, hasDisengage, hasPeel, hasReliableCC, hasWaveclear, hasScalingCarry, currentPlan, missingNeeds };
}

export function analyzeEnemyComp(enemyChampionIds: string[]): EnemyCompAnalysis {
  const metas = enemyChampionIds.map(getChampionMetadata);
  const adThreats = metas.filter((metadata) => metadata.damageType === 'AD' || metadata.damageType === 'Mixed' || metadata.damageType === 'True').length;
  const apThreats = metas.filter((metadata) => metadata.damageType === 'AP' || metadata.damageType === 'Mixed').length;
  const hasDive = metas.some((metadata) => metadata.compTags.includes('Dive') || metadata.threatTags.includes('DiveThreat'));
  const hasPoke = metas.some((metadata) => metadata.compTags.includes('Poke') || metadata.threatTags.includes('PokeThreat'));
  const hasFrontline = metas.some((metadata) => metadata.utilityTags.includes('Frontline'));
  const hasScaling = metas.some((metadata) => metadata.compTags.includes('Scaling') || metadata.threatTags.includes('ScalingThreat'));
  const hasImmobileCarries = metas.some((metadata) => metadata.weaknessTags.includes('LowMobility') || metadata.weaknessTags.includes('NeedsPeel'));
  const hasHardEngage = metas.some((metadata) => metadata.utilityTags.includes('HardEngage') || metadata.utilityTags.includes('Engage'));
  const hasBacklineAccess = metas.some((metadata) => metadata.utilityTags.includes('BacklineAccess') || metadata.threatTags.includes('DiveThreat'));
  const mainThreats = metas.filter((metadata) => metadata.threatTags.length > 0 || metadata.compTags.includes('Scaling')).map((metadata) => metadata.championId);

  return { adThreats, apThreats, hasDive, hasPoke, hasFrontline, hasScaling, hasImmobileCarries, hasHardEngage, hasBacklineAccess, mainThreats };
}

export function hasTag(metadata: ChampionMetadata, tag: string) {
  return [...metadata.compTags, ...metadata.utilityTags, ...metadata.laneTags, ...metadata.threatTags, ...metadata.weaknessTags, ...metadata.counterTags].includes(tag as never);
}
