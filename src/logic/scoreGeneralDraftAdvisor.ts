import type { ChampionMetadata, Role } from '../types/champion';
import type { EnemyCompAnalysis, PickTiming, TeamCompAnalysis } from './pickRecommendationAnalysis';
import { clamp } from './scoreTypes';

export type ScoreGeneralDraftAdvisorInput = {
  metadata: ChampionMetadata;
  candidateRole: Role;
  timing: PickTiming;
  allyChampionIds: string[];
  enemyChampionIds: string[];
  teamAnalysis: TeamCompAnalysis;
  enemyAnalysis: EnemyCompAnalysis;
  teamNeedFit: number;
  counterValue: number;
  statValue: number;
};

export type GeneralDraftAdvisorScore = {
  score: number;
  reasons: string[];
  risks: string[];
};

export function scoreGeneralDraftAdvisor({
  metadata,
  candidateRole,
  timing,
  allyChampionIds,
  enemyChampionIds,
  teamAnalysis,
  enemyAnalysis,
  teamNeedFit,
  counterValue,
  statValue,
}: ScoreGeneralDraftAdvisorInput): GeneralDraftAdvisorScore {
  let score = 50;
  const reasons: string[] = [];
  const risks: string[] = [];

  if (timing === 'firstPick') {
    score += (metadata.blindPickScore - 5) * 5;
    score += metadata.flexValue * 2.5;
    if (metadata.laneTags.includes('SafeBlind')) {
      score += 10;
      reasons.push('Advisor likes stable blind-pick traits');
    }
    if (metadata.laneTags.includes('Counterpick') || metadata.laneTags.includes('NeedsSetup')) {
      score -= 10;
      risks.push('Advisor is cautious with setup-heavy early picks');
    }
  }

  if (timing === 'responsePick' || enemyChampionIds.length > 0) {
    score += (counterValue - 50) * 0.42;
    if (counterValue >= 65) reasons.push('Advisor values this as an enemy-answer pick');
    if (metadata.weaknessTags.includes('WeakToDive') && enemyAnalysis.hasDive) risks.push('Advisor flags dive vulnerability');
    if (metadata.weaknessTags.includes('LowMobility') && enemyAnalysis.hasBacklineAccess) risks.push('Advisor flags low-mobility risk');
  }

  if (allyChampionIds.length > 0) {
    score += (statValue - 50) * 0.24;
    if (statValue >= 60) reasons.push('Advisor sees useful ally or matchup stat context');
  }

  score += (teamNeedFit - 50) * 0.32;

  if (teamAnalysis.missingNeeds.includes('Frontline') && metadata.utilityTags.includes('Frontline')) {
    score += 8;
    reasons.push('Advisor rewards filling frontline');
  }
  if (teamAnalysis.missingNeeds.includes('Engage') && (metadata.utilityTags.includes('Engage') || metadata.utilityTags.includes('HardEngage'))) {
    score += 7;
    reasons.push('Advisor rewards engage when missing');
  }
  if (teamAnalysis.missingNeeds.includes('Peel') && metadata.utilityTags.includes('Peel')) {
    score += 5;
    reasons.push('Advisor rewards peel for the current comp');
  }
  if ((candidateRole === 'ADC' || candidateRole === 'Support') && (enemyAnalysis.mainThreats.length > 0 || enemyChampionIds.length > 0)) {
    score += 3;
  }

  return {
    score: clamp(score),
    reasons: reasons.slice(0, 3),
    risks: risks.slice(0, 2),
  };
}
