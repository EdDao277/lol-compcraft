export function sampleConfidence(games: number) {
  if (games >= 200) return 1;
  if (games >= 100) return 0.85;
  if (games >= 50) return 0.65;
  if (games >= 20) return 0.35;
  return 0.15;
}

export function roundStat(value: number) {
  return Math.round(value * 10000) / 10000;
}
