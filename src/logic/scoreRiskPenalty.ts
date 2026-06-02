import type { ChampionMetadata } from '../types/champion';
import type { DraftPhase } from './draftPhase';
import type { EnemyPoolEntry, PlayerChampionPoolEntry } from '../types/player';
import { getChampionMetadata } from '../data/championDraftMetadata';
import { clamp, hasAny, type ScoreBreakdown } from './scoreTypes';

export function scoreRiskPenalty(candidate: ChampionMetadata, poolEntry: PlayerChampionPoolEntry, allyChampionIds: string[], enemyPools: EnemyPoolEntry[], phase: DraftPhase): ScoreBreakdown {
  const allies = allyChampionIds.map(getChampionMetadata);
  const enemyPoolMetas = enemyPools.map((entry) => (entry.championId ? getChampionMetadata(entry.championId) : undefined)).filter((metadata): metadata is ChampionMetadata => Boolean(metadata));
  const reasons: string[] = [];
  const risks: string[] = [];
  let penalty = 0;

  if (poolEntry.comfortScore <= 4) {
    penalty += 8;
    risks.push('Low player comfort');
  }
  if (phase === 'early' && candidate.blindPickScore <= 5) {
    penalty += 8;
    risks.push('Low blind safety for early draft');
  }

  const damageTypes = allies.map((metadata) => metadata.damageType);
  if (damageTypes.filter((type) => type === 'AD').length >= 3 && candidate.damageType === 'AD') {
    penalty += 6;
    risks.push('Too much AD damage');
  }
  if (damageTypes.filter((type) => type === 'AP').length >= 3 && candidate.damageType === 'AP') {
    penalty += 6;
    risks.push('Too much AP damage');
  }

  const utilityTags = allies.flatMap((metadata) => metadata.utilityTags);
  const lateDraft = allyChampionIds.length >= 3;
  if (lateDraft && !utilityTags.includes('Frontline') && !candidate.utilityTags.includes('Frontline')) {
    penalty += 6;
    risks.push('No frontline by late draft');
  }
  if (lateDraft && !utilityTags.includes('Engage') && !candidate.utilityTags.includes('Engage')) {
    penalty += 6;
    risks.push('No engage by late draft');
  }
  if (allies.some((metadata) => metadata.weaknessTags.includes('NeedsPeel')) && !utilityTags.includes('Peel') && !candidate.utilityTags.includes('Peel')) {
    penalty += 5;
    risks.push('Immobile carries may still lack peel');
  }

  const enemyCounter = enemyPoolMetas.find((metadata) => metadata.counters.includes(candidate.championId) || candidate.counteredBy.includes(metadata.championId));
  if (enemyCounter) {
    penalty += 8;
    risks.push(`Enemy pool can answer with ${enemyCounter.championId}`);
  }

  const enemyThreatTags = enemyPoolMetas.flatMap((metadata) => metadata.threatTags);
  if (candidate.weaknessTags.includes('WeakToDive') && enemyThreatTags.includes('DiveThreat')) {
    penalty += 5;
    risks.push('Enemy pool can punish dive weakness');
  }
  if (candidate.weaknessTags.includes('WeakToPoke') && enemyThreatTags.includes('PokeThreat')) {
    penalty += 5;
    risks.push('Enemy pool can punish poke weakness');
  }
  if (hasAny(candidate.weaknessTags, ['LowMobility', 'ShortRange']) && enemyThreatTags.includes('ImmobileCarryPunish')) {
    penalty += 4;
    risks.push('Enemy pool can punish low mobility or short range');
  }

  if (penalty === 0) reasons.push('No major risk penalty from current draft state');

  return { score: clamp(penalty, 0, 30), reasons, risks };
}
