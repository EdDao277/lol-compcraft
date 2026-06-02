import type { ChampionMetadata } from '../types/champion';
import { getChampionMetadata } from '../data/championDraftMetadata';
import { clamp, type ScoreBreakdown } from './scoreTypes';

export function scoreTeamNeedFit(candidate: ChampionMetadata, allyChampionIds: string[]): ScoreBreakdown {
  const allies = allyChampionIds.map(getChampionMetadata);
  const utilityTags = allies.flatMap((metadata) => metadata.utilityTags);
  const compTags = allies.flatMap((metadata) => metadata.compTags);
  const damageTypes = allies.map((metadata) => metadata.damageType);
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 30;

  const needs = [
    ['Frontline', candidate.utilityTags.includes('Frontline')],
    ['Engage', candidate.utilityTags.includes('Engage')],
    ['HardEngage', candidate.utilityTags.includes('HardEngage')],
    ['Peel', candidate.utilityTags.includes('Peel')],
    ['CrowdControl', candidate.utilityTags.includes('CrowdControl')],
    ['Waveclear', candidate.utilityTags.includes('Waveclear')],
  ] as const;

  needs.forEach(([tag, candidateHas]) => {
    if (!utilityTags.includes(tag) && candidateHas) {
      score += 9;
      reasons.push(`Team currently lacks ${tag}`);
    }
  });

  if (!damageTypes.includes('AP') && candidate.damageType === 'AP') {
    score += 10;
    reasons.push('Adds AP damage');
  }
  if (!damageTypes.includes('AD') && candidate.damageType === 'AD') {
    score += 10;
    reasons.push('Adds AD damage');
  }
  if (!compTags.includes('Scaling') && candidate.compTags.includes('Scaling')) {
    score += 6;
    reasons.push('Adds scaling insurance');
  }
  if (!compTags.includes('EarlySnowball') && candidate.compTags.includes('EarlySnowball')) {
    score += 6;
    reasons.push('Adds early snowball pressure');
  }

  if (damageTypes.filter((type) => type === 'AD').length >= 3 && candidate.damageType === 'AD') risks.push('Team may become too AD-heavy');
  if (damageTypes.filter((type) => type === 'AP').length >= 3 && candidate.damageType === 'AP') risks.push('Team may become too AP-heavy');

  return { score: clamp(score), reasons, risks };
}
