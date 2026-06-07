import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { toChampionId } from './championNameMap';
import type { NormalizedRole, ProcessedParticipant, ProcessedTeam } from '../statsPipeline/types';
import type { OracleElixirImportResult, OracleImportQualityReport } from './types';

const positionToRole: Record<string, NormalizedRole | undefined> = {
  top: 'Top',
  jng: 'Jungle',
  jungle: 'Jungle',
  mid: 'Mid',
  bot: 'ADC',
  adc: 'ADC',
  sup: 'Support',
  support: 'Support',
};

type OracleRow = Record<string, string>;

export async function importOracleElixirCsvDir(inputDir: string): Promise<OracleElixirImportResult> {
  const files = await getCsvFiles(inputDir);
  const teams: ProcessedTeam[] = [];
  const quality = createQualityReport();
  let rowsRead = 0;

  for (const filePath of files) {
    const text = await readFile(filePath, 'utf8');
    const rows = parseCsv(text);
    rowsRead += rows.length;
    teams.push(...rowsToProcessedTeams(rows, quality));
  }
  finalizeQualityReport(teams, quality);

  return {
    teams,
    filesRead: files.length,
    rowsRead,
    gamesImported: new Set(teams.map((team) => team.matchId)).size,
    quality,
  };
}

async function getCsvFiles(inputDir: string) {
  try {
    const entries = await readdir(inputDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv')).map((entry) => path.join(inputDir, entry.name));
  } catch {
    return [];
  }
}

function rowsToProcessedTeams(rows: OracleRow[], quality: OracleImportQualityReport) {
  const participantsByTeam = new Map<string, ProcessedParticipant[]>();
  const gameMeta = new Map<string, { patch: string; region: string; win: boolean; teamId: number; bans: string[] }>();

  for (const row of rows) {
    const position = getField(row, ['position', 'role']);
    if (position.toLowerCase() === 'team') {
      quality.skippedNonPlayerRows += 1;
      continue;
    }
    const role = positionToRole[position.toLowerCase()];
    if (!role) {
      quality.unknownRoleRows += 1;
      continue;
    }

    const championName = getField(row, ['champion', 'championname']);
    const championId = toChampionId(championName);
    if (!championId) {
      quality.unknownChampionRows += 1;
      if (championName && quality.unknownChampionSamples.length < 10 && !quality.unknownChampionSamples.includes(championName)) {
        quality.unknownChampionSamples.push(championName);
      }
      continue;
    }

    const gameId = getField(row, ['gameid', 'game_id', 'game']);
    const side = getField(row, ['side']);
    if (!gameId) {
      quality.missingGameIdRows += 1;
      continue;
    }
    if (!side) {
      quality.invalidSideRows += 1;
      continue;
    }

    const teamId = side.toLowerCase() === 'blue' ? 100 : side.toLowerCase() === 'red' ? 200 : 0;
    if (!teamId) {
      quality.invalidSideRows += 1;
      continue;
    }

    const key = `${gameId}-${teamId}`;
    const result = Number(getField(row, ['result', 'win']));
    if (result !== 0 && result !== 1) {
      quality.invalidResultRows += 1;
      continue;
    }
    const participant: ProcessedParticipant = {
      matchId: gameId,
      championId,
      championNumericId: Number(getField(row, ['championid', 'champion_id'])) || 0,
      championName,
      role,
      teamId,
      win: result === 1,
    };

    participantsByTeam.set(key, [...(participantsByTeam.get(key) ?? []), participant]);
    gameMeta.set(key, {
      patch: normalizePatch(getField(row, ['patch'])),
      region: getField(row, ['league', 'region']) || 'pro',
      win: result === 1,
      teamId,
      bans: getBans(row),
    });
  }

  const teams: ProcessedTeam[] = [];
  for (const [key, participants] of participantsByTeam.entries()) {
    if (participants.length !== 5) continue;
    if (new Set(participants.map((participant) => participant.role)).size !== 5) {
      quality.duplicateTeamRows += 1;
      continue;
    }
    const meta = gameMeta.get(key);
    if (!meta) continue;
    teams.push({
      matchId: participants[0]?.matchId ?? key,
      teamId: meta.teamId,
      win: meta.win,
      patch: meta.patch,
      region: meta.region,
      queueId: 0,
      sourceType: 'global',
      participants,
      bans: meta.bans,
    });
  }

  return teams;
}

function getBans(row: OracleRow) {
  return ['ban1', 'ban2', 'ban3', 'ban4', 'ban5']
    .map((field) => toChampionId(getField(row, [field])))
    .filter((championId): championId is string => Boolean(championId));
}

function createQualityReport(): OracleImportQualityReport {
  return {
    blueTeams: 0,
    redTeams: 0,
    completeGames: 0,
    duplicateTeamRows: 0,
    skippedNonPlayerRows: 0,
    unknownChampionRows: 0,
    unknownRoleRows: 0,
    invalidSideRows: 0,
    invalidResultRows: 0,
    missingGameIdRows: 0,
    roleCounts: { Top: 0, Jungle: 0, Mid: 0, ADC: 0, Support: 0 },
    sideWinRates: { blue: 0, red: 0 },
    unknownChampionSamples: [],
  };
}

function finalizeQualityReport(teams: ProcessedTeam[], quality: OracleImportQualityReport) {
  const blueTeams = teams.filter((team) => team.teamId === 100);
  const redTeams = teams.filter((team) => team.teamId === 200);
  quality.blueTeams = blueTeams.length;
  quality.redTeams = redTeams.length;
  quality.completeGames = countCompleteGames(teams);
  quality.sideWinRates.blue = winRate(blueTeams);
  quality.sideWinRates.red = winRate(redTeams);
  for (const team of teams) {
    for (const participant of team.participants) {
      quality.roleCounts[participant.role] += 1;
    }
  }
}

function countCompleteGames(teams: ProcessedTeam[]) {
  const counts = new Map<string, Set<number>>();
  for (const team of teams) {
    counts.set(team.matchId, new Set([...(counts.get(team.matchId) ?? []), team.teamId]));
  }
  return [...counts.values()].filter((teamIds) => teamIds.has(100) && teamIds.has(200)).length;
}

function winRate(teams: ProcessedTeam[]) {
  if (teams.length === 0) return 0;
  return teams.filter((team) => team.win).length / teams.length;
}

function getField(row: OracleRow, names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined) return value.trim();
  }
  return '';
}

function normalizePatch(value: string) {
  const match = value.match(/\d+\.\d+/);
  return match?.[0] ?? (value.trim() || 'unknown');
}

function parseCsv(text: string): OracleRow[] {
  const rows = parseCsvRows(text);
  const [headers, ...values] = rows;
  if (!headers) return [];
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase().replace(/[^a-z0-9_]+/g, ''));
  return values
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] ?? ''])));
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
