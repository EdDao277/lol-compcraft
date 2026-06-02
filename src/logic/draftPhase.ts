export type DraftPhase = 'early' | 'middle' | 'late';

export function getDraftPhase(allyPickCount: number): DraftPhase {
  if (allyPickCount <= 1) return 'early';
  if (allyPickCount <= 3) return 'middle';
  return 'late';
}
