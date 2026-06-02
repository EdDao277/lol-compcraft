create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  primary_role text not null,
  created_at timestamptz default now()
);

create table if not exists champions (
  id text primary key,
  riot_key int,
  name text not null,
  title text,
  image_url text,
  riot_tags text[],
  created_at timestamptz default now()
);

create table if not exists champion_metadata (
  champion_id text primary key references champions(id) on delete cascade,
  roles text[],
  damage_type text,
  comp_tags text[],
  utility_tags text[],
  lane_tags text[],
  threat_tags text[],
  weakness_tags text[],
  counter_tags text[],
  blind_pick_score int default 5,
  flex_value int default 1,
  early_pick_value int default 5,
  late_pick_value int default 5,
  synergies text[],
  counters text[],
  countered_by text[],
  notes text
);

create table if not exists player_champions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  champion_id text references champions(id) on delete cascade,
  role text not null,
  comfort_score int default 5,
  created_at timestamptz default now()
);

create table if not exists draft_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  side text not null,
  mode text default 'manual',
  result text,
  created_at timestamptz default now()
);

create table if not exists draft_actions (
  id uuid primary key default gen_random_uuid(),
  draft_session_id uuid references draft_sessions(id) on delete cascade,
  team text not null,
  action_type text not null,
  champion_id text references champions(id),
  role text,
  assigned_player_slot int,
  action_order int not null,
  created_at timestamptz default now()
);

create table if not exists enemy_pool_champions (
  id uuid primary key default gen_random_uuid(),
  draft_session_id uuid references draft_sessions(id) on delete cascade,
  role text,
  champion_id text references champions(id),
  created_at timestamptz default now()
);

create table if not exists recommendation_logs (
  id uuid primary key default gen_random_uuid(),
  draft_session_id uuid references draft_sessions(id) on delete cascade,
  recommendation_type text not null,
  champion_id text references champions(id),
  player_id uuid references players(id),
  score numeric,
  was_selected boolean default false,
  reasons text[],
  risks text[],
  created_at timestamptz default now()
);
