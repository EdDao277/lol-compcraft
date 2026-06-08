import { getChampionMetadata } from '../data/championDraftMetadata';
import type { ChampionMetadata, Role } from '../types/champion';
import type { DraftState } from '../types/draft';
import type { ChampionMatchupStatsRow, ChampionRoleStatsRow, ChampionSynergyStatsRow, TeamCompSignatureStatsRow } from '../types/database';
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
import { scoreTeamCompSignatureStats } from './scoreTeamCompSignatureStats';
import { scoreSynergyStats } from './scoreSynergyStats';
import { scoreGeneralDraftAdvisor } from './scoreGeneralDraftAdvisor';
import { scoreDraftWinChanceGain } from './scoreDraftWinChanceGain';
import { clamp } from './scoreTypes';
import type { MlAdvisorScores } from '../services/mlAdvisorService';
import { getMlCandidateKey } from '../services/mlAdvisorService';

type PickCandidate = Recommendation & {
  scoreBreakdown: PickScoreBreakdown;
  poolEntry: PlayerChampionPoolEntry;
};

const roleByPickIndex: Role[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

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
  teamCompSignatureStats: TeamCompSignatureStatsRow[],
  teamAnalysis: TeamCompAnalysis,
  enemyAnalysis: EnemyCompAnalysis,
  timing: PickTiming,
  enemyPickedRoles: Role[],
  filledRoles: Set<Role>,
  mlAdvisorScores: MlAdvisorScores,
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
  const teamCompStats = scoreTeamCompSignatureStats({
    allyChampionIds,
    candidateChampionId: metadata.championId,
    teamCompSignatureStats,
  });
  const statsValue = (statisticalSynergy.score + networkStats.score + teamCompStats.score) / 3;
  const timingValue = scorePickTiming(metadata, timing, allyDraftState.ourSide, teamNeedFit.score, statsValue, adjustedCounterValue.score);
  const roleResponseFit = scoreRoleResponseFit(poolEntry.role, enemyPickedRoles, filledRoles, timing);
  const safetyValue = scoreSafetyValue(metadata);
  const advisorScore = scoreGeneralDraftAdvisor({
    metadata,
    candidateRole: poolEntry.role,
    timing,
    allyChampionIds,
    enemyChampionIds,
    teamAnalysis,
    enemyAnalysis,
    teamNeedFit: teamNeedFit.score,
    counterValue: adjustedCounterValue.score,
    statValue: statsValue,
  });
  const predictedWinChanceGain = scoreDraftWinChanceGain({
    candidate: metadata,
    allyChampionIds,
    enemyChampionIds,
    teamNeedFit: teamNeedFit.score,
    counterValue: adjustedCounterValue.score,
    statValue: statsValue,
    safetyValue: safetyValue.score,
  });
  const mlAdvisorScore = mlAdvisorScores[getMlCandidateKey(player.id, metadata.championId, poolEntry.role)];
  const winGainScore = mlAdvisorScore?.score ?? predictedWinChanceGain.score;
  const ruleScore = scoreRuleDraftScore({
    timing,
    pickTimingFit: timingValue.score,
    draftPlanFit: draftPlanFit.score,
    teamNeedFit: teamNeedFit.score,
    roleResponseFit: roleResponseFit.score,
    counterValue: adjustedCounterValue.score,
    safetyValue: safetyValue.score,
    advisorScore: advisorScore.score,
    flexValue: metadata.flexValue,
  });
  const counterSynergyStats = clamp(adjustedCounterValue.score * 0.45 + statsValue * 0.4 + roleResponseFit.score * 0.15);
  const riskPenalty = scoreRiskPenalty(metadata, poolEntry, allyChampionIds, enemyPools, timing === 'firstPick' || timing === 'responsePick' || timing === 'early' ? 'early' : timing === 'middle' ? 'middle' : 'late');
  const score = scoreCandidate({
    ruleScore,
    comfortScore: playerFit.score,
    teamNeedFit: teamNeedFit.score,
    counterSynergyStats,
    predictedWinChanceGain: winGainScore,
    riskPenalty: riskPenalty.score + getSituationRiskPenalty(metadata, timing, teamAnalysis, enemyAnalysis),
  });

  const synergyReasons = statisticalSynergy.reasons.filter((reason) => !reason.includes('No statistical synergy data yet'));
  const networkReasons = networkStats.reasons.filter((reason) => !reason.includes('No network matchup data yet'));
  const teamCompReasons = teamCompStats.reasons.filter((reason) => !reason.includes('No team-comp signature data yet'));
  const reasons = [
    ...roleResponseFit.reasons,
    ...teamNeedFit.reasons,
    ...adjustedCounterValue.reasons,
    ...(mlAdvisorScore?.available ? getMlAdvisorReasons(mlAdvisorScore) : predictedWinChanceGain.reasons),
    ...advisorScore.reasons,
    ...networkReasons,
    ...teamCompReasons,
    ...draftPlanFit.reasons,
    ...synergyReasons,
    ...timingValue.reasons,
    ...safetyValue.reasons,
    ...playerFit.reasons,
  ].slice(0, 5);
  const risks = [
    ...roleResponseFit.risks,
    ...teamNeedFit.risks,
    ...adjustedCounterValue.risks,
    ...(mlAdvisorScore && !mlAdvisorScore.available ? [mlAdvisorScore.reason ?? 'ML advisor offline; using neutral win-gain score'] : predictedWinChanceGain.risks),
    ...advisorScore.risks,
    ...networkStats.risks,
    ...teamCompStats.risks,
    ...draftPlanFit.risks,
    ...statisticalSynergy.risks,
    ...timingValue.risks,
    ...safetyValue.risks,
    ...riskPenalty.risks,
  ].slice(0, 4);

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
      comfortScore: playerFit.score,
      ruleScore,
      draftPlanFit: draftPlanFit.score,
      teamNeedFit: teamNeedFit.score,
      roleResponseFit: roleResponseFit.score,
      counterPickValue: adjustedCounterValue.score,
      timingValue: timingValue.score,
      synergyStats: statisticalSynergy.score,
      networkStats: networkStats.score,
      teamCompStats: teamCompStats.score,
      counterSynergyStats,
      advisorScore: advisorScore.score,
      predictedWinChanceGain: winGainScore,
      safetyValue: safetyValue.score,
      riskPenalty: riskPenalty.score,
    },
    draftPlanIdentity: teamAnalysis.currentPlan,
    draftPhase: timing,
    poolEntry,
  };
}

function getMlAdvisorReasons(mlAdvisorScore: NonNullable<MlAdvisorScores[string]>) {
  const reasons = [...(mlAdvisorScore.explanations ?? [])];
  if (reasons.length === 0) {
    reasons.push(`ML advisor projects ${(mlAdvisorScore.winGain * 100).toFixed(1)}% win-chance change`);
  }
  if (mlAdvisorScore.pickRankerScore !== undefined && mlAdvisorScore.pickRankerScore >= 65) {
    reasons.push(`Draft-coach ranker score ${mlAdvisorScore.pickRankerScore}/100`);
  }
  if (mlAdvisorScore.enemyDenialScore !== undefined && mlAdvisorScore.enemyDenialScore >= 65) {
    reasons.push(`Enemy intent/denial score ${mlAdvisorScore.enemyDenialScore}/100`);
  }
  return reasons.slice(0, 3);
}

function takeTopUnique(candidates: PickCandidate[], usedIds: Set<string>, sorter: (candidate: PickCandidate) => number, kind: Recommendation['kind'], limit: number): PickCandidate[] {
  const picks: PickCandidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => sorter(b) - sorter(a))) {
    if (picks.length >= limit) break;
    if (usedIds.has(candidate.id) || usedIds.has(candidate.championId)) continue;
    usedIds.add(candidate.id);
    usedIds.add(candidate.championId);
    const categoryReason = getCategoryReason(candidate, kind);
    picks.push({
      ...candidate,
      kind,
      reasons: categoryReason && !candidate.reasons.includes(categoryReason) ? [categoryReason, ...candidate.reasons].slice(0, 5) : candidate.reasons,
    });
  }
  return picks;
}

function getCategoryReason(candidate: PickCandidate, kind: Recommendation['kind']): string | null {
  if (kind === 'Best Pick Now') {
    return `Best overall score from player fit, timing, team needs, counters, synergy, and safety`;
  }
  if (kind === 'Best First Pick') {
    return `Best first pick because it combines comfort, blind safety, flexibility, and general team value`;
  }
  if (kind === 'Best Response Pick') {
    return `Best red-side response because it answers the enemy opener while still fitting player comfort and team needs`;
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
  teamCompSignatureStats: TeamCompSignatureStatsRow[] = [],
  mlAdvisorScores: MlAdvisorScores = {},
): Recommendation[] {
  const unavailable = unavailableChampionIds(draft.slots);
  const allyChampionIds = pickedChampionIds(draft.slots, 'our');
  const enemyChampionIds = pickedChampionIds(draft.slots, 'enemy');
  const filledPlayers = filledPickIndexes(draft.slots, 'our');
  const filledRoles = new Set(getFilledAllyRoles(draft));
  const teamAnalysis = analyzeTeamComp(allyChampionIds);
  const enemyAnalysis = analyzeEnemyComp(enemyChampionIds);
  const timing = getPickTiming(allyChampionIds.length, enemyChampionIds.length, draft.ourSide, draft.format);
  const enemyPickedRoles = getEnemyPickedRoles(draft);

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
              teamCompSignatureStats,
              teamAnalysis,
              enemyAnalysis,
              timing,
              enemyPickedRoles,
              filledRoles,
              mlAdvisorScores,
            ),
          )
          .filter((candidate): candidate is PickCandidate => Boolean(candidate)),
  );

  const usedIds = new Set<string>();
  const perCategoryLimit = getPerCategoryLimit(candidates.length);
  return getCategoryPlan(timing, enemyChampionIds.length).flatMap(({ kind, sorter }) => takeTopUnique(candidates, usedIds, sorter, kind, perCategoryLimit));
}

function getPerCategoryLimit(candidateCount: number) {
  if (candidateCount <= 4) return 1;
  if (candidateCount <= 10) return 3;
  if (candidateCount <= 20) return 5;
  return 8;
}

function scoreCandidate(scores: {
  ruleScore: number;
  comfortScore: number;
  teamNeedFit: number;
  counterSynergyStats: number;
  predictedWinChanceGain: number;
  riskPenalty: number;
}) {
  return clamp(
    scores.ruleScore * 0.3 +
      scores.comfortScore * 0.25 +
      scores.teamNeedFit * 0.2 +
      scores.counterSynergyStats * 0.15 +
      scores.predictedWinChanceGain * 0.1 -
      scores.riskPenalty,
  );
}

function scoreRuleDraftScore(scores: {
  timing: PickTiming;
  pickTimingFit: number;
  draftPlanFit: number;
  teamNeedFit: number;
  roleResponseFit: number;
  counterValue: number;
  safetyValue: number;
  advisorScore: number;
  flexValue: number;
}) {
  if (scores.timing === 'firstPick') {
    const flexScore = clamp(50 + scores.flexValue * 10);
    return clamp(scores.safetyValue * 0.32 + flexScore * 0.16 + scores.teamNeedFit * 0.17 + scores.pickTimingFit * 0.18 + scores.advisorScore * 0.17);
  }
  if (scores.timing === 'responsePick') {
    return clamp(scores.counterValue * 0.28 + scores.roleResponseFit * 0.27 + scores.teamNeedFit * 0.17 + scores.safetyValue * 0.1 + scores.pickTimingFit * 0.1 + scores.advisorScore * 0.08);
  }
  if (scores.timing === 'late') {
    return clamp(scores.counterValue * 0.26 + scores.teamNeedFit * 0.24 + scores.roleResponseFit * 0.16 + scores.draftPlanFit * 0.16 + scores.safetyValue * 0.1 + scores.advisorScore * 0.08);
  }
  return clamp(scores.pickTimingFit * 0.18 + scores.teamNeedFit * 0.22 + scores.counterValue * 0.18 + scores.roleResponseFit * 0.16 + scores.safetyValue * 0.14 + scores.draftPlanFit * 0.12);
}

function getEnemyPickedRoles(draft: DraftState): Role[] {
  return draft.slots
    .filter((slot) => slot.team === 'enemy' && slot.type === 'pick' && slot.championId)
    .map((slot) => {
      const pickIndex = Number(slot.id.split('-').at(-1));
      return slot.assignedRole ?? roleByPickIndex[(slot.assignedPlayerSlot ?? pickIndex) - 1];
    })
    .filter((role): role is Role => Boolean(role));
}

function getNaturalAnswerRoles(enemyRole: Role): Role[] {
  if (enemyRole === 'ADC' || enemyRole === 'Support') return ['ADC', 'Support'];
  return [enemyRole];
}

function scoreRoleResponseFit(candidateRole: Role, enemyPickedRoles: Role[], filledRoles: Set<Role>, timing: PickTiming) {
  if (enemyPickedRoles.length === 0) {
    return { score: 50, reasons: [] as string[], risks: [] as string[] };
  }

  let score = timing === 'responsePick' ? 55 : 50;
  const reasons: string[] = [];
  const risks: string[] = [];
  const answerRoles = new Set(enemyPickedRoles.flatMap(getNaturalAnswerRoles).filter((role) => !filledRoles.has(role)));
  const enemyBotRolePicked = enemyPickedRoles.includes('ADC') || enemyPickedRoles.includes('Support');
  const ourBotRoleOpen = !filledRoles.has('ADC') || !filledRoles.has('Support');

  if (answerRoles.has(candidateRole)) {
    score += timing === 'responsePick' ? 32 : 24;
    const enemyRoles = enemyPickedRoles.filter((role) => getNaturalAnswerRoles(role).includes(candidateRole));
    const roleText = enemyRoles.some((role) => role === 'ADC' || role === 'Support') ? 'bot-lane' : enemyRoles.join('/');
    reasons.push(`Answers revealed enemy ${roleText} pick with our ${candidateRole} slot`);
  } else if (enemyBotRolePicked && ourBotRoleOpen && (candidateRole === 'ADC' || candidateRole === 'Support')) {
    score += 14;
    reasons.push('Responds to the revealed enemy bot lane');
  } else if (timing === 'responsePick') {
    score -= 8;
    risks.push('Does not directly answer the enemy role already revealed');
  }

  return { score: clamp(score), reasons, risks };
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
  } else if (timing === 'responsePick') {
    score = counterPickValue * 0.55 + teamNeedFit * 0.25 + metadata.blindPickScore * 3 + metadata.flexValue * 4;
    reasons.push('Red-side response rewards answering the enemy opener');
    if (metadata.laneTags.includes('SafeBlind')) reasons.push('Still stable if enemy follow-up is unknown');
    if (counterPickValue < 45) risks.push('Limited counter value into current enemy pick');
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
  if (timing === 'responsePick' && metadata.weaknessTags.includes('WeakToDive') && enemy.hasDive) risk += 6;
  if (timing === 'responsePick' && metadata.weaknessTags.includes('LowMobility') && enemy.hasBacklineAccess) risk += 6;
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
  if (timing === 'responsePick') {
    return [
      { kind: 'Best Response Pick', sorter: (candidate) => candidate.score },
      { kind: 'Best Counter Pick', sorter: (candidate) => candidate.scoreBreakdown.counterPickValue + candidate.scoreBreakdown.networkStats },
      { kind: 'Best Team Need Pick', sorter: (candidate) => candidate.scoreBreakdown.teamNeedFit },
      { kind: 'Safest Pick', sorter: (candidate) => candidate.scoreBreakdown.safetyValue + candidate.scoreBreakdown.timingValue },
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
