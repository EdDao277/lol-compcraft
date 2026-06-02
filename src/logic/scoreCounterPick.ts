import { getChampionMetadata } from '../data/championDraftMetadata';
import type { ChampionMetadata } from '../types/champion';
import type { DraftState } from '../types/draft';
import type { EnemyPoolEntry } from '../types/player';
import { pickedChampionIds } from './draftUtils';
import { clamp, hasAny, type ScoreBreakdown } from './scoreTypes';

export function scoreCounterPick(candidate: ChampionMetadata, enemyPickedChampionIds: string[], enemyPools: EnemyPoolEntry[], allyDraftState: DraftState): ScoreBreakdown {
  const enemyMetas = enemyPickedChampionIds.map(getChampionMetadata);
  const enemyPoolMetas = enemyPools.map((entry) => (entry.championId ? getChampionMetadata(entry.championId) : undefined)).filter((metadata): metadata is ChampionMetadata => Boolean(metadata));
  const enemyCompTags = enemyMetas.flatMap((metadata) => metadata.compTags);
  const enemyUtilityTags = enemyMetas.flatMap((metadata) => metadata.utilityTags);
  const enemyThreatTags = enemyMetas.flatMap((metadata) => metadata.threatTags);
  const enemyWeaknessTags = enemyMetas.flatMap((metadata) => metadata.weaknessTags);
  const allyPickedChampionIds = pickedChampionIds(allyDraftState.slots, 'our');
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 30;

  const directCounter = candidate.counters.find((championId) => enemyPickedChampionIds.includes(championId));
  if (directCounter) {
    score += 24;
    reasons.push(`Direct counter angle into ${directCounter}`);
  }

  const reverseCounter = enemyMetas.find((metadata) => metadata.counteredBy.includes(candidate.championId));
  if (reverseCounter) {
    score += 20;
    reasons.push(`${reverseCounter.championId} is marked as countered by this pick`);
  }

  const directRisk = candidate.counteredBy.find((championId) => enemyPickedChampionIds.includes(championId));
  if (directRisk) {
    score -= 12;
    risks.push(`Risk: enemy already picked ${directRisk}, which can punish this champion`);
  }

  if (enemyCompTags.includes('Dive') || enemyThreatTags.includes('DiveThreat')) {
    if (candidate.counterTags.includes('CountersDive') || candidate.threatTags.includes('AntiDive')) {
      score += 18;
      reasons.push('Counters enemy dive tools');
    }
    if (candidate.weaknessTags.includes('WeakToDive')) risks.push('Risk: weak into enemy dive tools');
  }

  if (enemyCompTags.includes('Poke') || enemyThreatTags.includes('PokeThreat')) {
    if (candidate.counterTags.includes('CountersPoke')) {
      score += 16;
      reasons.push('Counters enemy poke setup');
    }
    if (candidate.weaknessTags.includes('WeakToPoke')) risks.push('Risk: weak into enemy poke');
  }

  if ((enemyCompTags.includes('FrontToBack') || enemyCompTags.includes('Scaling')) && (candidate.counterTags.includes('CountersLowMobility') || candidate.threatTags.includes('ImmobileCarryPunish'))) {
    score += 15;
    reasons.push('Good answer into enemy immobile scaling carries');
  }

  if (enemyUtilityTags.includes('Frontline') && (candidate.counterTags.includes('CountersTanks') || candidate.threatTags.includes('TankKiller'))) {
    score += 16;
    reasons.push('Punishes enemy tank-heavy draft');
  }

  if (enemyUtilityTags.includes('Mobility') && candidate.counterTags.includes('CountersMobility')) {
    score += 12;
    reasons.push('Answers enemy mobility');
  }

  if ((enemyUtilityTags.includes('HardEngage') || enemyUtilityTags.includes('Engage')) && (candidate.counterTags.includes('CountersHardEngage') || candidate.threatTags.includes('AntiEngage'))) {
    score += 14;
    reasons.push('Counters enemy hard engage');
  }

  if (candidate.weaknessTags.includes('LowMobility') && (enemyUtilityTags.includes('BacklineAccess') || enemyThreatTags.includes('DiveThreat'))) {
    risks.push('Risk: low mobility into enemy backline access');
    score -= 8;
  }
  if (candidate.weaknessTags.includes('WeakToHardCC') && enemyUtilityTags.filter((tag) => tag === 'CrowdControl' || tag === 'PointClickCC').length >= 2) {
    risks.push('Risk: enemy has heavy crowd control');
    score -= 8;
  }

  const enemyPoolCounter = enemyPoolMetas.find((metadata) => candidate.counteredBy.includes(metadata.championId) || metadata.counters.includes(candidate.championId));
  if (enemyPoolCounter) {
    risks.push(`Risk: enemy pool contains ${enemyPoolCounter.championId}, which can punish this pick`);
    score -= 8;
  }

  if (allyPickedChampionIds.some((championId) => candidate.synergies.includes(championId))) {
    score += 4;
  }
  if (hasAny(enemyWeaknessTags, ['LowMobility', 'NeedsPeel']) && candidate.utilityTags.includes('BacklineAccess')) {
    score += 8;
    reasons.push('Punishes enemy backline weakness');
  }

  return { score: clamp(score), reasons, risks };
}
