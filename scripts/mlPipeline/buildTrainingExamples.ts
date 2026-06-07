import type { NormalizedRole, ProcessedTeam } from '../statsPipeline/types';
import type { DraftTrainingExample, MlDataSource } from './types';

const roles: NormalizedRole[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

export function buildDraftTrainingExamples(teams: ProcessedTeam[], source: MlDataSource): DraftTrainingExample[] {
  const teamsByMatch = new Map<string, ProcessedTeam[]>();
  for (const team of teams) {
    teamsByMatch.set(team.matchId, [...(teamsByMatch.get(team.matchId) ?? []), team]);
  }

  const examples: DraftTrainingExample[] = [];
  for (const matchTeams of teamsByMatch.values()) {
    if (matchTeams.length !== 2) continue;
    const [first, second] = matchTeams;
    if (!first || !second) continue;

    examples.push(buildExample(first, second, source));
    examples.push(buildExample(second, first, source));
  }

  return examples;
}

function buildExample(ally: ProcessedTeam, enemy: ProcessedTeam, source: MlDataSource): DraftTrainingExample {
  return {
    matchId: `${ally.matchId}-${ally.teamId}`,
    patch: ally.patch,
    queueId: ally.queueId,
    region: ally.region,
    source,
    sourceType: source === 'oracle-elixir' ? 'pro' : ally.sourceType,
    side: inferSide(ally.teamId),
    allyChampions: toRoleMap(ally),
    enemyChampions: toRoleMap(enemy),
    allyBans: ally.bans ?? [],
    enemyBans: enemy.bans ?? [],
    labelWin: ally.win ? 1 : 0,
  };
}

function toRoleMap(team: ProcessedTeam) {
  const roleMap = Object.fromEntries(roles.map((role) => [role, ''])) as Record<NormalizedRole, string>;
  for (const participant of team.participants) {
    roleMap[participant.role] = participant.championId;
  }
  return roleMap;
}

function inferSide(teamId: number): DraftTrainingExample['side'] {
  if (teamId === 100) return 'blue';
  if (teamId === 200) return 'red';
  return 'unknown';
}
