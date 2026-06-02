export type ScoreBreakdown = {
  score: number;
  reasons: string[];
  risks: string[];
};

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function hasAny<T>(source: T[], targets: T[]) {
  return targets.some((target) => source.includes(target));
}
