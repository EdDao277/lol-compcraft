export type RegionalRouting = 'americas' | 'asia' | 'europe' | 'sea';

export type RiotAccount = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

export type NormalizedRole = 'Top' | 'Jungle' | 'Mid' | 'ADC' | 'Support';

export type MatchParticipant = {
  championId: number;
  championName: string;
  individualPosition?: string;
  teamPosition?: string;
  teamId: number;
  win: boolean;
};

export type MatchDetail = {
  metadata: {
    matchId: string;
  };
  info: {
    gameVersion?: string;
    queueId?: number;
    participants: MatchParticipant[];
  };
};

export type ProcessedParticipant = {
  matchId: string;
  championId: string;
  championNumericId: number;
  championName: string;
  role: NormalizedRole;
  teamId: number;
  win: boolean;
};

export type ProcessedTeam = {
  matchId: string;
  teamId: number;
  win: boolean;
  participants: ProcessedParticipant[];
};

export type ChampionSynergyStat = {
  patch: string;
  region: string;
  queue: string;
  tier: string | null;
  champion_id: string;
  role: NormalizedRole;
  ally_champion_id: string;
  ally_role: NormalizedRole;
  games: number;
  wins: number;
  win_rate: number;
  delta_vs_average: number | null;
  source: string;
};
