import type { Role } from '../types/champion';
import type { DraftState, DraftSlot } from '../types/draft';

const roleByPickIndex: Role[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

export function createInitialDraftState(): DraftState {
  return {
    ourSide: 'blue',
    format: 'ranked',
    slots: [
      ...Array.from({ length: 5 }, (_, index) => ({ id: `our-ban-${index + 1}`, team: 'our' as const, type: 'ban' as const, championId: null })),
      ...Array.from({ length: 5 }, (_, index) => ({ id: `enemy-ban-${index + 1}`, team: 'enemy' as const, type: 'ban' as const, championId: null })),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `our-pick-${index + 1}`,
        team: 'our' as const,
        type: 'pick' as const,
        championId: null,
        assignedPlayerSlot: index + 1,
        assignedRole: roleByPickIndex[index],
      })),
      ...Array.from({ length: 5 }, (_, index) => ({ id: `enemy-pick-${index + 1}`, team: 'enemy' as const, type: 'pick' as const, championId: null })),
    ],
  };
}

export function bannedChampionIds(slots: DraftSlot[], team?: 'our' | 'enemy'): string[] {
  return slots
    .filter((slot) => slot.type === 'ban' && slot.championId && (!team || slot.team === team))
    .map((slot) => slot.championId as string);
}

export function unavailableChampionIds(slots: DraftSlot[]): Set<string> {
  return new Set(slots.map((slot) => slot.championId).filter((championId): championId is string => Boolean(championId)));
}

export function getPickedChampionIds(draftState: DraftState): string[] {
  return draftState.slots.filter((slot) => slot.type === 'pick' && slot.championId).map((slot) => slot.championId as string);
}

export function getBannedChampionIds(draftState: DraftState): string[] {
  return draftState.slots.filter((slot) => slot.type === 'ban' && slot.championId).map((slot) => slot.championId as string);
}

export function getUnavailableChampionIds(draftState: DraftState): string[] {
  return [...new Set([...getPickedChampionIds(draftState), ...getBannedChampionIds(draftState)])];
}

export function pickedChampionIds(slots: DraftSlot[], team?: 'our' | 'enemy'): string[] {
  return slots
    .filter((slot) => slot.type === 'pick' && slot.championId && (!team || slot.team === team))
    .map((slot) => slot.championId as string);
}

export function filledPickIndexes(slots: DraftSlot[], team: 'our' | 'enemy'): Set<number> {
  return new Set(
    slots
      .filter((slot) => slot.type === 'pick' && slot.team === team && slot.championId)
      .map((slot) => Number(slot.id.split('-').at(-1)) - 1)
      .filter((index) => Number.isInteger(index) && index >= 0),
  );
}

export function getFilledAllyPlayerSlots(draftState: DraftState): number[] {
  return draftState.slots
    .filter((slot) => slot.team === 'our' && slot.type === 'pick' && slot.championId)
    .map((slot) => slot.assignedPlayerSlot ?? Number(slot.id.split('-').at(-1)))
    .filter((slot): slot is number => Number.isInteger(slot) && slot > 0);
}

export function getFilledAllyRoles(draftState: DraftState): Role[] {
  return draftState.slots
    .filter((slot) => slot.team === 'our' && slot.type === 'pick' && slot.championId)
    .map((slot) => slot.assignedRole ?? roleByPickIndex[(slot.assignedPlayerSlot ?? Number(slot.id.split('-').at(-1))) - 1])
    .filter((role): role is Role => Boolean(role));
}

export function isPlayerSlotFilled(draftState: DraftState, playerSlot: number): boolean {
  return getFilledAllyPlayerSlots(draftState).includes(playerSlot);
}

export function isRoleFilled(draftState: DraftState, role: Role): boolean {
  return getFilledAllyRoles(draftState).includes(role);
}

export function updateDraftSlot(slots: DraftSlot[], slotId: string, championId: string | null): DraftSlot[] {
  return slots.map((slot) => (slot.id === slotId ? { ...slot, championId } : slot));
}
