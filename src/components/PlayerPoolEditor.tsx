import { ChampionSearchInput } from './ChampionSelect';
import type { Player } from '../types/player';
import type { Role } from '../types/champion';
import { getChampion } from '../logic/championData';

const roles: Role[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

type Props = {
  players: Player[];
  onChange: (players: Player[]) => void;
};

export function PlayerPoolEditor({ players, onChange }: Props) {
  const updatePlayer = (playerId: string, patch: Partial<Player>) => {
    onChange(players.map((player) => (player.id === playerId ? { ...player, ...patch } : player)));
  };

  const updatePoolEntry = (playerId: string, index: number, field: string, value: string | number | null) => {
    onChange(
      players.map((player) =>
        player.id === playerId
          ? {
              ...player,
              championPool: player.championPool.map((entry, entryIndex) => (entryIndex === index ? { ...entry, [field]: value } : entry)),
            }
          : player,
      ),
    );
  };

  return (
    <section className="rounded-lg border border-[#003566] bg-[#001D3D] p-4 text-slate-100 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Team Champion Pools</h2>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {players.map((player) => (
          <div key={player.id} className="rounded-lg border border-[#003566] bg-[#000814]/70 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="rounded border border-[#003566] bg-[#000814] px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#03b4fb] focus:outline-none" value={player.name} onChange={(event) => updatePlayer(player.id, { name: event.target.value })} placeholder="Player name" />
              <select className="rounded border border-[#003566] bg-[#000814] px-2 py-2 text-sm text-slate-100 focus:border-[#03b4fb] focus:outline-none" value={player.primaryRole} onChange={(event) => updatePlayer(player.id, { primaryRole: event.target.value as Role })}>
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </div>

            <div className="mt-3 space-y-3">
              {player.championPool.map((entry, index) => {
                const champion = getChampion(entry.championId);
                return (
                  <div key={`${player.id}-${index}`} className="grid gap-2 rounded border border-[#003566] bg-[#001D3D]/70 p-2 text-sm md:grid-cols-[64px_1fr_130px_90px]">
                    <div className="flex items-center justify-center">
                    {champion ? <img className="h-12 w-12 rounded" src={champion.imageUrl} alt={champion.name} /> : <div className="h-12 w-12 rounded bg-slate-200" />}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <ChampionSearchInput value={entry.championId} onChange={(value) => updatePoolEntry(player.id, index, 'championId', value)} />
                      <select className="rounded border border-[#003566] bg-[#000814] px-2 py-2 text-slate-100 focus:border-[#03b4fb] focus:outline-none" value={entry.role} onChange={(event) => updatePoolEntry(player.id, index, 'role', event.target.value)}>
                        {roles.map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    </div>
                    <ScoreFields playerId={player.id} index={index} entry={entry} onChange={updatePoolEntry} />
                    <button
                      className="rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm font-medium text-slate-200 hover:border-[#03b4fb]"
                      onClick={() => updatePlayer(player.id, { championPool: player.championPool.filter((_, entryIndex) => entryIndex !== index) })}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              className="mt-3 rounded bg-[#03b4fb] px-3 py-2 text-sm font-black text-[#000814] hover:bg-[#38c8ff]"
              onClick={() =>
                updatePlayer(player.id, {
                  championPool: [
                    ...player.championPool,
                    { championId: null, role: player.primaryRole, comfortScore: 5 },
                  ],
                })
              }
            >
              Add pick
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScoreFields({
  playerId,
  index,
  entry,
  onChange,
}: {
  playerId: string;
  index: number;
  entry: Player['championPool'][number];
  onChange: (playerId: string, index: number, field: string, value: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {(['comfortScore'] as const).map((field) => (
        <label key={field} className="text-xs text-slate-400">
          comfort
          <input
            className="mt-1 w-full rounded border border-[#003566] bg-[#000814] px-2 py-1 text-slate-100 focus:border-[#03b4fb] focus:outline-none"
            type="number"
            min="1"
            max="10"
            value={entry[field]}
            onChange={(event) => onChange(playerId, index, field, Number(event.target.value))}
          />
        </label>
      ))}
    </div>
  );
}
