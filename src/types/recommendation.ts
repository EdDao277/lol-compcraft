import type { Role } from './champion';

export type RecommendationKind = 'Best Pick Now' | 'Safest Pick' | 'Best Plan Pick' | 'Best Counter Pick' | 'High Upside Pick' | 'Best Plan Protection Ban' | 'Best Enemy Comfort Ban' | 'Best Flex/Blind Ban' | 'Ban';

export type PickScoreBreakdown = {
  playerFit: number;
  draftPlanFit: number;
  teamNeedFit: number;
  counterPickValue: number;
  timingValue: number;
  synergyStats: number;
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
