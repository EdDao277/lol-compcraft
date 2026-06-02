import { useMemo, useState } from 'react';
import { champions, getChampion } from '../logic/championData';
import { unavailableChampionIds } from '../logic/draftUtils';
import type { Role } from '../types/champion';
import type { DraftState, DraftSlot, DraftTeam } from '../types/draft';
import type { Player } from '../types/player';
import type { Recommendation } from '../types/recommendation';
import type { SupabaseStatus } from '../services/supabaseStatusService';

type Props = {
  draft: DraftState;
  players: Player[];
  pickRecommendations: Recommendation[];
  banRecommendations: Recommendation[];
  activePage: 'draft' | 'pools';
  championsLoaded: number;
  supabaseStatus: SupabaseStatus;
  onPageChange: (page: 'draft' | 'pools') => void;
  onChange: (draft: DraftState) => void;
  onReset: () => void;
};

const fallbackRoles: Role[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

export function DraftBoard({ draft, players, pickRecommendations, banRecommendations, activePage, championsLoaded, supabaseStatus, onPageChange, onChange, onReset }: Props) {
  const unavailable = unavailableChampionIds(draft.slots);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(draft.slots.find((slot) => !slot.championId)?.id ?? null);
  const [slotMessage, setSlotMessage] = useState<string | null>(null);
  const activeSlot = draft.slots.find((slot) => slot.id === activeSlotId) ?? null;

  const setSlot = (slotId: string, championId: string | null) => {
    onChange({
      ...draft,
      slots: draft.slots.map((slot) => {
        if (slot.id !== slotId) return slot;
        if (slot.team === 'our' && slot.type === 'pick') {
          const playerSlot = slot.assignedPlayerSlot ?? Number(slot.id.split('-').at(-1));
          return { ...slot, championId, assignedPlayerSlot: playerSlot, assignedRole: players[playerSlot - 1]?.primaryRole ?? slot.assignedRole };
        }
        return { ...slot, championId };
      }),
    });
  };

  const assignChampion = (championId: string) => {
    if (!activeSlot) return;
    if (activeSlot.team === 'our' && activeSlot.type === 'pick' && activeSlot.championId) {
      setSlotMessage('That player slot is already filled. Remove the current pick before assigning another champion.');
      return;
    }
    setSlotMessage(null);
    setSlot(activeSlot.id, championId);
    const nextOpenSlot = draft.slots.find((slot) => slot.id !== activeSlot.id && !slot.championId);
    setActiveSlotId(nextOpenSlot?.id ?? activeSlot.id);
  };

  return (
    <section className="min-h-screen overflow-hidden bg-[#000814] text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#003566] bg-[#001D3D] px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <h1 className="text-2xl font-black tracking-wide text-[#FFD60A]">CompCraft</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm text-slate-100 focus:border-[#FFC300] focus:outline-none" value={draft.ourSide} onChange={(event) => onChange({ ...draft, ourSide: event.target.value as DraftState['ourSide'] })}>
            <option value="blue">Our team: Blue side</option>
            <option value="red">Our team: Red side</option>
          </select>
          <button className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600" onClick={onReset}>
            Reset draft
          </button>
          <button className={`rounded px-3 py-2 text-sm font-semibold ${activePage === 'draft' ? 'bg-[#FFC300] text-[#000814]' : 'border border-[#003566] bg-[#000814] text-slate-200 hover:border-[#FFC300]'}`} onClick={() => onPageChange('draft')}>
            Draft
          </button>
          <button className={`rounded px-3 py-2 text-sm font-semibold ${activePage === 'pools' ? 'bg-[#FFC300] text-[#000814]' : 'border border-[#003566] bg-[#000814] text-slate-200 hover:border-[#FFC300]'}`} onClick={() => onPageChange('pools')}>
            Team Pools
          </button>
          <span className="rounded border border-[#003566] px-3 py-2 text-sm text-slate-300">{supabaseStatus === 'connected' ? 'Supabase connected' : 'Using local data'}</span>
          <span className="rounded border border-[#003566] px-3 py-2 text-sm text-slate-300">{championsLoaded} champions</span>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[250px_minmax(620px,1fr)_250px]">
        <RecommendationRail title="Pick Ideas" recommendations={pickRecommendations} />
        <DraftStage draft={draft} players={players} activeSlot={activeSlot} activeSlotId={activeSlotId} unavailable={unavailable} slotMessage={slotMessage} onSelectSlot={setActiveSlotId} onClearSlot={setSlot} onAssignChampion={assignChampion} />
        <RecommendationRail title="Ban Ideas" recommendations={banRecommendations} />
      </div>
    </section>
  );
}

function DraftStage({
  draft,
  players,
  activeSlot,
  activeSlotId,
  unavailable,
  slotMessage,
  onSelectSlot,
  onClearSlot,
  onAssignChampion,
}: {
  draft: DraftState;
  players: Player[];
  activeSlot: DraftSlot | null;
  activeSlotId: string | null;
  unavailable: Set<string>;
  slotMessage: string | null;
  onSelectSlot: (slotId: string) => void;
  onClearSlot: (slotId: string, championId: null) => void;
  onAssignChampion: (championId: string) => void;
}) {
  const leftTeam: DraftTeam = draft.ourSide === 'blue' ? 'our' : 'enemy';
  const rightTeam: DraftTeam = draft.ourSide === 'red' ? 'our' : 'enemy';

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-[1fr_34px_1fr] items-stretch gap-2">
        <TeamDraftBlock team={leftTeam} title="TEAM ONE" accent="blue" draft={draft} players={leftTeam === 'our' ? players : []} activeSlotId={activeSlotId} onSelectSlot={onSelectSlot} onClearSlot={onClearSlot} />
        <div className="flex flex-col items-center justify-center rounded bg-[#000814] text-xs font-bold uppercase text-[#FFC300]">
          VS
        </div>
        <TeamDraftBlock team={rightTeam} title="TEAM TWO" accent="red" draft={draft} players={rightTeam === 'our' ? players : []} activeSlotId={activeSlotId} onSelectSlot={onSelectSlot} onClearSlot={onClearSlot} />
      </div>
      {slotMessage && <div className="rounded border border-[#FFC300] bg-[#FFC300]/10 px-3 py-2 text-sm text-[#FFD60A]">{slotMessage}</div>}
      <ChampionSearch activeSlot={activeSlot} ourSide={draft.ourSide} unavailable={unavailable} onAssignChampion={onAssignChampion} />
    </div>
  );
}

function TeamDraftBlock({
  team,
  title,
  accent,
  draft,
  players,
  activeSlotId,
  onSelectSlot,
  onClearSlot,
}: {
  team: DraftTeam;
  title: string;
  accent: 'blue' | 'red';
  draft: DraftState;
  players: Player[];
  activeSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  onClearSlot: (slotId: string, championId: null) => void;
}) {
  const banSlots = draft.slots.filter((slot) => slot.team === team && slot.type === 'ban');
  const pickSlots = draft.slots.filter((slot) => slot.team === team && slot.type === 'pick');
  const accentClasses = accent === 'blue' ? 'border-[#003566] bg-[#001D3D]/45' : 'border-red-700/80 bg-red-950/25';

  return (
    <div className={`rounded border ${accentClasses}`}>
      <div className="flex items-center justify-between border-b border-[#003566] px-3 py-2">
        <h3 className="text-sm font-black uppercase tracking-wide">{title}</h3>
        <span className="text-xs font-semibold uppercase text-[#FFC300]">Ban</span>
      </div>

      <div className="grid grid-cols-5 border-b border-[#003566]">
        {banSlots.map((slot) => (
          <SlotButton key={slot.id} slot={slot} active={slot.id === activeSlotId} variant="ban" onSelect={() => onSelectSlot(slot.id)} />
        ))}
      </div>

      <div className="grid grid-cols-5">
        {pickSlots.map((slot, index) => {
          const player = players[index];
          return (
            <PickColumn
              key={slot.id}
              slot={slot}
              active={slot.id === activeSlotId}
              playerName={`Player ${index + 1}`}
              role={player?.primaryRole ?? fallbackRoles[index]}
              onSelect={() => onSelectSlot(slot.id)}
              onClear={() => onClearSlot(slot.id, null)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PickColumn({
  slot,
  active,
  playerName,
  role,
  onSelect,
  onClear,
}: {
  slot: DraftSlot;
  active: boolean;
  playerName: string;
  role: Role;
  onSelect: () => void;
  onClear: () => void;
}) {
  const champion = getChampion(slot.championId);

  return (
    <div className={`min-w-0 border-r border-[#003566] last:border-r-0 ${active ? 'bg-[#FFC300]/15' : 'bg-[#000814]/70'}`}>
      <button className="flex h-28 w-full flex-col items-center justify-center gap-2 p-2" onClick={onSelect}>
        {champion ? <img className="h-14 w-14 rounded object-cover" src={champion.imageUrl} alt={champion.name} /> : <div className="h-14 w-14 rounded border border-dashed border-[#003566] bg-[#001D3D]" />}
        <span className="max-w-full truncate text-xs font-semibold">{champion?.name ?? 'Empty'}</span>
      </button>
      <div className="border-t border-[#003566] px-2 py-2 text-center">
        <p className="truncate text-xs font-semibold text-slate-300">{playerName}</p>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">{role}</p>
        {slot.championId && (
          <button className="mt-1 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-[#003566] hover:text-slate-100" onClick={onClear}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function SlotButton({ slot, active, variant, onSelect }: { slot: DraftSlot; active: boolean; variant: 'ban'; onSelect: () => void }) {
  const champion = getChampion(slot.championId);
  return (
    <button
      className={`flex aspect-square w-full items-center justify-center border-r border-[#003566] p-1 transition last:border-r-0 ${
        active ? 'bg-[#FFC300]/15 shadow-[inset_0_0_0_2px_rgba(255,211,10,0.65)]' : 'bg-[#000814] hover:bg-[#001D3D]'
      }`}
      onClick={onSelect}
      aria-label={`${variant} slot`}
    >
      {champion ? <img className="h-10 w-10 rounded object-cover" src={champion.imageUrl} alt={champion.name} /> : <div className="h-9 w-9 rounded border border-dashed border-[#003566] bg-[#001D3D]" />}
    </button>
  );
}

function ChampionSearch({ activeSlot, ourSide, unavailable, onAssignChampion }: { activeSlot: DraftSlot | null; ourSide: DraftState['ourSide']; unavailable: Set<string>; onAssignChampion: (championId: string) => void }) {
  const [query, setQuery] = useState('');
  const filteredChampions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return champions.filter((champion) => champion.name.toLowerCase().includes(normalized) || champion.id.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <div className="mx-auto max-w-[760px] rounded border border-[#003566] bg-black p-3">
      <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
        <div>
          <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-[#FFD60A]">Champion Search</h3>
          <p className="text-center text-xs text-slate-500">
            Active slot: {activeSlot ? `${getDisplayTeamName(activeSlot.team, ourSide)} ${activeSlot.type}` : 'none selected'}
          </p>
          <p className="mt-1 text-center text-xs text-slate-500">
            Showing {filteredChampions.length} of {champions.length} champions
          </p>
        </div>
        <input
          className="w-full rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#FFC300] focus:outline-none sm:w-72"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search champion..."
        />
      </div>
      <div className="grid max-h-[360px] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {filteredChampions.map((champion) => {
          const disabled = unavailable.has(champion.id);
          return (
            <button
              key={champion.id}
              className={`rounded border p-2 text-center transition ${
                disabled || !activeSlot ? 'cursor-not-allowed border-[#003566] bg-[#000814] opacity-35' : 'border-[#003566] bg-[#000814] hover:border-[#FFC300] hover:bg-[#001D3D]'
              }`}
              disabled={disabled || !activeSlot}
              onClick={() => onAssignChampion(champion.id)}
            >
              <img className="mx-auto h-10 w-10 rounded object-cover" src={champion.imageUrl} alt={champion.name} />
              <p className="mt-1 truncate text-[10px] uppercase">{champion.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getDisplayTeamName(team: DraftTeam, ourSide: DraftState['ourSide']) {
  if (team === 'our') return ourSide === 'blue' ? 'Team One' : 'Team Two';
  return ourSide === 'blue' ? 'Team Two' : 'Team One';
}

function RecommendationRail({ title, recommendations }: { title: string; recommendations: Recommendation[] }) {
  return (
    <aside className="min-h-[540px] rounded border border-[#003566] bg-[#001D3D]/45 p-3">
      <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-[#FFC300]">{title}</h3>
      <div className="space-y-3">
        {recommendations.length === 0 && <p className="text-sm text-slate-500">Add your team pools to unlock recommendations.</p>}
        {recommendations.map((recommendation) => (
          <article key={`${title}-${recommendation.id}`} className="rounded border border-[#003566] bg-[#000814]/90 p-3">
            <div className="flex items-center gap-2">
              <img className="h-10 w-10 rounded object-cover" src={recommendation.championIcon} alt={recommendation.championName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{recommendation.championName}</p>
                <p className="text-xs text-slate-500">{recommendation.kind}</p>
              </div>
              <span className="rounded bg-[#FFC300] px-2 py-1 text-xs font-black text-[#000814]">{recommendation.score}</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {recommendation.playerName} - {recommendation.role}
            </p>
            {(recommendation.draftPlanIdentity || recommendation.draftPhase) && (
              <p className="mt-1 text-xs text-slate-500">
                {recommendation.draftPlanIdentity ? `Plan: ${recommendation.draftPlanIdentity}` : ''}
                {recommendation.draftPlanIdentity && recommendation.draftPhase ? ' - ' : ''}
                {recommendation.draftPhase ? `Phase: ${recommendation.draftPhase}` : ''}
              </p>
            )}
            {recommendation.scoreBreakdown && (
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-400">
                <span>Player {recommendation.scoreBreakdown.playerFit}</span>
                <span>Plan {recommendation.scoreBreakdown.draftPlanFit}</span>
                <span>Need {recommendation.scoreBreakdown.teamNeedFit}</span>
                <span>Counter {recommendation.scoreBreakdown.counterPickValue}</span>
                <span>Timing {recommendation.scoreBreakdown.timingValue}</span>
                <span>Stats {recommendation.scoreBreakdown.synergyStats}</span>
                <span>Risk -{recommendation.scoreBreakdown.riskPenalty}</span>
              </div>
            )}
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#FFC300]">Why</p>
            <ul className="mt-1 space-y-1 text-xs text-slate-300">
              {getDisplayReasons(recommendation).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {recommendation.risks.length > 0 && !recommendation.risks.every((risk) => risk.toLowerCase().includes('no major risk') || risk.toLowerCase().includes('confirm this ban')) && (
              <>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-red-300">Risks</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-400">
                  {recommendation.risks.slice(0, 2).map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
      </div>
    </aside>
  );
}

function getDisplayReasons(recommendation: Recommendation): string[] {
  const filteredReasons = recommendation.reasons.filter(
    (reason) => !reason.startsWith('High comfort score') && !reason.includes("matches Player") && !reason.includes("fits Player") && !reason.includes("Player-specific"),
  );
  return (filteredReasons.length > 0 ? filteredReasons : recommendation.reasons).slice(0, 3);
}
