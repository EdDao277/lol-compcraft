import type { Champion, DamageType, UtilityTag } from '../types/champion';

export type CompAnalysis = {
  counts: Partial<Record<UtilityTag | 'AP damage' | 'AD damage' | 'Scaling' | 'EarlySnowball', number>>;
  damageCounts: Record<DamageType, number>;
  missingTags: Array<UtilityTag | 'AP damage' | 'AD damage'>;
  damageNeed: DamageType | 'Any';
};

const coreTags: UtilityTag[] = ['Engage', 'Frontline', 'CrowdControl', 'Peel', 'Waveclear'];

export function analyzeComp(champions: Champion[]): CompAnalysis {
  const counts: CompAnalysis['counts'] = {};
  const damageCounts: Record<DamageType, number> = { AD: 0, AP: 0, Mixed: 0, True: 0, Low: 0 };

  champions.forEach((champion) => {
    champion.utilityTags.forEach((tag) => {
      counts[tag] = (counts[tag] ?? 0) + 1;
    });
    champion.compTags.forEach((tag) => {
      if (tag === 'Scaling' || tag === 'EarlySnowball') counts[tag] = (counts[tag] ?? 0) + 1;
    });
    damageCounts[champion.damageType] += 1;
    if (champion.damageType === 'AD') counts['AD damage'] = (counts['AD damage'] ?? 0) + 1;
    if (champion.damageType === 'AP') counts['AP damage'] = (counts['AP damage'] ?? 0) + 1;
  });

  const missingTags: CompAnalysis['missingTags'] = [...coreTags.filter((tag) => (counts[tag] ?? 0) === 0)];
  if ((counts['AD damage'] ?? 0) === 0) missingTags.push('AD damage');
  if ((counts['AP damage'] ?? 0) === 0) missingTags.push('AP damage');
  const damageNeed = damageCounts.AP === 0 && damageCounts.AD > 0 ? 'AP' : damageCounts.AD === 0 && damageCounts.AP > 0 ? 'AD' : 'Any';

  return { counts, damageCounts, missingTags, damageNeed };
}

export function sharedTags(a: Champion, b: Champion): UtilityTag[] {
  return a.utilityTags.filter((tag) => b.utilityTags.includes(tag));
}
