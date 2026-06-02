import type { Role } from './champion';

export type TeamSide = 'blue' | 'red';
export type DraftTeam = 'our' | 'enemy';
export type DraftActionType = 'pick' | 'ban';

export type DraftSlot = {
  id: string;
  team: DraftTeam;
  type: DraftActionType;
  championId: string | null;
  assignedPlayerSlot?: number;
  assignedRole?: Role;
};

export type DraftState = {
  ourSide: TeamSide;
  slots: DraftSlot[];
};
