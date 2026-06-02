import type { ChampionSynergyStat, ProcessedTeam } from './types';

type Counter = {
  games: number;
  wins: number;
};

function key(parts: string[]) {
  return parts.join('::');
}

function roundRate(value: number) {
  return Math.round(value * 10000) / 10000;
}

export type AggregateSynergyOptions = {
  teams: ProcessedTeam[];
  patch: string;
  region: string;
  queue: string;
  tier?: string | null;
  minGames?: number;
};

export function aggregateSynergyStats({ teams, patch, region, queue, tier = null, minGames = 50 }: AggregateSynergyOptions) {
  const baselines = new Map<string, Counter>();
  const pairs = new Map<string, Counter>();

  for (const team of teams) {
    for (const champion of team.participants) {
      const baselineKey = key([champion.championId, champion.role]);
      const baseline = baselines.get(baselineKey) ?? { games: 0, wins: 0 };
      baseline.games += 1;
      baseline.wins += team.win ? 1 : 0;
      baselines.set(baselineKey, baseline);

      for (const ally of team.participants) {
        if (ally === champion) continue;
        const pairKey = key([champion.championId, champion.role, ally.championId, ally.role]);
        const pair = pairs.get(pairKey) ?? { games: 0, wins: 0 };
        pair.games += 1;
        pair.wins += team.win ? 1 : 0;
        pairs.set(pairKey, pair);
      }
    }
  }

  return [...pairs.entries()].map(([pairKey, pair]): ChampionSynergyStat => {
    const [championId, role, allyChampionId, allyRole] = pairKey.split('::') as [string, ChampionSynergyStat['role'], string, ChampionSynergyStat['ally_role']];
    const baseline = baselines.get(key([championId, role]));
    const winRate = pair.games > 0 ? pair.wins / pair.games : 0;
    const baselineRate = baseline && baseline.games > 0 ? baseline.wins / baseline.games : null;
    const lowConfidence = pair.games < minGames;

    return {
      patch,
      region,
      queue,
      tier,
      champion_id: championId,
      role,
      ally_champion_id: allyChampionId,
      ally_role: allyRole,
      games: pair.games,
      wins: pair.wins,
      win_rate: roundRate(winRate),
      delta_vs_average: baselineRate === null ? null : roundRate(winRate - baselineRate),
      source: lowConfidence ? 'riot-match-v5-low-confidence' : 'riot-match-v5',
    };
  });
}
