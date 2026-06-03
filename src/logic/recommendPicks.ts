import { getChampionMetadata } from '../data/championDraftMetadata';
import type { ChampionMetadata } from '../types/champion';
import type { DraftState } from '../types/draft';
import type { ChampionMatchupStatsRow, ChampionRoleStatsRow, ChampionSynergyStatsRow } from '../types/database';
import type { EnemyPoolEntry, Player, PlayerChampionPoolEntry } from '../types/player';
import type { PickScoreBreakdown, Recommendation } from '../types/recommendation';
import { getChampion } from './championData';
import { filledPickIndexes, getFilledAllyRoles, pickedChampionIds, unavailableChampionIds } from './draftUtils';
import { analyzeEnemyComp, analyzeTeamComp, getPickTiming, type EnemyCompAnalysis, type PickTiming, type TeamCompAnalysis } from './pickRecommendationAnalysis';
import { scoreCounterPick } from './scoreCounterPick';
import { scoreDraftPlanFit } from './scoreDraftPlanFit';
import { scorePlayerFit } from './scorePlayerFit';
import { scoreRiskPenalty } from './scoreRiskPenalty';
import { scoreNetworkStats } from './scoreNetworkStats';
import { scoreSynergyStats } from './scoreSynergyStats';
import { clamp } from './scoreTypes';

type PickCandidate = Recommendation & {
  scoreBreakdown: PickScoreBreakdown;
  poolEntry: PlayerChampionPoolEntry;
};

function buildCandidate(
  metadata: ChampionMetadata,
  poolEntry: PlayerChampionPoolEntry,
  player: Player,
  playerLabel: string,
  allyChampionIds: string[],
  enemyChampionIds: string[],
  enemyPools: EnemyPoolEntry[],
  allyDraftState: DraftState,
  synergyStats: ChampionSynergyStatsRow[],
  roleStats: ChampionRoleStatsRow[],
  matchupStats: ChampionMatchupStatsRow[],
  teamAnalysis: TeamCompAnalysis,
  enemyAnalysis: EnemyCompAnalysis,
  timing: PickTiming,
): PickCandidate | null {
  const champion = getChampion(metadata.championId);
  if (!champion) return null;

  const draftPlan = {
    identity: teamAnalysis.currentPlan === 'Balanced' ? 'FrontToBack' : teamAnalysis.currentPlan,
    confidence: allyChampionIds.length === 0 ? 15 : 60,
    strengths: [],
    missingPieces: teamAnalysis.missingNeeds,
    risks: [],
  };
  const playerFit = scorePlayerFit(player, poolEntry, metadata, playerLabel);
  const draftPlanFit = scoreDraftPlanFit(metadata, allyChampionIds, draftPlan);
  const teamNeedFit = scoreTeamNeedFitFromAnalysis(metadata, teamAnalysis, timing);
  const counterPickValue = scoreCounterPick(metadata, enemyChampionIds, enemyPools, allyDraftState);
  const adjustedCounterValue = enemyChampionIds.length === 0 ? { score: 50, reasons: [] as string[], risks: [] as string[] } : adjustCounterForEnemyAnalysis(metadata, counterPickValue, enemyChampionIds, enemyAnalysis);
  const statisticalSynergy = scoreSynergyStats({
    candidateChampionId: metadata.championId,
    candidateRole: poolEntry.role,
    allyChampionIds,
    stats: synergyStats,
  });
  const networkStats = scoreNetworkStats({
    candidateChampionId: metadata.championId,
    candidateRole: poolEntry.role,
    enemyChampionIds,
    roleStats,
    matchupStats,
  });
  const statsValue = (statisticalSynergy.score + networkStats.score) / 2;
  const timingValue = scorePickTiming(metadata, timing, allyDraftState.ourSide, teamNeedFit.score, statsValue, adjustedCounterValue.score);
  const safetyValue = scoreSafetyValue(metadata);
  const riskPenalty = scoreRiskPenalty(metadata, poolEntry, allyChampionIds, enemyPools, timing === 'firstPick' ? 'early' : timing === 'middle' ? 'middle' : 'late');
  const score = scoreCandidate({
    timing,
    playerFit: playerFit.score,
    pickTimingFit: timingValue.score,
    teamNeedFit: teamNeedFit.score,
    counterValue: adjustedCounterValue.score,
    synergyValue: statsValue,
    safetyValue: safetyValue.score,
    riskPenalty: riskPenalty.score + getSituationRiskPenalty(metadata, timing, teamAnalysis, enemyAnalysis),
    flexValue: metadata.flexValue,
    comfortScore: poolEntry.comfortScore,
  });

  const synergyReasons = statisticalSynergy.reasons.filter((reason) => !reason.includes('No statistical synergy data yet'));
  const networkReasons = networkStats.reasons.filter((reason) => !reason.includes('No network matchup data yet'));
  const reasons = [...teamNeedFit.reasons, ...adjustedCounterValue.reasons, ...networkReasons, ...draftPlanFit.reasons, ...synergyReasons, ...timingValue.reasons, ...safetyValue.reasons, ...playerFit.reasons].slice(0, 5);
  const risks = [...teamNeedFit.risks, ...adjustedCounterValue.risks, ...networkStats.risks, ...draftPlanFit.risks, ...statisticalSynergy.risks, ...timingValue.risks, ...safetyValue.risks, ...riskPenalty.risks].slice(0, 4);

  return {
    id: `${player.id}-${metadata.championId}-${poolEntry.role}`,
    kind: 'Best Pick Now',
    championId: metadata.championId,
    championName: champion.name,
    championIcon: champion.imageUrl,
    playerName: playerLabel,
    role: poolEntry.role,
    score,
    reasons: reasons.length > 0 ? reasons : ['Solid team-pool option for the current draft'],
    risks: risks.length > 0 ? risks : ['No major risk from current draft state'],
    scoreBreakdown: {
      playerFit: playerFit.score,
      draftPlanFit: draftPlanFit.score,
      teamNeedFit: teamNeedFit.score,
      counterPickValue: adjustedCounterValue.score,
      timingValue: timingValue.score,
      synergyStats: statisticalSynergy.score,
      networkStats: networkStats.score,
      safetyValue: safetyValue.score,
      riskPenalty: riskPenalty.score,
    },
    draftPlanIdentity: teamAnalysis.currentPlan,
    draftPhase: timing,
    poolEntry,
  };
}

function takeTopUnique(candidates: PickCandidate[], usedIds: Set<string>, sorter: (candidate: PickCandidate) => number, kind: Recommendation['kind']): PickCandidate | undefined {
  const candidate = [...candidates].sort((a, b) => sorter(b) - sorter(a)).find((item) => !usedIds.has(item.id) && !usedIds.has(item.championId));
  if (!candidate) return undefined;
  usedIds.add(candidate.id);
  usedIds.add(candidate.championId);
  const categoryReason = getCategoryReason(candidate, kind);
  return {
    ...candidate,
    kind,
    reasons: categoryReason && !candidate.reasons.includes(categoryReason) ? [categoryReason, ...candidate.reasons].slice(0, 5) : candidate.reasons,
  };
}

function getCategoryReason(candidate: PickCandidate, kind: Recommendation['kind']): string | null {
  if (kind === 'Best Pick Now') {
    return `Best overall score from player fit, timing, team needs, counters, synergy, and safety`;
  }
  if (kind === 'Best First Pick') {
    return `Best first pick because it combines comfort, blind safety, flexibility, and general team value`;
  }
  if (kind === 'Safest Blind Pick') {
    return `Safest blind option for the current draft state`;
  }
  if (kind === 'Best Flex Pick') {
    return `Strong flexible pick that reveals less and fits multiple draft paths`;
  }
  if (kind === 'High Comfort Pick') {
    return `High comfort option from the team pool`;
  }
  if (kind === 'Safest Pick') {
    return `Safest option because blind value, survivability, and timing are strong`;
  }
  if (kind === 'Best Plan Pick') {
    return `Best fit for the current ${candidate.draftPlanIdentity ?? 'draft'} plan`;
  }
  if (kind === 'Best Counter Pick') {
    return `Best counter value into the current enemy picks and pools`;
  }
  if (kind === 'Best Team Need Pick' || kind === 'Best Comp Fix') {
    return `Best pick for filling the team's current comp holes`;
  }
  if (kind === 'Best Final Pick') {
    return `Best final pick by combining counter value, comp completion, and risk avoidance`;
  }
  if (kind === 'High Upside Pick') {
    return `Highest upside from late value, counter value, and timing`;
  }
  return null;
}

export function recommendPicks(
  draft: DraftState,
  players: Player[],
  enemyPools: EnemyPoolEntry[],
  synergyStats: ChampionSynergyStatsRow[] = [],
  roleStats: ChampionRoleStatsRow[] = [],
  matchupStats: ChampionMatchupStatsRow[] = [],
): Recommendation[] {
  const unavailable = unavailableChampionIds(draft.slots);
  const allyChampionIds = pickedChampionIds(draft.slots, 'our');
  const enemyChampionIds = pickedChampionIds(draft.slots, 'enemy');
  const filledPlayers = filledPickIndexes(draft.slots, 'our');
  const filledRoles = new Set(getFilledAllyRoles(draft));
  const teamAnalysis = analyzeTeamComp(allyChampionIds);
  const enemyAnalysis = analyzeEnemyComp(enemyChampionIds);
  const timing = getPickTiming(allyChampionIds.length);

  const candidates = players.flatMap((player, playerIndex) =>
    filledPlayers.has(playerIndex)
      ? []
      : player.championPool
          .filter((entry) => entry.championId && !unavailable.has(entry.championId) && !filledRoles.has(entry.role))
          .map((entry) =>
            buildCandidate(
              getChampionMetadata(entry.championId as string),
              entry,
              player,
              `Player ${playerIndex + 1}`,
              allyChampionIds,
              enemyChampionIds,
              enemyPools,
              draft,
              synergyStats,
              roleStats,
              matchupStats,
              teamAnalysis,
              enemyAnalysis,
              timing,
            ),
          )
          .filter((candidate): candidate is PickCandidate => Boolean(candidate)),
  );

  const usedIds = new Set<string>();
  return getCategoryPlan(timing, enemyChampionIds.length).map(({ kind, sorter }) => takeTopUnique(candidates, usedIds, sorter, kind)).filter((recommendation): recommendation is PickCandidate => Boolean(recommendation));
}

function scoreCandidate(scores: {
  timing: PickTiming;
  playerFit: number;
  pickTimingFit: number;
  teamNeedFit: number;
  counterValue: number;
  synergyValue: number;
  safetyValue: number;
  riskPenalty: number;
  flexValue: number;
  comfortScore: number;
}) {
  if (scores.timing === 'firstPick') {
    const flexScore = clamp(50 + scores.flexValue * 10);
    const comfortMetaValue = clamp(scores.comfortScore * 9 + scores.safetyValue * 0.1);
    const generalTeamValue = clamp((scores.teamNeedFit + scores.pickTimingFit) / 2);
    return clamp(scores.playerFit * 0.3 + scores.safetyValue * 0.3 + flexScore * 0.15 + generalTeamValue * 0.15 + comfortMetaValue * 0.1 - scores.riskPenalty);
  }

  return clamp(scores.playerFit * 0.25 + scores.pickTimingFit * 0.2 + scores.teamNeedFit * 0.2 + scores.counterValue * 0.15 + scores.synergyValue * 0.1 + scores.safetyValue * 0.1 - scores.riskPenalty);
}

function scorePickTiming(metadata: ChampionMetadata, timing: PickTiming, userSide: DraftState['ourSide'], teamNeedFit: number, synergyFit: number, counterPickValue: number) {
  let score = 50;
  const reasons: string[] = [];
  const risks: string[] = [];

  if (timing === 'firstPick') {
    score = metadata.blindPickScore * 8 + metadata.flexValue * 6;
    if (userSide === 'blue') score += 8;
    if (metadata.laneTags.includes('SafeBlind')) reasons.push('Strong blue-side first-pick profile');
    if (metadata.laneTags.includes('Counterpick')) risks.push('Better as a counterpick than a blind opener');
  } else if (timing === 'early') {
    score = metadata.blindPickScore * 7 + metadata.flexValue * 7 + metadata.earlyPickValue * 3;
    reasons.push('Early draft rewards blind safety and flexibility');
  } else if (timing === 'middle') {
    score = (teamNeedFit + synergyFit) / 2;
    reasons.push('Middle draft rewards comp completion and ally synergy');
  } else {
    score = counterPickValue * 0.6 + metadata.latePickValue * 8;
    reasons.push('Late draft rewards counter value and final comp fit');
  }

  return { score: clamp(score), reasons, risks };
}

function scoreTeamNeedFitFromAnalysis(metadata: ChampionMetadata, analysis: TeamCompAnalysis, timing: PickTiming) {
  let score = 45;
  const reasons: string[] = [];
  const risks: string[] = [];
  const lateMultiplier = timing === 'late' ? 1.35 : 1;

  const addNeed = (need: string, amount: number, reason: string) => {
    if (!analysis.missingNeeds.includes(need as never)) return;
    score += amount * lateMultiplier;
    reasons.push(reason);
  };

  addNeed('APDamage', metadata.damageType === 'AP' || metadata.damageType === 'Mixed' ? 20 : 0, 'Adds needed AP damage');
  addNeed('ADDamage', metadata.damageType === 'AD' || metadata.damageType === 'Mixed' || metadata.damageType === 'True' ? 20 : 0, 'Adds needed AD damage');
  addNeed('Frontline', metadata.utilityTags.includes('Frontline') ? 22 : 0, 'Team currently lacks frontline');
  addNeed('Engage', metadata.utilityTags.includes('HardEngage') || metadata.utilityTags.includes('Engage') ? 20 : 0, 'Adds needed engage');
  addNeed('Peel', metadata.utilityTags.includes('Peel') ? 16 : 0, 'Adds peel for vulnerable carries');
  addNeed('CrowdControl', metadata.utilityTags.includes('CrowdControl') || metadata.utilityTags.includes('PointClickCC') ? 16 : 0, 'Adds reliable crowd control');
  addNeed('Waveclear', metadata.utilityTags.includes('Waveclear') ? 14 : 0, 'Adds waveclear');
  addNeed('Scaling', metadata.compTags.includes('Scaling') || metadata.laneTags.includes('Carry') ? 10 : 0, 'Adds scaling threat');
  addNeed('EarlyPressure', metadata.compTags.includes('EarlySnowball') || metadata.laneTags.includes('LaneBully') ? 10 : 0, 'Adds early pressure');

  if (analysis.adCount >= 3 && metadata.damageType === 'AD') {
    score -= 12;
    risks.push('Team may become too AD-heavy');
  }
  if (analysis.apCount >= 3 && metadata.damageType === 'AP') {
    score -= 12;
    risks.push('Team may become too AP-heavy');
  }

  return { score: clamp(score), reasons, risks };
}

function adjustCounterForEnemyAnalysis(metadata: ChampionMetadata, base: { score: number; reasons: string[]; risks: string[] }, enemyChampionIds: string[], enemy: EnemyCompAnalysis) {
  let score = base.score;
  const reasons = [...base.reasons];
  const risks = [...base.risks];

  if (metadata.counters.some((championId) => enemyChampionIds.includes(championId))) score += 20;
  if (metadata.counterTags.includes('CountersDive') && enemy.hasDive) {
    score += 15;
    reasons.push('Counters enemy dive tools');
  }
  if (metadata.counterTags.includes('CountersTanks') && enemy.hasFrontline) {
    score += 15;
    reasons.push('Punishes enemy frontline');
  }
  if (metadata.threatTags.includes('ImmobileCarryPunish') && enemy.hasImmobileCarries) {
    score += 15;
    reasons.push('Punishes enemy immobile carries');
  }
  if (metadata.counterTags.includes('CountersHardEngage') && enemy.hasHardEngage) {
    score += 12;
    reasons.push('Answers enemy hard engage');
  }
  if (metadata.weaknessTags.includes('WeakToDive') && enemy.hasDive) risks.push('Risk: weak into enemy dive');
  if (metadata.weaknessTags.includes('LowMobility') && enemy.hasBacklineAccess) risks.push('Risk: low mobility into enemy backline access');
  const directRisk = metadata.counteredBy.find((championId) => enemyChampionIds.includes(championId));
  if (directRisk) {
    score -= 15;
    risks.push(`Risk: enemy already picked ${directRisk}, which can counter this`);
  }

  return { score: clamp(score), reasons, risks };
}

function scoreSafetyValue(metadata: ChampionMetadata) {
  let score = metadata.blindPickScore * 7 + metadata.flexValue * 5;
  const reasons: string[] = [];
  const risks: string[] = [];

  if (metadata.laneTags.includes('SafeBlind')) {
    score += 15;
    reasons.push('Safe blind-pick profile');
  }
  if (metadata.laneTags.includes('WeakSide') || metadata.laneTags.includes('LowEconomy')) score += 8;
  if (metadata.utilityTags.includes('Waveclear')) score += 6;
  if (metadata.utilityTags.includes('Mobility')) score += 6;
  if (metadata.laneTags.includes('Counterpick')) {
    score -= 12;
    risks.push('More valuable as a counterpick than blind');
  }
  if (metadata.laneTags.includes('WeakEarly')) {
    score -= 10;
    risks.push('Weak early profile');
  }
  if (metadata.laneTags.includes('NeedsSetup') || metadata.weaknessTags.includes('NeedsPeel')) {
    score -= 8;
    risks.push('Needs teammate setup or protection');
  }
  if (metadata.weaknessTags.includes('LowMobility') || metadata.weaknessTags.includes('SkillshotReliant')) score -= 5;

  return { score: clamp(score), reasons, risks };
}

function getSituationRiskPenalty(metadata: ChampionMetadata, timing: PickTiming, team: TeamCompAnalysis, enemy: EnemyCompAnalysis) {
  let risk = 0;
  if (timing === 'firstPick' && (metadata.laneTags.includes('Counterpick') || metadata.laneTags.includes('WeakEarly') || metadata.laneTags.includes('NeedsSetup'))) risk += 8;
  if (timing === 'late' && team.missingNeeds.includes('Frontline') && !metadata.utilityTags.includes('Frontline')) risk += 10;
  if (timing === 'late' && team.missingNeeds.includes('Engage') && !metadata.utilityTags.includes('Engage') && !metadata.utilityTags.includes('HardEngage')) risk += 8;
  if (timing === 'late' && team.missingNeeds.includes('Peel') && !metadata.utilityTags.includes('Peel') && !metadata.utilityTags.includes('Frontline')) risk += 8;
  if (metadata.weaknessTags.includes('WeakToDive') && enemy.hasDive) risk += 8;
  if (metadata.weaknessTags.includes('LowMobility') && enemy.hasBacklineAccess) risk += 8;
  return risk;
}

function getCategoryPlan(timing: PickTiming, enemyPickCount: number): Array<{ kind: Recommendation['kind']; sorter: (candidate: PickCandidate) => number }> {
  if (timing === 'firstPick') {
    return [
      { kind: 'Best First Pick', sorter: (candidate) => candidate.score },
      { kind: 'Safest Blind Pick', sorter: (candidate) => candidate.scoreBreakdown.safetyValue + getChampionMetadata(candidate.championId).blindPickScore * 4 },
      { kind: 'Best Flex Pick', sorter: (candidate) => getChampionMetadata(candidate.championId).flexValue * 20 + candidate.scoreBreakdown.safetyValue },
      { kind: 'High Comfort Pick', sorter: (candidate) => candidate.scoreBreakdown.playerFit },
    ];
  }
  if (timing === 'late') {
    return [
      { kind: 'Best Final Pick', sorter: (candidate) => candidate.score },
      { kind: 'Best Counter Pick', sorter: (candidate) => candidate.scoreBreakdown.counterPickValue },
      { kind: 'Best Comp Fix', sorter: (candidate) => candidate.scoreBreakdown.teamNeedFit },
      { kind: 'Safest Pick', sorter: (candidate) => candidate.scoreBreakdown.safetyValue + candidate.scoreBreakdown.timingValue },
    ];
  }
  if (enemyPickCount > 0) {
    return [
      { kind: 'Best Counter Pick', sorter: (candidate) => candidate.scoreBreakdown.counterPickValue },
      { kind: 'Best Pick Now', sorter: (candidate) => candidate.score },
      { kind: 'Best Plan Pick', sorter: (candidate) => candidate.scoreBreakdown.draftPlanFit + candidate.scoreBreakdown.teamNeedFit },
      { kind: 'Safest Pick', sorter: (candidate) => candidate.scoreBreakdown.safetyValue + candidate.scoreBreakdown.timingValue },
    ];
  }
  return [
    { kind: 'Best Pick Now', sorter: (candidate) => candidate.score },
    { kind: 'Best Plan Pick', sorter: (candidate) => candidate.scoreBreakdown.draftPlanFit + candidate.scoreBreakdown.synergyStats },
    { kind: 'Best Team Need Pick', sorter: (candidate) => candidate.scoreBreakdown.teamNeedFit },
    { kind: 'Safest Pick', sorter: (candidate) => candidate.scoreBreakdown.safetyValue + candidate.scoreBreakdown.timingValue },
  ];
}
