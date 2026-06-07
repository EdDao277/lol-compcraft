import { buildTeamCompSignatureFromIds } from '../../src/logic/teamCompSignature';
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
  return buildTeamCompSignatureFromIds(team.participants.map((participant) => participant.championId));
}
