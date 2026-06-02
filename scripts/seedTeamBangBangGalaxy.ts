import { createClient } from '@supabase/supabase-js';
import generatedChampions from '../src/data/generated/champions.json';
import { loadPipelineEnv, requirePipelineEnv } from './statsPipeline/env';
import type { Role } from '../src/types/champion';

loadPipelineEnv();

type PoolEntry = {
  championId: string;
  role: Role;
  comfortScore: number;
};

type TeamPlayerSeed = {
  name: string;
  role: Role;
  pool: PoolEntry[];
};

type SupabaseUpsertClient = {
  from: (table: string) => {
    upsert: (rows: unknown[], options?: { onConflict?: string }) => PromiseLike<{ error: unknown }>;
  };
};

const teamName = 'Team Bang Bang Galaxy';

const team: TeamPlayerSeed[] = [
  {
    name: '0Impact',
    role: 'Top',
    pool: [
      pick('DrMundo', 'Top', 10),
      pick('Gangplank', 'Top', 9),
      pick('Akali', 'Top', 10),
      pick('Sett', 'Top', 10),
      pick('Malphite', 'Top', 7),
      pick('Aatrox', 'Top', 7),
      pick('Gragas', 'Top', 7),
      pick('Galio', 'Top', 9),
      pick('Nasus', 'Top', 8),
      pick('Gnar', 'Top', 6),
      pick('Sion', 'Top', 10),
      pick('Kayle', 'Top', 7),
      pick('Ornn', 'Top', 9),
      pick('Mordekaiser', 'Top', 7),
      pick('TahmKench', 'Top', 6),
      pick('Shen', 'Top', 6),
    ],
  },
  {
    name: 'King Viego',
    role: 'Jungle',
    pool: [
      pick('Viego', 'Jungle', 10),
      pick('Gragas', 'Jungle', 9),
      pick('Graves', 'Jungle', 10),
      pick('Diana', 'Jungle', 9),
      pick('Vi', 'Jungle', 8),
      pick('LeeSin', 'Jungle', 7),
      pick('Amumu', 'Jungle', 6),
      pick('Sejuani', 'Jungle', 6),
      pick('JarvanIV', 'Jungle', 8),
      pick('Gwen', 'Jungle', 7),
      pick('Elise', 'Jungle', 7),
      pick('Lillia', 'Jungle', 6),
      pick('XinZhao', 'Jungle', 8),
      pick('Poppy', 'Jungle', 7),
    ],
  },
  {
    name: 'PullupSpammer',
    role: 'Mid',
    pool: [
      pick('Vladimir', 'Mid', 10),
      pick('Viktor', 'Mid', 10),
      pick('Syndra', 'Mid', 7),
      pick('Orianna', 'Mid', 7),
      pick('Talon', 'Mid', 8),
      pick('Ahri', 'Mid', 6),
      pick('TwistedFate', 'Mid', 5),
      pick('Yasuo', 'Mid', 6),
      pick('Yone', 'Mid', 5),
      pick('Anivia', 'Mid', 7),
      pick('Kassadin', 'Mid', 6),
    ],
  },
  {
    name: 'Hai Legacy',
    role: 'ADC',
    pool: [
      pick('Jhin', 'ADC', 10),
      pick('Ashe', 'ADC', 10),
      pick('Kaisa', 'ADC', 10),
      pick('Aphelios', 'ADC', 10),
      pick('Ezreal', 'ADC', 9),
      pick('Varus', 'ADC', 8),
      pick('Caitlyn', 'ADC', 8),
      pick('Lucian', 'ADC', 7),
      pick('Jinx', 'ADC', 7),
      pick('MissFortune', 'ADC', 7),
      pick('Xayah', 'ADC', 7),
      pick('Kalista', 'ADC', 6),
      pick('Corki', 'ADC', 7),
      pick('Tristana', 'ADC', 7),
      pick('Smolder', 'ADC', 6),
      pick('Twitch', 'ADC', 7),
      pick('Zeri', 'ADC', 7),
    ],
  },
  {
    name: 'Hummybird',
    role: 'Support',
    pool: [
      pick('Lux', 'Support', 10),
      pick('Seraphine', 'Support', 9),
      pick('Soraka', 'Support', 9),
      pick('Karma', 'Support', 7),
      pick('Nami', 'Support', 8),
      pick('Zyra', 'Support', 8),
      pick('Milio', 'Support', 8),
      pick('Renata', 'Support', 7),
      pick('Neeko', 'Support', 9),
      pick('Lulu', 'Support', 7),
      pick('Braum', 'Support', 6),
      pick('Bard', 'Support', 6),
      pick('Rakan', 'Support', 6),
    ],
  },
];

function pick(championId: string, role: Role, comfortScore: number): PoolEntry {
  return { championId, role, comfortScore };
}

async function main() {
  validateChampionIds(team);

  const supabase = createClient(requirePipelineEnv('SUPABASE_URL'), requirePipelineEnv('SUPABASE_SERVICE_ROLE_KEY'));
  await upsertLocalChampions(supabase);

  const { data: existingTeam, error: teamLookupError } = await supabase.from('teams').select('*').eq('name', teamName).maybeSingle();
  if (teamLookupError) throw teamLookupError;

  const teamRow =
    existingTeam ??
    (
      await supabase
        .from('teams')
        .insert({ name: teamName })
        .select('*')
        .single()
    ).data;

  if (!teamRow) throw new Error('Could not create or load team.');

  const { error: deletePlayersError } = await supabase.from('players').delete().eq('team_id', teamRow.id);
  if (deletePlayersError) throw deletePlayersError;

  let playerCount = 0;
  let poolCount = 0;

  for (const player of team) {
    const { data: playerRow, error: playerError } = await supabase
      .from('players')
      .insert({
        team_id: teamRow.id,
        name: player.name,
        primary_role: player.role,
      })
      .select('*')
      .single();

    if (playerError) throw playerError;
    if (!playerRow) throw new Error(`Could not create player ${player.name}.`);
    playerCount += 1;

    const rows = player.pool.map((entry) => ({
      player_id: playerRow.id,
      champion_id: entry.championId,
      role: entry.role,
      comfort_score: entry.comfortScore,
    }));

    const { error: poolError } = await supabase.from('player_champions').insert(rows);
    if (poolError) throw poolError;
    poolCount += rows.length;
  }

  console.log(`Seeded ${teamName}`);
  console.log(`players saved: ${playerCount}`);
  console.log(`champion pool rows saved: ${poolCount}`);
}

function validateChampionIds(players: TeamPlayerSeed[]) {
  const validIds = new Set(generatedChampions.map((champion) => champion.id));
  const missing = players.flatMap((player) => player.pool.map((entry) => entry.championId)).filter((championId) => !validIds.has(championId));
  if (missing.length > 0) {
    throw new Error(`Champion IDs not found in generated champion data: ${[...new Set(missing)].join(', ')}`);
  }
}

async function upsertLocalChampions(supabase: SupabaseUpsertClient) {
  const rows = generatedChampions.map((champion) => ({
    id: champion.id,
    riot_key: champion.key,
    name: champion.name,
    title: champion.title,
    image_url: champion.imageUrl,
    riot_tags: champion.riotTags,
  }));

  const { error } = await supabase.from('champions').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
