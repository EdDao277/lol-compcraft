import { opendir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { aggregateChampionMatchupStats } from './aggregateChampionMatchupStats';
import { aggregateChampionRoleStats } from './aggregateChampionRoleStats';
import { aggregateSynergyStats } from './aggregateSynergyStats';
import { aggregateTeamCompSignatureStats } from './aggregateTeamCompSignatureStats';
import { loadPipelineEnv } from './env';
import { getNetworkPipelineConfig } from './pipelineConfigs';
import { processMatches } from './processMatches';
import type { MatchDetail, ProcessedTeam } from './types';
import { uploadNetworkStatsToSupabase } from './uploadNetworkStatsToSupabase';

loadPipelineEnv();

const matchCacheDir = path.resolve('data/cache/matches');

async function main() {
  const config = getNetworkPipelineConfig();
  const processedTeams: ProcessedTeam[] = [];
  let filesRead = 0;
  let filesSkipped = 0;
  let matchesProcessed = 0;
  const wantedQueues = new Set(config.queueIds);

  const dir = await opendir(matchCacheDir);
  for await (const entry of dir) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    filesRead += 1;
    try {
      const match = JSON.parse(await readFile(path.join(matchCacheDir, entry.name), 'utf8')) as MatchDetail;
      if (wantedQueues.size > 0 && !wantedQueues.has(match.info.queueId)) {
        filesSkipped += 1;
        continue;
      }
      processedTeams.push(...processMatches([match], { region: config.routingRegion, sourceType: config.sourceType }));
      matchesProcessed += 1;
    } catch (error) {
      filesSkipped += 1;
      console.warn(`Skipping unreadable cached match ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (filesRead % 1000 === 0) {
      console.log(`cache processing progress: ${filesRead} files read, ${matchesProcessed} matches accepted, ${processedTeams.length} teams processed`);
    }
  }

  const roleStats = aggregateChampionRoleStats(processedTeams);
  const synergyStats = aggregateSynergyStats({ teams: processedTeams });
  const matchupStats = aggregateChampionMatchupStats(processedTeams, roleStats);
  const teamCompSignatureStats = aggregateTeamCompSignatureStats(processedTeams);
  const filteredPayload = filterLowSampleStats({ roleStats, synergyStats, matchupStats, teamCompSignatureStats });
  const uploaded = await uploadNetworkStatsToSupabase(filteredPayload);

  console.log(`source type: ${config.sourceType}`);
  console.log(`cached match files read: ${filesRead}`);
  console.log(`cached match files skipped: ${filesSkipped}`);
  console.log(`cached matches processed: ${matchesProcessed}`);
  console.log(`teams processed: ${processedTeams.length}`);
  console.log(`champion role rows generated: ${roleStats.length}`);
  console.log(`champion role rows uploaded after sample filter: ${filteredPayload.roleStats.length}`);
  console.log(`synergy rows generated: ${synergyStats.length}`);
  console.log(`synergy rows uploaded after sample filter: ${filteredPayload.synergyStats.length}`);
  console.log(`matchup rows generated: ${matchupStats.length}`);
  console.log(`matchup rows uploaded after sample filter: ${filteredPayload.matchupStats.length}`);
  console.log(`team comp signature rows generated: ${teamCompSignatureStats.length}`);
  console.log(`team comp signature rows uploaded after sample filter: ${filteredPayload.teamCompSignatureStats.length}`);
  console.log(`rows uploaded to Supabase: ${uploaded.totalRows}`);
}

function filterLowSampleStats(payload: Parameters<typeof uploadNetworkStatsToSupabase>[0]) {
  const minRoleGames = readPositiveNumber('RIOT_UPLOAD_MIN_ROLE_GAMES', 20);
  const minSynergyGames = readPositiveNumber('RIOT_UPLOAD_MIN_SYNERGY_GAMES', 5);
  const minSameRoleMatchupGames = readPositiveNumber('RIOT_UPLOAD_MIN_SAME_ROLE_MATCHUP_GAMES', 5);
  const minCrossTeamMatchupGames = readPositiveNumber('RIOT_UPLOAD_MIN_CROSS_TEAM_MATCHUP_GAMES', 10);
  const minTeamCompGames = readPositiveNumber('RIOT_UPLOAD_MIN_TEAM_COMP_GAMES', 5);
  const maxRoleRows = readPositiveNumber('RIOT_UPLOAD_MAX_ROLE_ROWS', 50000);
  const maxSynergyRows = readPositiveNumber('RIOT_UPLOAD_MAX_SYNERGY_ROWS', 500000);
  const maxMatchupRows = readPositiveNumber('RIOT_UPLOAD_MAX_MATCHUP_ROWS', 500000);
  const maxTeamCompRows = readPositiveNumber('RIOT_UPLOAD_MAX_TEAM_COMP_ROWS', 25000);

  console.log(
    `sample filters: role >= ${minRoleGames}, synergy >= ${minSynergyGames}, same-role matchup >= ${minSameRoleMatchupGames}, cross-team matchup >= ${minCrossTeamMatchupGames}, team comp >= ${minTeamCompGames} games`,
  );
  console.log(`row caps: role <= ${maxRoleRows}, synergy <= ${maxSynergyRows}, matchup <= ${maxMatchupRows}, team comp <= ${maxTeamCompRows}`);

  return {
    roleStats: limitRows(payload.roleStats.filter((row) => row.games >= minRoleGames), maxRoleRows),
    synergyStats: limitRows(
      payload.synergyStats.filter((row) => row.games >= minSynergyGames),
      maxSynergyRows,
      (row) => Math.abs(row.delta_vs_average ?? 0),
    ),
    matchupStats: limitRows(
      payload.matchupStats.filter((row) => row.games >= (row.matchup_type === 'same-role' ? minSameRoleMatchupGames : minCrossTeamMatchupGames)),
      maxMatchupRows,
      (row) => Math.abs(row.delta_vs_baseline ?? 0) + (row.matchup_type === 'same-role' ? 0.2 : 0),
    ),
    teamCompSignatureStats: limitRows(payload.teamCompSignatureStats.filter((row) => row.games >= minTeamCompGames), maxTeamCompRows),
  };
}

function limitRows<T extends { games: number; confidence?: number }>(rows: T[], maxRows: number, extraScore: (row: T) => number = () => 0) {
  return [...rows].sort((left, right) => rowPriority(right, extraScore) - rowPriority(left, extraScore)).slice(0, maxRows);
}

function rowPriority<T extends { games: number; confidence?: number }>(row: T, extraScore: (row: T) => number) {
  return row.games + (row.confidence ?? 0) * 100 + extraScore(row) * 250;
}

function readPositiveNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`Invalid ${name}: expected a positive number.`);
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
