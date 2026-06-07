import type { Role } from './champion';

export type RecommendationKind =
  | 'Best First Pick'
  | 'Best Response Pick'
  | 'Safest Blind Pick'
  | 'Best Flex Pick'
  | 'High Comfort Pick'
  | 'Best Pick Now'
  | 'Best Plan Pick'
  | 'Best Team Need Pick'
  | 'Safest Pick'
  | 'Best Counter Pick'
  | 'High Upside Pick'
  | 'Best Final Pick'
  | 'Best Comp Fix'
  | 'Best Plan Protection Ban'
  | 'Best Enemy Comfort Ban'
  | 'Best Flex/Blind Ban'
  | 'Ban';

export type PickScoreBreakdown = {
  playerFit: number;
  comfortScore: number;
  ruleScore: number;
  draftPlanFit: number;
  teamNeedFit: number;
  roleResponseFit: number;
  counterPickValue: number;
  timingValue: number;
  synergyStats: number;
  networkStats: number;
  teamCompStats: number;
  counterSynergyStats: number;
  advisorScore: number;
  predictedWinChanceGain: number;
  safetyValue: number;
  riskPenalty: number;
};

export type Recommendation = {
  id: string;
  kind: RecommendationKind;
  championId: string;
  championName: string;
  championIcon: string;
  playerName: string;
  role: Role;
  score: number;
  reasons: string[];
  risks: string[];
  scoreBreakdown?: PickScoreBreakdown;
  draftPlanIdentity?: string;
  draftPhase?: string;
};
