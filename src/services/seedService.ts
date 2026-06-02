import { champions } from '../logic/championData';
import type { Role } from '../types/champion';
import { getTeams, createTeam } from './teamService';
import { createPlayer, getPlayersByTeam } from './playerService';
import { upsertChampions } from './championService';
import { getSupabaseOrWarn } from './serviceUtils';

const roles: Role[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

export async function seedMockDataToSupabase() {
  const supabase = getSupabaseOrWarn('seedService.seedMockDataToSupabase');
  if (!supabase) return null;

  await upsertChampions(champions);

  const existingTeams = await getTeams();
  const team = existingTeams.find((item) => item.name === 'Sample Team') ?? (await createTeam('Sample Team'));
  if (!team) return null;

  const existingPlayers = await getPlayersByTeam(team.id);
  for (const [index, role] of roles.entries()) {
    const exists = existingPlayers.some((item) => item.primary_role === role);
    if (exists) continue;
    await createPlayer({
      team_id: team.id,
      name: `Player ${index + 1}`,
      primary_role: role,
    });
  }

  return team;
}
