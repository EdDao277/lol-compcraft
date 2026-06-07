import { useMemo, useState } from 'react';
import type { Role } from '../types/champion';
import type { Player } from '../types/player';
import { champions, getChampion } from '../logic/championData';

const roles: Role[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

type Props = {
  players: Player[];
  onChange: (players: Player[]) => void;
};

type ActivePicker = {
  playerId: string;
  entryIndex: number | 'new';
};

export function PlayerPoolEditor({ players, onChange }: Props) {
  const [activePicker, setActivePicker] = useState<ActivePicker | null>(null);
  const [query, setQuery] = useState('');

  const updatePlayer = (playerId: string, patch: Partial<Player>) => {
    onChange(players.map((player) => (player.id === playerId ? { ...player, ...patch } : player)));
  };

  const updatePlayerRole = (playerId: string, role: Role) => {
    onChange(
      players.map((player) =>
        player.id === playerId
          ? {
              ...player,
              primaryRole: role,
              championPool: player.championPool.map((entry) => ({ ...entry, role })),
            }
          : player,
      ),
    );
  };

  const updatePoolEntry = (playerId: string, index: number, patch: Partial<Player['championPool'][number]>) => {
    onChange(
      players.map((player) =>
        player.id === playerId
          ? {
              ...player,
              championPool: player.championPool.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
            }
          : player,
      ),
    );
  };

  const removePoolEntry = (playerId: string, index: number) => {
    onChange(players.map((player) => (player.id === playerId ? { ...player, championPool: player.championPool.filter((_, entryIndex) => entryIndex !== index) } : player)));
  };

  const openPicker = (playerId: string, entryIndex: number | 'new') => {
    setActivePicker({ playerId, entryIndex });
    setQuery('');
  };

  const chooseChampion = (championId: string) => {
    if (!activePicker) return;
    const player = players.find((item) => item.id === activePicker.playerId);
    if (!player) return;

    if (activePicker.entryIndex === 'new') {
      updatePlayer(player.id, {
        championPool: [...player.championPool, { championId, role: player.primaryRole, comfortScore: 5 }],
      });
    } else {
      updatePoolEntry(player.id, activePicker.entryIndex, { championId, role: player.primaryRole });
    }

    setActivePicker(null);
    setQuery('');
  };

  const removeActiveChampion = () => {
    if (!activePicker || activePicker.entryIndex === 'new') return;
    removePoolEntry(activePicker.playerId, activePicker.entryIndex);
    setActivePicker(null);
    setQuery('');
  };

  return (
    <section className="rounded-lg border border-[#003566] bg-[#001D3D] p-4 text-slate-100 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Team Champion Pools</h2>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {players.map((player) => (
          <div key={player.id} className="relative rounded-lg border border-[#003566] bg-[#000814]/70 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
              <input
                className="rounded border border-[#003566] bg-[#000814] px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#03b4fb] focus:outline-none"
                value={player.name}
                onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                placeholder="Player name"
              />
              <select
                className="rounded border border-[#003566] bg-[#000814] px-2 py-2 text-sm text-slate-100 focus:border-[#03b4fb] focus:outline-none"
                value={player.primaryRole}
                onChange={(event) => updatePlayerRole(player.id, event.target.value as Role)}
              >
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-7 md:grid-cols-8">
              {player.championPool.map((entry, index) => (
                <ChampionPoolTile
                  key={`${player.id}-${index}-${entry.championId ?? 'empty'}`}
                  entry={entry}
                  onOpenPicker={() => openPicker(player.id, index)}
                  onComfortChange={(comfortScore) => updatePoolEntry(player.id, index, { comfortScore })}
                />
              ))}
              <button
                className="flex h-[62px] flex-col items-center justify-center rounded border border-dashed border-[#003566] bg-[#001D3D]/70 text-lg font-black text-[#03b4fb] transition hover:border-[#03b4fb] hover:bg-[#03b4fb]/10"
                onClick={() => openPicker(player.id, 'new')}
                aria-label={`Add champion for ${player.name || player.primaryRole}`}
              >
                +
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Add</span>
              </button>
            </div>
          </div>
        ))}
      </div>
      {activePicker && (
        <ChampionPickerPopover
          query={query}
          playerName={players.find((player) => player.id === activePicker.playerId)?.name ?? 'Player'}
          mode={activePicker.entryIndex === 'new' ? 'add' : 'replace'}
          onQueryChange={setQuery}
          onChoose={chooseChampion}
          onRemove={activePicker.entryIndex === 'new' ? undefined : removeActiveChampion}
          onClose={() => setActivePicker(null)}
        />
      )}
    </section>
  );
}

function ChampionPoolTile({
  entry,
  onOpenPicker,
  onComfortChange,
}: {
  entry: Player['championPool'][number];
  onOpenPicker: () => void;
  onComfortChange: (comfortScore: number) => void;
}) {
  const champion = getChampion(entry.championId);

  return (
    <div className="group relative h-[62px]">
      <button
        className="relative flex h-[62px] w-full items-center justify-center rounded border border-[#003566] bg-[#000814] p-1 transition hover:border-[#03b4fb] focus:border-[#03b4fb] focus:outline-none"
        onClick={onOpenPicker}
        title={champion ? `${champion.name} (${entry.comfortScore}/10)` : 'Choose champion'}
      >
        {champion ? <img className="h-11 w-11 rounded object-cover" src={champion.imageUrl} alt={champion.name} /> : <div className="h-11 w-11 rounded border border-dashed border-[#003566] bg-[#001D3D]" />}
      </button>
      <input
        className="absolute -right-1 -top-1 h-6 w-8 rounded bg-[#03b4fb] text-center text-[11px] font-black text-[#000814] outline-none ring-0 focus:bg-white"
        type="number"
        min="1"
        max="10"
        value={entry.comfortScore}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onComfortChange(clampComfort(Number(event.target.value)))}
        title="Comfort score"
      />
    </div>
  );
}

function ChampionPickerPopover({
  query,
  playerName,
  mode,
  onQueryChange,
  onChoose,
  onRemove,
  onClose,
}: {
  query: string;
  playerName: string;
  mode: 'add' | 'replace';
  onQueryChange: (query: string) => void;
  onChoose: (championId: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const filteredChampions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return champions
      .filter((champion) => champion.name.toLowerCase().includes(normalized) || champion.id.toLowerCase().includes(normalized))
      .slice(0, 48);
  }, [query]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-lg border border-[#03b4fb] bg-[#000814] p-4 shadow-2xl shadow-black/80">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-[#03b4fb]">{mode === 'add' ? 'Add Champion' : 'Replace Champion'}</h3>
            <p className="text-xs text-slate-500">{playerName}</p>
          </div>
          <div className="flex items-center gap-2">
            {onRemove && (
              <button className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600" onClick={onRemove}>
                Remove champion
              </button>
            )}
            <button className="rounded border border-[#003566] px-3 py-2 text-sm font-semibold text-slate-300 hover:border-[#03b4fb]" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <input
          className="mb-3 w-full rounded border border-[#003566] bg-[#001D3D] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#03b4fb] focus:outline-none"
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search champion..."
        />
        <div className="grid max-h-[60vh] grid-cols-5 gap-2 overflow-y-auto pr-1 sm:grid-cols-8 md:grid-cols-10">
          {filteredChampions.map((champion) => (
            <button
              key={champion.id}
              className="rounded border border-[#003566] bg-[#001D3D]/70 p-1 transition hover:border-[#03b4fb] hover:bg-[#03b4fb]/10"
              onClick={() => onChoose(champion.id)}
              title={champion.name}
            >
              <img className="mx-auto h-10 w-10 rounded object-cover" src={champion.imageUrl} alt={champion.name} />
              <p className="mt-1 truncate text-[9px] uppercase text-slate-300">{champion.name}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function clampComfort(value: number) {
  if (Number.isNaN(value)) return 1;
  return Math.max(1, Math.min(10, value));
}
