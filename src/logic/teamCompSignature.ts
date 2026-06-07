import { getChampionMetadata } from '../data/championDraftMetadata';
import type { Role } from '../types/champion';

export type TeamCompSignature = {
  signature: string;
  has_frontline: boolean;
  has_engage: boolean;
  has_hard_engage: boolean;
  has_peel: boolean;
  has_disengage: boolean;
  has_ap: boolean;
  has_ad: boolean;
  has_mixed_damage: boolean;
  has_scaling: boolean;
  has_poke: boolean;
  has_dive: boolean;
  has_pick: boolean;
  has_waveclear: boolean;
};

export function buildTeamCompSignatureFromRoleMap(championsByRole: Partial<Record<Role, string>>): TeamCompSignature {
  return buildTeamCompSignatureFromIds(Object.values(championsByRole).filter((championId): championId is string => Boolean(championId)));
}

export function buildTeamCompSignatureFromIds(championIds: string[]): TeamCompSignature {
  const metas = championIds.map(getChampionMetadata);
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

  const flags = {
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

  const signature =
    Object.entries(flags)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .sort()
      .join('|') || 'none';

  return { signature, ...flags };
}
