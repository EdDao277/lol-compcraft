import type { ChampionMetadata } from '../types/champion';
import type { DraftPhase } from './draftPhase';
import { clamp, type ScoreBreakdown } from './scoreTypes';

export function scoreTiming(candidate: ChampionMetadata, phase: DraftPhase, draftPlanFit: number, teamNeedFit: number, enemyAnswerValue: number): ScoreBreakdown {
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 50;

  if (phase === 'early') {
    score = candidate.blindPickScore * 5 + candidate.flexValue * 8 + candidate.earlyPickValue * 4;
    if (candidate.laneTags.includes('SafeBlind')) reasons.push('Good early draft blind option');
    if (candidate.flexValue > 1) reasons.push('Flex value is useful early');
    if (candidate.blindPickScore <= 5) risks.push('Risky early reveal');
  }

  if (phase === 'middle') {
    score = draftPlanFit * 0.45 + teamNeedFit * 0.45 + candidate.earlyPickValue;
    reasons.push('Middle draft rewards plan fit and filling needs');
  }

  if (phase === 'late') {
    score = enemyAnswerValue * 0.45 + candidate.latePickValue * 5 + (candidate.laneTags.includes('Counterpick') ? 10 : 0);
    if (candidate.laneTags.includes('Counterpick')) reasons.push('Good late counterpick timing');
    if (candidate.latePickValue >= 8) reasons.push('Strong late draft value');
  }

  return { score: clamp(score), reasons, risks };
}
