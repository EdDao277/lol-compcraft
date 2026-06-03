import { ChampionSearchInput } from './ChampionSelect';
import type { Role } from '../types/champion';
import type { EnemyPoolEntry } from '../types/player';
import { getChampion } from '../logic/championData';

const roles: Role[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

type Props = {
  enemyPools: EnemyPoolEntry[];
  onChange: (enemyPools: EnemyPoolEntry[]) => void;
};

export function EnemyPoolEditor({ enemyPools, onChange }: Props) {
  const updateEntry = (id: string, field: keyof EnemyPoolEntry, value: string | number | null) => {
    onChange(enemyPools.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)));
  };

  const addChampion = (role: Role) => {
    onChange([...enemyPools, { id: crypto.randomUUID(), championId: null, role, threatScore: 7 }]);
  };

  return (
    <section className="rounded-lg border border-[#003566] bg-[#001D3D] p-4 text-slate-100 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Enemy Pools</h2>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {roles.map((role) => {
          const entries = enemyPools.filter((entry) => entry.role === role);
          return (
            <div key={role} className="rounded-lg border border-[#003566] bg-[#000814]/70 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Enemy {role}</h3>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{role}</p>
                </div>
                <button className="rounded bg-[#03b4fb] px-3 py-2 text-sm font-black text-[#000814] hover:bg-[#38c8ff]" onClick={() => addChampion(role)}>
                  Add champion
                </button>
              </div>

              <div className="space-y-3">
                {entries.length === 0 && <div className="rounded border border-dashed border-[#003566] bg-[#001D3D]/60 p-3 text-sm text-slate-400">No champions added.</div>}
                {entries.map((entry) => {
                  const champion = getChampion(entry.championId);
                  return (
                    <div key={entry.id} className="grid gap-2 rounded border border-[#003566] bg-[#001D3D]/70 p-2 text-sm md:grid-cols-[64px_1fr_110px_90px]">
                      <div className="flex items-center justify-center">
                        {champion ? <img className="h-12 w-12 rounded" src={champion.imageUrl} alt={champion.name} /> : <div className="h-12 w-12 rounded border border-dashed border-[#003566] bg-[#000814]" />}
                      </div>
                      <ChampionSearchInput value={entry.championId} onChange={(value) => updateEntry(entry.id, 'championId', value)} />
                      <label className="text-xs text-slate-400">
                        threat
                        <input
                          className="mt-1 w-full rounded border border-[#003566] bg-[#000814] px-2 py-1 text-slate-100 focus:border-[#03b4fb] focus:outline-none"
                          type="number"
                          min="1"
                          max="10"
                          value={entry.threatScore}
                          onChange={(event) => updateEntry(entry.id, 'threatScore', Number(event.target.value))}
                        />
                      </label>
                      <button className="rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm font-medium text-slate-200 hover:border-[#03b4fb]" onClick={() => onChange(enemyPools.filter((item) => item.id !== entry.id))}>
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
