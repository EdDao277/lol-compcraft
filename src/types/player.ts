import type { Role } from './champion';

export type PlayerChampionPoolEntry = {
  championId: string | null;
  role: Role;
  comfortScore: number;
};

export type Player = {
  id: string;
  name: string;
  primaryRole: Role;
  championPool: PlayerChampionPoolEntry[];
};

export type EnemyPoolEntry = {
  id: string;
  championId: string | null;
  role: Role;
  threatScore: number;
};
