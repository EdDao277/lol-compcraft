import type { Role } from '../types/champion';
import type { DraftState, DraftTeam } from '../types/draft';
import type { Player } from '../types/player';
import { bannedChampionIds, filledPickIndexes, getFilledAllyRoles, unavailableChampionIds } from '../logic/draftUtils';
import { buildTeamCompSignatureFromRoleMap } from '../logic/teamCompSignature';

export type MlAdvisorScores = Record<string, MlAdvisorScore>;
export type MlAdvisorStatus = 'checking' | 'connected' | 'offline';

export type MlAdvisorScore = {
  score: number;
  available: boolean;
  winGain: number;
  currentOurWinChance: number;
  withCandidateOurWinChance: number;
  winModelScore?: number;
  pickRankerScore?: number;
  enemyDenialScore?: number;
  explanations?: string[];
  reason?: string;
};

type MlCandidatePayload = {
  key: string;
  championId: string;
  role: Role;
  blueCompSignatureAfter: string;
  redCompSignatureAfter: string;
};

type MlPredictionResponse = {
  predictions?: Array<{
    score?: number;
    available?: boolean;
    winGain?: number;
    currentOurWinChance?: number;
    withCandidateOurWinChance?: number;
    winModel?: {
      score?: number;
      winGain?: number;
    };
    pickRanker?: {
      score?: number;
      probability?: number;
      rankPercentile?: number;
    };
    enemyIntent?: {
      score?: number;
      denialScore?: number;
      probability?: number;
      rankPercentile?: number;
    };
    explanations?: string[];
    reason?: string;
  }>;
};

const neutralScore: MlAdvisorScore = {
  score: 50,
  available: false,
  winGain: 0,
  currentOurWinChance: 0.5,
  withCandidateOurWinChance: 0.5,
  reason: 'ML advisor unavailable; using neutral score',
};

export function getMlCandidateKey(playerId: string, championId: string, role: Role) {
  return `${playerId}-${championId}-${role}`;
}

export async function getMlAdvisorScores(draft: DraftState, players: Player[]): Promise<MlAdvisorScores> {
  const candidates = getMlCandidates(draft, players);
  if (candidates.length === 0) return {};

  const endpoint = getMlAdvisorEndpoint();
  if (!endpoint) return Object.fromEntries(candidates.map((candidate) => [candidate.key, neutralScore]));

  try {
    const bluePicks = getSidePicks(draft, 'blue');
    const redPicks = getSidePicks(draft, 'red');
    const response = await fetch(`${endpoint}/predict-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ourSide: draft.ourSide,
        format: draft.format === 'tournament' ? 'tournament' : 'rank_normal',
        bluePicks,
        redPicks,
        blueCompSignature: buildTeamCompSignatureFromRoleMap(bluePicks).signature,
        redCompSignature: buildTeamCompSignatureFromRoleMap(redPicks).signature,
        blueBans: getSideBans(draft, 'blue'),
        redBans: getSideBans(draft, 'red'),
        candidates: candidates.map((candidate) => ({
          championId: candidate.championId,
          role: candidate.role,
          blueCompSignatureAfter: candidate.blueCompSignatureAfter,
          redCompSignatureAfter: candidate.redCompSignatureAfter,
        })),
      }),
    });
    if (!response.ok) throw new Error(`ML advisor returned ${response.status}`);
    const payload = (await response.json()) as MlPredictionResponse;
    const predictions = payload.predictions ?? [];
    return Object.fromEntries(
      candidates.map((candidate, index) => {
        const prediction = predictions[index];
        return [
          candidate.key,
          {
            score: clampScore(prediction?.score ?? 50),
            available: Boolean(prediction?.available),
            winGain: Number(prediction?.winGain ?? 0),
            currentOurWinChance: Number(prediction?.currentOurWinChance ?? 0.5),
            withCandidateOurWinChance: Number(prediction?.withCandidateOurWinChance ?? 0.5),
            winModelScore: prediction?.winModel?.score,
            pickRankerScore: prediction?.pickRanker?.score,
            enemyDenialScore: prediction?.enemyIntent?.denialScore ?? prediction?.enemyIntent?.score,
            explanations: prediction?.explanations ?? [],
            reason: prediction?.reason,
          },
        ];
      }),
    );
  } catch (error) {
    console.warn('ML advisor unavailable; using neutral scores.', error);
    return Object.fromEntries(candidates.map((candidate) => [candidate.key, neutralScore]));
  }
}

export function hasAvailableMlAdvisorScore(scores: MlAdvisorScores) {
  return Object.values(scores).some((score) => score.available);
}

export async function getMlAdvisorStatus(): Promise<MlAdvisorStatus> {
  const endpoint = getMlAdvisorEndpoint();
  if (!endpoint) return 'offline';
  try {
    const response = await fetch(`${endpoint}/health`);
    if (!response.ok) return 'offline';
    const payload = (await response.json()) as { model?: { ready?: boolean } };
    return payload.model?.ready ? 'connected' : 'offline';
  } catch {
    return 'offline';
  }
}

function getMlCandidates(draft: DraftState, players: Player[]): MlCandidatePayload[] {
  const unavailable = unavailableChampionIds(draft.slots);
  const filledPlayers = filledPickIndexes(draft.slots, 'our');
  const filledRoles = new Set(getFilledAllyRoles(draft));
  const bluePicks = getSidePicks(draft, 'blue');
  const redPicks = getSidePicks(draft, 'red');
  const ourSidePicks = draft.ourSide === 'blue' ? bluePicks : redPicks;

  return players.flatMap((player, playerIndex) => {
    if (filledPlayers.has(playerIndex)) return [];
    return player.championPool
      .filter((entry) => entry.championId && !unavailable.has(entry.championId) && !filledRoles.has(entry.role))
      .map((entry) => ({
        key: getMlCandidateKey(player.id, entry.championId as string, entry.role),
        championId: entry.championId as string,
        role: entry.role,
        blueCompSignatureAfter:
          draft.ourSide === 'blue'
            ? buildTeamCompSignatureFromRoleMap({ ...ourSidePicks, [entry.role]: entry.championId as string }).signature
            : buildTeamCompSignatureFromRoleMap(bluePicks).signature,
        redCompSignatureAfter:
          draft.ourSide === 'red'
            ? buildTeamCompSignatureFromRoleMap({ ...ourSidePicks, [entry.role]: entry.championId as string }).signature
            : buildTeamCompSignatureFromRoleMap(redPicks).signature,
      }));
  });
}

function getSidePicks(draft: DraftState, side: 'blue' | 'red') {
  return getRoleMapForTeam(draft, teamForSide(draft, side));
}

function getSideBans(draft: DraftState, side: 'blue' | 'red') {
  return bannedChampionIds(draft.slots, teamForSide(draft, side));
}

function teamForSide(draft: DraftState, side: 'blue' | 'red'): DraftTeam {
  return draft.ourSide === side ? 'our' : 'enemy';
}

function getRoleMapForTeam(draft: DraftState, team: DraftTeam) {
  const roleByPickIndex: Role[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
  const result: Partial<Record<Role, string>> = {};
  draft.slots
    .filter((slot) => slot.team === team && slot.type === 'pick' && slot.championId)
    .forEach((slot) => {
      const pickIndex = Number(slot.id.split('-').at(-1));
      const role = slot.assignedRole ?? roleByPickIndex[(slot.assignedPlayerSlot ?? pickIndex) - 1];
      if (role && slot.championId) result[role] = slot.championId;
    });
  return result;
}

function getMlAdvisorEndpoint() {
  const value = import.meta.env.VITE_ML_ADVISOR_URL as string | undefined;
  if (value === 'off') return null;
  return value || 'http://127.0.0.1:8787';
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
