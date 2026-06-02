import { useEffect, useMemo, useState } from 'react';
import { champions } from '../logic/championData';

type ChampionSelectProps = {
  value: string | null;
  onChange: (championId: string | null) => void;
  unavailableIds?: Set<string>;
  placeholder?: string;
};

export function ChampionSelect({ value, onChange, unavailableIds = new Set(), placeholder = 'Select champion' }: ChampionSelectProps) {
  return (
    <select
      className="w-full rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm text-slate-100 shadow-sm focus:border-[#FFC300] focus:outline-none"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {champions.map((champion) => (
        <option key={champion.id} value={champion.id} disabled={unavailableIds.has(champion.id) && champion.id !== value}>
          {champion.name}
        </option>
      ))}
    </select>
  );
}

type ChampionSearchInputProps = {
  value: string | null;
  onChange: (championId: string | null) => void;
  placeholder?: string;
};

export function ChampionSearchInput({ value, onChange, placeholder = 'Search champion...' }: ChampionSearchInputProps) {
  const selectedChampion = useMemo(() => champions.find((champion) => champion.id === value) ?? null, [value]);
  const [query, setQuery] = useState(selectedChampion?.name ?? '');
  const listId = useMemo(() => `champion-search-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    setQuery(selectedChampion?.name ?? '');
  }, [selectedChampion]);

  const chooseChampion = (nextQuery: string) => {
    setQuery(nextQuery);
    const normalized = nextQuery.trim().toLowerCase();
    const match = champions.find((champion) => champion.name.toLowerCase() === normalized || champion.id.toLowerCase() === normalized);
    onChange(match?.id ?? null);
  };

  return (
    <>
      <input
        className="w-full rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#FFC300] focus:outline-none"
        list={listId}
        value={query}
        onChange={(event) => chooseChampion(event.target.value)}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {champions.map((champion) => (
          <option key={champion.id} value={champion.name} />
        ))}
      </datalist>
    </>
  );
}
