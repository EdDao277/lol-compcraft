import { getChampionMetadata } from '../data/championDraftMetadata';
import type { ChampionMetadata } from '../types/champion';
import type { DraftState } from '../types/draft';
import type { ChampionSynergyStatsRow } from '../types/database';
import type { EnemyPoolEntry, Player, PlayerChampionPoolEntry } from '../types/player';
import type { PickScoreBreakdown, Recommendation } from '../types/recommendation';
import { getChampion } from './championData';
import { detectDraftPlan } from './draftPlan';
import { getDraftPhase } from './draftPhase';
import { filledPickIndexes, getFilledAllyRoles, pickedChampionIds, unavailableChampionIds } from './draftUtils';
import { scoreCounterPick } from './scoreCounterPick';
import { scoreDraftPlanFit } from './scoreDraftPlanFit';
import { scorePlayerFit } from './scorePlayerFit';
import { scoreRiskPenalty } from './scoreRiskPenalty';
import { scoreSynergyStats } from './scoreSynergyStats';
import { scoreTeamNeedFit } from './scoreTeamNeedFit';
import { scoreTiming } from './scoreTiming';
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
): PickCandidate | null {
  const champion = getChampion(metadata.championId);
  if (!champion) return null;

  const draftPlan = detectDraftPlan(allyChampionIds);
  const draftPhase = getDraftPhase(allyChampionIds.length);
  const playerFit = scorePlayerFit(player, poolEntry, metadata, playerLabel);
  const draftPlanFit = scoreDraftPlanFit(metadata, allyChampionIds, draftPlan);
  const teamNeedFit = scoreTeamNeedFit(metadata, allyChampionIds);
  const counterPickValue = scoreCounterPick(metadata, enemyChampionIds, enemyPools, allyDraftState);
  const statisticalSynergy = scoreSynergyStats({
    candidateChampionId: metadata.championId,
    candidateRole: poolEntry.role,
    allyChampionIds,
    stats: synergyStats,
  });
  const timingValue = scoreTiming(metadata, draftPhase, draftPlanFit.score, teamNeedFit.score, counterPickValue.score);
  const riskPenalty = scoreRiskPenalty(metadata, poolEntry, allyChampionIds, enemyPools, draftPhase);

  const score = clamp(
    playerFit.score * 0.3 +
      draftPlanFit.score * 0.2 +
      teamNeedFit.score * 0.2 +
      counterPickValue.score * 0.2 +
      timingValue.score * 0.1 -
      riskPenalty.score +
      (statisticalSynergy.score - 50) * 0.1,
  );

  const synergyReasons = statisticalSynergy.reasons.filter((reason) => !reason.includes('No statistical synergy data yet'));
  const reasons = [...playerFit.reasons, ...draftPlanFit.reasons, ...teamNeedFit.reasons, ...counterPickValue.reasons, ...synergyReasons, ...timingValue.reasons].slice(0, 5);
  const risks = [...playerFit.risks, ...draftPlanFit.risks, ...teamNeedFit.risks, ...counterPickValue.risks, ...statisticalSynergy.risks, ...timingValue.risks, ...riskPenalty.risks].slice(0, 4);

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
      counterPickValue: counterPickValue.score,
      timingValue: timingValue.score,
      synergyStats: statisticalSynergy.score,
      riskPenalty: riskPenalty.score,
    },
    draftPlanIdentity: draftPlan.identity,
    draftPhase,
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
    return `Best overall score from player fit, plan fit, team needs, counter value, and timing`;
  }
  if (kind === 'Safest Pick') {
    return `Safest option because timing, player fit, and champion blind value are strong`;
  }
  if (kind === 'Best Plan Pick') {
    return `Best fit for the current ${candidate.draftPlanIdentity ?? 'draft'} plan`;
  }
  if (kind === 'Best Counter Pick') {
    return `Best counter value into the current enemy picks and pools`;
  }
  if (kind === 'High Upside Pick') {
    return `Highest upside from late value, counter value, and timing`;
  }
  return null;
}

export function recommendPicks(draft: DraftState, players: Player[], enemyPools: EnemyPoolEntry[], synergyStats: ChampionSynergyStatsRow[] = []): Recommendation[] {
  const unavailable = unavailableChampionIds(draft.slots);
  const allyChampionIds = pickedChampionIds(draft.slots, 'our');
  const enemyChampionIds = pickedChampionIds(draft.slots, 'enemy');
  const filledPlayers = filledPickIndexes(draft.slots, 'our');
  const filledRoles = new Set(getFilledAllyRoles(draft));

  const candidates = players.flatMap((player, playerIndex) =>
    filledPlayers.has(playerIndex)
      ? []
      : player.championPool
          .filter((entry) => entry.championId && !unavailable.has(entry.championId) && !filledRoles.has(entry.role))
          .map((entry) => buildCandidate(getChampionMetadata(entry.championId as string), entry, player, `Player ${playerIndex + 1}`, allyChampionIds, enemyChampionIds, enemyPools, draft, synergyStats))
          .filter((candidate): candidate is PickCandidate => Boolean(candidate)),
  );

  const usedIds = new Set<string>();
  return [
    takeTopUnique(candidates, usedIds, (candidate) => candidate.score, 'Best Pick Now'),
    takeTopUnique(candidates, usedIds, (candidate) => candidate.scoreBreakdown.timingValue + candidate.scoreBreakdown.playerFit + getChampionMetadata(candidate.championId).blindPickScore * 3, 'Safest Pick'),
    takeTopUnique(candidates, usedIds, (candidate) => candidate.scoreBreakdown.draftPlanFit + candidate.scoreBreakdown.teamNeedFit, 'Best Plan Pick'),
    takeTopUnique(candidates, usedIds, (candidate) => candidate.scoreBreakdown.counterPickValue, 'Best Counter Pick'),
    takeTopUnique(candidates, usedIds, (candidate) => getChampionMetadata(candidate.championId).latePickValue * 5 + candidate.scoreBreakdown.counterPickValue + candidate.scoreBreakdown.timingValue, 'High Upside Pick'),
  ].filter((recommendation): recommendation is PickCandidate => Boolean(recommendation));
}
