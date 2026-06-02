export type TeamRow = {
  id: string;
  name: string;
  created_at: string | null;
};

export type PlayerRow = {
  id: string;
  team_id: string | null;
  name: string;
  primary_role: string;
  created_at: string | null;
};

export type ChampionRow = {
  id: string;
  riot_key: number | null;
  name: string;
  title: string | null;
  image_url: string | null;
  riot_tags: string[] | null;
  created_at: string | null;
};

export type ChampionMetadataRow = {
  champion_id: string;
  roles: string[] | null;
  damage_type: string | null;
  comp_tags: string[] | null;
  utility_tags: string[] | null;
  lane_tags: string[] | null;
  threat_tags: string[] | null;
  weakness_tags: string[] | null;
  counter_tags: string[] | null;
  blind_pick_score: number | null;
  flex_value: number | null;
  early_pick_value: number | null;
  late_pick_value: number | null;
  synergies: string[] | null;
  counters: string[] | null;
  countered_by: string[] | null;
  notes: string | null;
};

export type PlayerChampionRow = {
  id: string;
  player_id: string | null;
  champion_id: string | null;
  role: string;
  comfort_score: number | null;
  created_at: string | null;
};

export type DraftSessionRow = {
  id: string;
  team_id: string | null;
  side: string;
  mode: string | null;
  result: string | null;
  created_at: string | null;
};

export type DraftActionRow = {
  id: string;
  draft_session_id: string | null;
  team: string;
  action_type: string;
  champion_id: string | null;
  role: string | null;
  assigned_player_slot: number | null;
  action_order: number;
  created_at: string | null;
};

export type EnemyPoolChampionRow = {
  id: string;
  draft_session_id: string | null;
  role: string | null;
  champion_id: string | null;
  created_at: string | null;
};

export type RecommendationLogRow = {
  id: string;
  draft_session_id: string | null;
  recommendation_type: string;
  champion_id: string | null;
  player_id: string | null;
  score: number | null;
  was_selected: boolean | null;
  reasons: string[] | null;
  risks: string[] | null;
  created_at: string | null;
};

export type ChampionSynergyStatsRow = {
  id: string;
  patch: string;
  region: string;
  queue: string;
  tier: string | null;
  champion_id: string | null;
  role: string;
  ally_champion_id: string | null;
  ally_role: string;
  games: number;
  wins: number;
  win_rate: number;
  delta_vs_average: number | null;
  source: string;
  updated_at: string | null;
};
