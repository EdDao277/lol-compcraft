import type { ChampionMetadata } from '../types/champion';
import type { Player, PlayerChampionPoolEntry } from '../types/player';
import { clamp, type ScoreBreakdown } from './scoreTypes';

export function scorePlayerFit(player: Player, poolEntry: PlayerChampionPoolEntry, metadata: ChampionMetadata, playerLabel: string): ScoreBreakdown {
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0;

  score += poolEntry.comfortScore * 4;
  reasons.push(`High comfort score for ${playerLabel} (${poolEntry.comfortScore}/10)`);

  if (poolEntry.role === player.primaryRole && metadata.roles.includes(poolEntry.role)) {
    score += 22;
    reasons.push(`${poolEntry.role} matches ${playerLabel}'s assigned role`);
  } else if (metadata.roles.includes(poolEntry.role)) {
    score += 14;
    reasons.push(`${metadata.championId} is tagged for ${poolEntry.role}`);
  } else {
    score += 4;
    risks.push('Role fit is uncertain in champion metadata');
  }

  if (metadata.laneTags.includes('SafeBlind')) score += 8;
  if (metadata.laneTags.includes('Carry')) score += 6;
  if (metadata.laneTags.includes('WeakSide') || metadata.laneTags.includes('LowEconomy')) score += 6;

  if (poolEntry.comfortScore <= 4) risks.push('Low comfort score');
  if (metadata.laneTags.includes('SafeBlind')) reasons.push('Champion metadata marks this as a safe blind');
  if (metadata.laneTags.includes('WeakSide') || metadata.laneTags.includes('LowEconomy')) reasons.push('Champion can function with lower resources');
  if (metadata.laneTags.includes('Carry')) reasons.push('Champion has carry profile in metadata');

  return { score: clamp(score), reasons, risks };
}
