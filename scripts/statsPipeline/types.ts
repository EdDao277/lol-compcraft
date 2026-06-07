export type RegionalRouting = 'americas' | 'asia' | 'europe' | 'sea';

export type PlatformRegion = 'br1' | 'eun1' | 'euw1' | 'jp1' | 'kr' | 'la1' | 'la2' | 'me1' | 'na1' | 'oc1' | 'ru' | 'sg2' | 'tr1' | 'tw2' | 'vn2';

export type SynergySourceType = 'personal' | 'friend' | 'recursive-network' | 'high-elo' | 'global' | 'personal-network' | 'general-network';

export type RiotAccount = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

export type NormalizedRole = 'Top' | 'Jungle' | 'Mid' | 'ADC' | 'Support';

export type MatchParticipant = {
  puuid: string;
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
    queueId: number;
    gameCreation?: number;
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
  patch: string;
  region: string;
  queueId: number;
  sourceType: SynergySourceType;
  participants: ProcessedParticipant[];
  bans?: string[];
};

export type ChampionRoleStat = {
  patch: string;
  region: string;
  queue_id: number;
  source_type: SynergySourceType;
  champion_id: string;
  role: NormalizedRole;
  games: number;
  wins: number;
  win_rate: number;
  confidence: number;
};

export type ChampionSynergyStat = {
  patch: string;
  region: string;
  queue: string;
  queue_id?: number;
  tier: string | null;
  champion_id: string;
  role: NormalizedRole;
  ally_champion_id: string;
  ally_role: NormalizedRole;
  games: number;
  wins: number;
  win_rate: number;
  delta_vs_average: number | null;
  confidence: number;
  source: SynergySourceType;
  source_type?: SynergySourceType;
};

export type ChampionMatchupStat = {
  patch: string;
  region: string;
  queue_id: number;
  source_type: SynergySourceType;
  champion_id: string;
  role: NormalizedRole;
  enemy_champion_id: string;
  enemy_role: NormalizedRole;
  matchup_type: 'same-role' | 'cross-team';
  games: number;
  wins: number;
  win_rate: number;
  delta_vs_baseline: number | null;
  confidence: number;
};

export type TeamCompSignatureStat = {
  patch: string;
  region: string;
  queue_id: number;
  source_type: SynergySourceType;
  signature: string;
  has_frontline: boolean;
  has_engage: boolean;
  has_hard_engage: boolean;
  has_peel: boolean;
  has_disengage: boolean;
  has_ap: boolean;
  has_ad: boolean;
  has_mixed_damage: boolean;
  has_scaling: boolean;
  has_poke: boolean;
  has_dive: boolean;
  has_pick: boolean;
  has_waveclear: boolean;
  games: number;
  wins: number;
  win_rate: number;
  confidence: number;
};
