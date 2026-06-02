import type { MatchDetail, NormalizedRole, ProcessedTeam } from './types';

const positionToRole: Record<string, NormalizedRole | undefined> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  MID: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support',
  SUPPORT: 'Support',
};

const championIdAliases: Record<string, string> = {
  FiddleSticks: 'Fiddlesticks',
  Wukong: 'MonkeyKing',
};

function normalizeRole(teamPosition?: string, individualPosition?: string) {
  return positionToRole[teamPosition ?? ''] ?? positionToRole[individualPosition ?? ''] ?? null;
}

function normalizeChampionId(championName: string) {
  return championIdAliases[championName] ?? championName;
}

export function processMatches(matches: MatchDetail[]) {
  const teams: ProcessedTeam[] = [];

  for (const match of matches) {
    const participants = match.info.participants
      .map((participant) => {
        const role = normalizeRole(participant.teamPosition, participant.individualPosition);
        if (!role) return null;
        return {
          matchId: match.metadata.matchId,
          championId: normalizeChampionId(participant.championName),
          championNumericId: participant.championId,
          championName: participant.championName,
          role,
          teamId: participant.teamId,
          win: participant.win,
        };
      })
      .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant));

    for (const teamId of [...new Set(participants.map((participant) => participant.teamId))]) {
      const teamParticipants = participants.filter((participant) => participant.teamId === teamId);
      if (teamParticipants.length !== 5) continue;
      teams.push({
        matchId: match.metadata.matchId,
        teamId,
        win: teamParticipants.some((participant) => participant.win),
        participants: teamParticipants,
      });
    }
  }

  return teams;
}
