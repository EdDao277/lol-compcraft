import type { Role } from '../types/champion';
import type { Player } from '../types/player';
import { addPlayerChampion, deletePlayerChampionsByPlayer, getPlayerChampions } from './playerChampionService';
import { createPlayer, getPlayersByTeam, updatePlayer } from './playerService';
import { createTeam, getTeams, updateTeam } from './teamService';

const roles: Role[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const defaultTeamName = 'My Team';

export type LoadedTeamData = {
  teamId: string | null;
  teamName: string;
  players: Player[];
  source: 'supabase' | 'mock';
};

export async function loadTeamPlayersOrMock(): Promise<LoadedTeamData> {
  const teams = await getTeams();
  const team = teams[0];
  if (!team) {
    return {
      teamId: null,
      teamName: defaultTeamName,
      players: createBlankPlayers(),
      source: 'supabase',
    };
  }

  const playerRows = await getPlayersByTeam(team.id);
  if (playerRows.length === 0) {
    return {
      teamId: team.id,
      teamName: team.name,
      players: createBlankPlayers(),
      source: 'supabase',
    };
  }

  const players = await Promise.all(
    playerRows.map(async (playerRow, index): Promise<Player> => {
      const championRows = await getPlayerChampions(playerRow.id);
      return {
        id: playerRow.id,
        name: playerRow.name,
        primaryRole: normalizeRole(playerRow.primary_role, roles[index] ?? 'Top'),
        championPool: championRows.map((row) => ({
          championId: row.champion_id,
          role: normalizeRole(row.role, normalizeRole(playerRow.primary_role, roles[index] ?? 'Top')),
          comfortScore: row.comfort_score ?? 5,
        })),
      };
    }),
  );

  return { teamId: team.id, teamName: team.name, players: fillMissingRoleSlots(players), source: 'supabase' };
}

export async function saveTeamPlayersToSupabase(teamName: string, players: Player[]): Promise<LoadedTeamData | null> {
  const teams = await getTeams();
  const existingTeam = teams[0];
  const team = existingTeam ? await updateTeam(existingTeam.id, { name: teamName.trim() || defaultTeamName }) : await createTeam(teamName.trim() || defaultTeamName);
  if (!team) return null;

  const existingPlayers = await getPlayersByTeam(team.id);
  const savedPlayers: Player[] = [];

  for (const [index, role] of roles.entries()) {
    const localPlayer = players[index] ?? createBlankPlayers()[index];
    const existingPlayer = existingPlayers.find((player) => normalizeRole(player.primary_role, role) === role);
    const playerRow = existingPlayer
      ? await updatePlayer(existingPlayer.id, {
          team_id: team.id,
          name: localPlayer.name.trim() || `Player ${index + 1}`,
          primary_role: role,
        })
      : await createPlayer({
          team_id: team.id,
          name: localPlayer.name.trim() || `Player ${index + 1}`,
          primary_role: role,
        });

    if (!playerRow) continue;

    await deletePlayerChampionsByPlayer(playerRow.id);
    for (const entry of localPlayer.championPool) {
      if (!entry.championId) continue;
      await addPlayerChampion({
        player_id: playerRow.id,
        champion_id: entry.championId,
        role: entry.role,
        comfort_score: entry.comfortScore,
      });
    }

    savedPlayers.push({
      id: playerRow.id,
      name: playerRow.name,
      primaryRole: normalizeRole(playerRow.primary_role, role),
      championPool: localPlayer.championPool.filter((entry) => entry.championId),
    });
  }

  return {
    teamId: team.id,
    teamName: team.name,
    players: fillMissingRoleSlots(savedPlayers),
    source: 'supabase',
  };
}

function normalizeRole(value: string | null | undefined, fallback: Role): Role {
  return roles.includes(value as Role) ? (value as Role) : fallback;
}

export function createBlankPlayers(): Player[] {
  return roles.map((role, index) => ({
    id: `local-player-${index + 1}`,
    name: '',
    primaryRole: role,
    championPool: [],
  }));
}

function fillMissingRoleSlots(players: Player[]) {
  return roles.map((role, index) => players.find((player) => player.primaryRole === role) ?? createBlankPlayers()[index]);
}
