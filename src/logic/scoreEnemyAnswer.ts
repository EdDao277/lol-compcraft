import type { ChampionMetadata } from '../types/champion';
import type { EnemyPoolEntry } from '../types/player';
import { getChampionMetadata } from '../data/championDraftMetadata';
import { clamp, hasAny, type ScoreBreakdown } from './scoreTypes';

export function scoreEnemyAnswer(candidate: ChampionMetadata, enemyChampionIds: string[], enemyPools: EnemyPoolEntry[]): ScoreBreakdown {
  const enemyMetas = enemyChampionIds.map(getChampionMetadata);
  const enemyPoolMetas = enemyPools.map((entry) => (entry.championId ? getChampionMetadata(entry.championId) : undefined)).filter((metadata): metadata is ChampionMetadata => Boolean(metadata));
  const enemyWeaknesses = enemyMetas.flatMap((metadata) => metadata.weaknessTags);
  const enemyThreats = enemyMetas.flatMap((metadata) => metadata.threatTags);
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 30;

  const directCounter = candidate.counters.find((championId) => enemyChampionIds.includes(championId));
  if (directCounter) {
    score += 20;
    reasons.push(`Direct counter angle into ${directCounter}`);
  }

  if (hasAny(candidate.counterTags, ['CountersDive', 'CountersHardEngage']) && enemyThreats.includes('DiveThreat')) {
    score += 14;
    reasons.push('Answers enemy dive pressure');
  }
  if (candidate.counterTags.includes('CountersPoke') && enemyThreats.includes('PokeThreat')) {
    score += 14;
    reasons.push('Answers enemy poke pressure');
  }
  if (candidate.counterTags.includes('CountersLowMobility') && enemyWeaknesses.includes('LowMobility')) {
    score += 12;
    reasons.push('Punishes enemy low mobility');
  }
  if (candidate.threatTags.includes('TankKiller') && enemyMetas.some((metadata) => metadata.utilityTags.includes('Frontline'))) {
    score += 10;
    reasons.push('Helps cut through enemy frontline');
  }

  const enemyPoolCounter = enemyPoolMetas.find((metadata) => metadata.counters.includes(candidate.championId) || candidate.counteredBy.includes(metadata.championId));
  if (enemyPoolCounter) {
    score -= 12;
    risks.push(`Enemy pool contains ${enemyPoolCounter.championId}, a possible answer`);
  }

  return { score: clamp(score), reasons, risks };
}
