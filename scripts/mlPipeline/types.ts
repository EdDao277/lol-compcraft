import type { NormalizedRole, ProcessedTeam, SynergySourceType } from '../statsPipeline/types';

export type MlDataSource = 'oracle-elixir';

export type DraftTrainingExample = {
  matchId: string;
  patch: string;
  queueId: number | null;
  region: string;
  source: MlDataSource;
  sourceType: SynergySourceType | 'pro';
  side: 'blue' | 'red' | 'unknown';
  allyChampions: Record<NormalizedRole, string>;
  enemyChampions: Record<NormalizedRole, string>;
  allyBans: string[];
  enemyBans: string[];
  labelWin: 0 | 1;
};

export type OracleElixirImportResult = {
  teams: ProcessedTeam[];
  filesRead: number;
  rowsRead: number;
  gamesImported: number;
  quality: OracleImportQualityReport;
};

export type TrainingDataset = {
  examples: DraftTrainingExample[];
  featureNames: string[];
  rows: TrainingRow[];
};

export type TrainingRow = {
  example: DraftTrainingExample;
  features: number[];
  label: 0 | 1;
};

export type OracleImportQualityReport = {
  blueTeams: number;
  redTeams: number;
  completeGames: number;
  duplicateTeamRows: number;
  skippedNonPlayerRows: number;
  unknownChampionRows: number;
  unknownRoleRows: number;
  invalidSideRows: number;
  invalidResultRows: number;
  missingGameIdRows: number;
  roleCounts: Record<NormalizedRole, number>;
  sideWinRates: Record<'blue' | 'red', number>;
  unknownChampionSamples: string[];
};
