import { getChampionMetadata } from '../data/championDraftMetadata';
import type { CompTag, UtilityTag } from '../types/champion';
import { draftTemplates } from './draftTemplates';

export type DraftIdentity = CompTag;

export type DraftPlan = {
  identity: DraftIdentity;
  confidence: number;
  strengths: string[];
  missingPieces: string[];
  risks: string[];
};

function countValues<T extends string>(values: T[]): Map<T, number> {
  const counts = new Map<T, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
}

export function detectDraftPlan(allyChampionIds: string[]): DraftPlan {
  const metadatas = allyChampionIds.map(getChampionMetadata);
  const compCounts = countValues(metadatas.flatMap((metadata) => metadata.compTags));
  const utilityTags = metadatas.flatMap((metadata) => metadata.utilityTags);
  const utilityCounts = countValues(utilityTags);

  const identities = Object.keys(draftTemplates) as CompTag[];
  const scoredIdentities = identities.map((identity) => {
    const template = draftTemplates[identity];
    const compScore = (compCounts.get(identity) ?? 0) * 4;
    const utilityScore = template.wants.utilityTags.reduce((sum, tag) => sum + (utilityCounts.get(tag) ?? 0), 0);
    const laneScore = template.wants.laneTags.reduce((sum, tag) => sum + metadatas.filter((metadata) => metadata.laneTags.includes(tag)).length, 0);
    return { identity, score: compScore + utilityScore + laneScore * 0.5 };
  });

  scoredIdentities.sort((a, b) => b.score - a.score);
  const best = scoredIdentities[0];
  const identity = best && best.score > 0 ? best.identity : 'FrontToBack';
  const template = draftTemplates[identity];
  const missingUtility = template.requiredPieces.filter((tag) => !utilityTags.includes(tag));

  const strengths = [
    ...Array.from(compCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([tag, count]) => `${count} ${tag} signal${count > 1 ? 's' : ''}`),
    ...Array.from(utilityCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([tag, count]) => `${count} ${tag} pieces`),
  ].slice(0, 4);

  const missingPieces = missingUtility.map((tag) => `Missing ${formatTag(tag)}`);
  const risks = missingUtility.length > 0 ? template.riskIfMissing : [];
  const confidence = Math.max(10, Math.min(100, Math.round((best?.score ?? 0) * 14)));

  return {
    identity,
    confidence: allyChampionIds.length === 0 ? 15 : confidence,
    strengths: strengths.length > 0 ? strengths : ['No strong draft identity yet'],
    missingPieces,
    risks,
  };
}

function formatTag(tag: UtilityTag | CompTag) {
  return tag.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
}
