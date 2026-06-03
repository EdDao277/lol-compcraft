import { getChampionMetadata } from '../../src/data/championDraftMetadata';
import { roundStat, sampleConfidence } from './sampleConfidence';
import type { ProcessedTeam, TeamCompSignatureStat } from './types';

type Counter = Omit<TeamCompSignatureStat, 'games' | 'wins' | 'win_rate' | 'confidence'> & { games: number; wins: number };

function key(parts: Array<string | number>) {
  return parts.join('::');
}

export function aggregateTeamCompSignatureStats(teams: ProcessedTeam[]): TeamCompSignatureStat[] {
  const counters = new Map<string, Counter>();

  for (const team of teams) {
    const signature = buildSignature(team);
    const rowKey = key([team.patch, team.region, team.queueId, team.sourceType, signature.signature]);
    const counter = counters.get(rowKey) ?? { ...signature, patch: team.patch, region: team.region, queue_id: team.queueId, source_type: team.sourceType, games: 0, wins: 0 };
    counter.games += 1;
    counter.wins += team.win ? 1 : 0;
    counters.set(rowKey, counter);
  }

  return [...counters.values()].map((counter) => ({
    ...counter,
    win_rate: roundStat(counter.wins / counter.games),
    confidence: sampleConfidence(counter.games),
  }));
}

function buildSignature(team: ProcessedTeam) {
  const metas = team.participants.map((participant) => getChampionMetadata(participant.championId));
  const hasFrontline = metas.some((metadata) => metadata.utilityTags.includes('Frontline'));
  const hasEngage = metas.some((metadata) => metadata.utilityTags.includes('Engage'));
  const hasHardEngage = metas.some((metadata) => metadata.utilityTags.includes('HardEngage'));
  const hasPeel = metas.some((metadata) => metadata.utilityTags.includes('Peel'));
  const hasDisengage = metas.some((metadata) => metadata.utilityTags.includes('Disengage'));
  const hasAP = metas.some((metadata) => metadata.damageType === 'AP' || metadata.damageType === 'Mixed' || metadata.damageType === 'True');
  const hasAD = metas.some((metadata) => metadata.damageType === 'AD' || metadata.damageType === 'Mixed' || metadata.damageType === 'True');
  const hasMixedDamage = hasAP && hasAD;
  const hasScaling = metas.some((metadata) => metadata.compTags.includes('Scaling'));
  const hasPoke = metas.some((metadata) => metadata.compTags.includes('Poke'));
  const hasDive = metas.some((metadata) => metadata.compTags.includes('Dive'));
  const hasPick = metas.some((metadata) => metadata.compTags.includes('Pick'));
  const hasWaveclear = metas.some((metadata) => metadata.utilityTags.includes('Waveclear'));
  const flags = { hasFrontline, hasEngage, hasHardEngage, hasPeel, hasDisengage, hasAP, hasAD, hasMixedDamage, hasScaling, hasPoke, hasDive, hasPick, hasWaveclear };
  const signature = Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .sort()
    .join('|') || 'none';

  return {
    signature,
    has_frontline: hasFrontline,
    has_engage: hasEngage,
    has_hard_engage: hasHardEngage,
    has_peel: hasPeel,
    has_disengage: hasDisengage,
    has_ap: hasAP,
    has_ad: hasAD,
    has_mixed_damage: hasMixedDamage,
    has_scaling: hasScaling,
    has_poke: hasPoke,
    has_dive: hasDive,
    has_pick: hasPick,
    has_waveclear: hasWaveclear,
  };
}
