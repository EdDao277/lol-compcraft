import type { ChampionMetadata } from '../types/champion';
import type { DraftPlan } from './draftPlan';
import { draftTemplates } from './draftTemplates';
import { clamp, hasAny, type ScoreBreakdown } from './scoreTypes';

export function scoreDraftPlanFit(candidate: ChampionMetadata, allyChampionIds: string[], plan: DraftPlan): ScoreBreakdown {
  const template = draftTemplates[plan.identity];
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 35;

  if (candidate.compTags.includes(plan.identity)) {
    score += 25;
    reasons.push(`Advances the ${plan.identity} draft plan`);
  }

  const wantedUtility = candidate.utilityTags.filter((tag) => template.wants.utilityTags.includes(tag));
  if (wantedUtility.length > 0) {
    score += wantedUtility.length * 8;
    reasons.push(`Adds ${wantedUtility.slice(0, 2).join(', ')} for ${plan.identity}`);
  }

  const fillsMissing = plan.missingPieces.filter((piece) => candidate.utilityTags.some((tag) => piece.toLowerCase().includes(tag.toLowerCase())));
  if (fillsMissing.length > 0) {
    score += fillsMissing.length * 10;
    reasons.push(`Fills ${fillsMissing[0].replace('Missing ', '')}`);
  }

  const synergy = candidate.synergies.find((championId) => allyChampionIds.includes(championId));
  if (synergy) {
    score += 12;
    reasons.push(`Pairs well with ${synergy}`);
  }

  if (hasAny(candidate.compTags, template.hates.compTags) || hasAny(candidate.threatTags, template.hates.threatTags)) {
    score -= 10;
    risks.push(`Does not naturally support the ${plan.identity} plan`);
  }

  return { score: clamp(score), reasons, risks };
}
