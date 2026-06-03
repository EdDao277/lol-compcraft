import { getChampionMetadata } from '../data/championDraftMetadata';
import type { ChampionMetadata, CompTag } from '../types/champion';
import type { ChampionMatchupStatsRow } from '../types/database';
import type { DraftState } from '../types/draft';
import type { EnemyPoolEntry, Player } from '../types/player';
import type { Recommendation } from '../types/recommendation';
import { champions } from './championData';
import { detectDraftPlan } from './draftPlan';
import { draftTemplates } from './draftTemplates';
import { pickedChampionIds, unavailableChampionIds } from './draftUtils';
import { clamp, hasAny } from './scoreTypes';

type BanCandidate = Recommendation & {
  planProtectionScore: number;
  enemyComfortScore: number;
  flexBlindScore: number;
};

const planPunishTags: Record<CompTag, { compTags: CompTag[]; threatTags: ChampionMetadata['threatTags']; utilityTags: ChampionMetadata['utilityTags'] }> = {
  Pick: { compTags: [], threatTags: ['AntiEngage', 'AntiDive'], utilityTags: ['Disengage', 'Peel'] },
  Dive: { compTags: ['Poke'], threatTags: ['AntiDive'], utilityTags: ['Disengage', 'Peel'] },
  FrontToBack: { compTags: ['Dive'], threatTags: ['DiveThreat'], utilityTags: ['BacklineAccess', 'HardEngage'] },
  Poke: { compTags: ['Dive', 'EarlySnowball'], threatTags: ['DiveThreat'], utilityTags: ['HardEngage', 'BacklineAccess'] },
  SplitPush: { compTags: ['Pick', 'Dive'], threatTags: ['SplitPushThreat'], utilityTags: ['HardEngage', 'CrowdControl'] },
  Scaling: { compTags: ['EarlySnowball', 'Dive'], threatTags: ['EarlySnowballThreat'], utilityTags: ['HardEngage'] },
  EarlySnowball: { compTags: ['Scaling'], threatTags: ['ScalingThreat'], utilityTags: ['Peel', 'Disengage'] },
};

function buildBanCandidate(metadata: ChampionMetadata, draft: DraftState, players: Player[], enemyPools: EnemyPoolEntry[], matchupStats: ChampionMatchupStatsRow[]): BanCandidate | null {
  const champion = champions.find((item) => item.id === metadata.championId);
  if (!champion) return null;

  const allyChampionIds = pickedChampionIds(draft.slots, 'our');
  const allyMetas = allyChampionIds.map(getChampionMetadata);
  const plan = detectDraftPlan(allyChampionIds);
  const template = draftTemplates[plan.identity];
  const punishTags = planPunishTags[plan.identity];
  const enemyPoolEntries = enemyPools.filter((entry) => entry.championId === metadata.championId);
  const ourPoolIds = new Set(players.flatMap((player) => player.championPool.map((entry) => entry.championId).filter(Boolean)));
  const ourPoolMetas = players.flatMap((player) => player.championPool.map((entry) => (entry.championId ? getChampionMetadata(entry.championId) : undefined))).filter((item): item is ChampionMetadata => Boolean(item));
  const allyMissingUtility = template.requiredPieces.filter((tag) => !allyMetas.flatMap((ally) => ally.utilityTags).includes(tag));
  const allyUtilityTags = allyMetas.flatMap((ally) => ally.utilityTags);
  const allyWeaknessTags = allyMetas.flatMap((ally) => ally.weaknessTags);
  const reasons: string[] = [];
  const risks: string[] = [];

  let planProtectionScore = 25;
  const directCounteredAlly = allyMetas.find((ally) => metadata.counters.includes(ally.championId) || ally.counteredBy.includes(metadata.championId));
  if (directCounteredAlly) {
    planProtectionScore += 28;
    reasons.push(`Directly counters our ${directCounteredAlly.championId}`);
  }
  if (hasAny(metadata.compTags, punishTags.compTags) || hasAny(metadata.threatTags, punishTags.threatTags) || hasAny(metadata.utilityTags, punishTags.utilityTags)) {
    planProtectionScore += 35;
    reasons.push(`Protects our ${plan.identity} plan`);
  }
  if (template.hates.counterTags.some((tag) => metadata.counterTags.includes(tag))) {
    planProtectionScore += 18;
    reasons.push(`Counters tools our ${plan.identity} draft wants to avoid`);
  }
  if (allyMissingUtility.some((tag) => metadata.utilityTags.includes(tag))) {
    planProtectionScore += 8;
    reasons.push('Punishes one of our missing pieces');
  }
  if (allyUtilityTags.includes('Frontline') && (metadata.counterTags.includes('CountersTanks') || metadata.threatTags.includes('TankKiller'))) {
    planProtectionScore += 22;
    reasons.push('Punishes our frontline or tank-heavy draft');
  }
  if (allyWeaknessTags.includes('LowMobility') && (metadata.counterTags.includes('CountersLowMobility') || metadata.threatTags.includes('ImmobileCarryPunish'))) {
    planProtectionScore += 16;
    reasons.push('Punishes our low-mobility champions');
  }
  if (allyWeaknessTags.includes('WeakToDive') && metadata.threatTags.includes('DiveThreat')) {
    planProtectionScore += 14;
    reasons.push('Can punish our dive weakness');
  }
  if (allyWeaknessTags.includes('WeakToPoke') && metadata.threatTags.includes('PokeThreat')) {
    planProtectionScore += 14;
    reasons.push('Can punish our poke weakness');
  }

  let enemyComfortScore = 15;
  if (enemyPoolEntries.length > 0) {
    const topThreat = Math.max(...enemyPoolEntries.map((entry) => entry.threatScore));
    enemyComfortScore += topThreat * 7;
    reasons.push(`Known enemy pool threat (${topThreat}/10)`);
  }

  let flexBlindScore = metadata.blindPickScore * 5 + metadata.flexValue * 8;
  if (metadata.blindPickScore >= 8) reasons.push('Safe blind pick for enemy team');
  if (metadata.flexValue > 1) reasons.push('High-value flex pick');
  if (!ourPoolIds.has(metadata.championId)) reasons.push('Not currently covered in our team pool');
  if (!ourPoolMetas.some((poolMeta) => poolMeta.counters.includes(metadata.championId) || poolMeta.counterTags.some((tag) => metadata.weaknessTags.some((weakness) => tag.toLowerCase().includes(weakness.replace('WeakTo', '').toLowerCase()))))) {
    flexBlindScore += 6;
    reasons.push('Our team pool has limited clear answers');
  }
  if (ourPoolIds.has(metadata.championId)) risks.push('Also removes one of our playable options');

  const networkThreat = scoreBanNetworkThreat(metadata, allyChampionIds, players, matchupStats);
  if (networkThreat.score > 0) {
    planProtectionScore += networkThreat.score;
    reasons.push(...networkThreat.reasons);
  }

  const score = clamp(Math.max(planProtectionScore, enemyComfortScore, flexBlindScore));

  return {
    id: `ban-${metadata.championId}`,
    kind: 'Ban',
    championId: metadata.championId,
    championName: champion.name,
    championIcon: champion.imageUrl,
    playerName: enemyPoolEntries[0] ? `Enemy ${enemyPoolEntries[0].role}` : 'Enemy team',
    role: enemyPoolEntries[0]?.role ?? metadata.roles[0] ?? 'Mid',
    score,
    reasons: reasons.slice(0, 4),
    risks: risks.length > 0 ? risks.slice(0, 2) : ['Confirm this ban matters more than enemy comfort picks'],
    draftPlanIdentity: plan.identity,
    planProtectionScore: clamp(planProtectionScore),
    enemyComfortScore: clamp(enemyComfortScore),
    flexBlindScore: clamp(flexBlindScore),
  };
}

function topBy(candidates: BanCandidate[], sorter: (candidate: BanCandidate) => number, kind: Recommendation['kind']): BanCandidate | undefined {
  const candidate = [...candidates].sort((a, b) => sorter(b) - sorter(a))[0];
  return candidate ? { ...candidate, kind, score: clamp(sorter(candidate)) } : undefined;
}

export function recommendBans(draft: DraftState, players: Player[], enemyPools: EnemyPoolEntry[], matchupStats: ChampionMatchupStatsRow[] = []): Recommendation[] {
  const unavailable = unavailableChampionIds(draft.slots);
  const candidates = champions
    .filter((champion) => !unavailable.has(champion.id))
    .map((champion) => buildBanCandidate(getChampionMetadata(champion.id), draft, players, enemyPools, matchupStats))
    .filter((candidate): candidate is BanCandidate => Boolean(candidate));

  return [
    topBy(candidates, (candidate) => candidate.planProtectionScore, 'Best Plan Protection Ban'),
    topBy(candidates, (candidate) => candidate.enemyComfortScore, 'Best Enemy Comfort Ban'),
    topBy(candidates, (candidate) => candidate.flexBlindScore, 'Best Flex/Blind Ban'),
  ].filter((recommendation): recommendation is BanCandidate => Boolean(recommendation));
}

function scoreBanNetworkThreat(metadata: ChampionMetadata, allyChampionIds: string[], players: Player[], matchupStats: ChampionMatchupStatsRow[]) {
  if (matchupStats.length === 0) return { score: 0, reasons: [] as string[] };
  let score = 0;
  const reasons: string[] = [];

  const strongIntoPickedAlly = matchupStats
    .filter((row) => row.champion_id === metadata.championId && row.enemy_champion_id && allyChampionIds.includes(row.enemy_champion_id) && Number(row.delta_vs_baseline ?? 0) > 0)
    .sort((a, b) => Number(b.delta_vs_baseline ?? 0) * Number(b.confidence ?? 0.15) - Number(a.delta_vs_baseline ?? 0) * Number(a.confidence ?? 0.15))[0];

  if (strongIntoPickedAlly) {
    const delta = Number(strongIntoPickedAlly.delta_vs_baseline ?? 0);
    score += clamp(delta * 100 * 0.8 * Number(strongIntoPickedAlly.confidence ?? 0.15));
    reasons.push(`Network stats show this can punish our ${strongIntoPickedAlly.enemy_champion_id}`);
  }

  const poolChampionIds = new Set(players.flatMap((player) => player.championPool.map((entry) => entry.championId).filter(Boolean)));
  const poorPoolAnswer = matchupStats
    .filter((row) => row.champion_id && poolChampionIds.has(row.champion_id) && row.enemy_champion_id === metadata.championId && Number(row.delta_vs_baseline ?? 0) < 0)
    .sort((a, b) => Number(a.delta_vs_baseline ?? 0) * Number(a.confidence ?? 0.15) - Number(b.delta_vs_baseline ?? 0) * Number(b.confidence ?? 0.15))[0];

  if (poorPoolAnswer) {
    const delta = Math.abs(Number(poorPoolAnswer.delta_vs_baseline ?? 0));
    score += clamp(delta * 100 * 0.5 * Number(poorPoolAnswer.confidence ?? 0.15));
    reasons.push(`Our pool has weak network answers into this champion`);
  }

  return { score, reasons: reasons.slice(0, 2) };
}
