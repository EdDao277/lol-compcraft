import { roundStat, sampleConfidence } from './sampleConfidence';
import type { ChampionSynergyStat, ProcessedTeam, SynergySourceType } from './types';

type Counter = {
  games: number;
  wins: number;
};

function key(parts: string[]) {
  return parts.join('::');
}

export type AggregateSynergyOptions = {
  teams: ProcessedTeam[];
  patch?: string;
  region?: string;
  queue?: string;
  tier?: string | null;
  source?: SynergySourceType;
};

export function aggregateSynergyStats({ teams, patch, region, queue, tier = null, source }: AggregateSynergyOptions) {
  const baselines = new Map<string, Counter>();
  const pairs = new Map<string, Counter>();

  for (const team of teams) {
    for (const champion of team.participants) {
      const baselineKey = key([team.patch, team.region, String(team.queueId), team.sourceType, champion.championId, champion.role]);
      const baseline = baselines.get(baselineKey) ?? { games: 0, wins: 0 };
      baseline.games += 1;
      baseline.wins += team.win ? 1 : 0;
      baselines.set(baselineKey, baseline);

      for (const ally of team.participants) {
        if (ally === champion) continue;
        const pairKey = key([team.patch, team.region, String(team.queueId), team.sourceType, champion.championId, champion.role, ally.championId, ally.role]);
        const pair = pairs.get(pairKey) ?? { games: 0, wins: 0 };
        pair.games += 1;
        pair.wins += team.win ? 1 : 0;
        pairs.set(pairKey, pair);
      }
    }
  }

  return [...pairs.entries()].map(([pairKey, pair]): ChampionSynergyStat => {
    const [rowPatch, rowRegion, queueId, sourceType, championId, role, allyChampionId, allyRole] = pairKey.split('::') as [
      string,
      string,
      string,
      SynergySourceType,
      string,
      ChampionSynergyStat['role'],
      string,
      ChampionSynergyStat['ally_role'],
    ];
    const championBaseline = baselines.get(key([rowPatch, rowRegion, queueId, sourceType, championId, role]));
    const allyBaseline = baselines.get(key([rowPatch, rowRegion, queueId, sourceType, allyChampionId, allyRole]));
    const winRate = pair.games > 0 ? pair.wins / pair.games : 0;
    const championBaselineRate = championBaseline && championBaseline.games > 0 ? championBaseline.wins / championBaseline.games : null;
    const allyBaselineRate = allyBaseline && allyBaseline.games > 0 ? allyBaseline.wins / allyBaseline.games : null;
    const expectedBaseline = championBaselineRate === null || allyBaselineRate === null ? null : (championBaselineRate + allyBaselineRate) / 2;

    return {
      patch: patch ?? rowPatch,
      region: region ?? rowRegion,
      queue: queue ?? queueId,
      queue_id: Number(queueId),
      tier,
      champion_id: championId,
      role,
      ally_champion_id: allyChampionId,
      ally_role: allyRole,
      games: pair.games,
      wins: pair.wins,
      win_rate: roundStat(winRate),
      delta_vs_average: expectedBaseline === null ? null : roundStat(winRate - expectedBaseline),
      confidence: sampleConfidence(pair.games),
      source: source ?? sourceType,
      source_type: source ?? sourceType,
    };
  });
}
