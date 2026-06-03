import { useMemo, useState } from 'react';
import { champions, getChampion } from '../logic/championData';
import { getChampionMetadata } from '../data/championDraftMetadata';
import { pickedChampionIds, unavailableChampionIds } from '../logic/draftUtils';
import { analyzeEnemyComp, analyzeTeamComp } from '../logic/pickRecommendationAnalysis';
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
        <h1 className="text-2xl font-black tracking-wide text-[#03b4fb]">CompCraft</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SideToggle side={draft.ourSide} onChange={(side) => onChange({ ...draft, ourSide: side })} />
          <button className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600" onClick={onReset}>
            Reset draft
          </button>
          <button className={`rounded px-3 py-2 text-sm font-semibold ${activePage === 'draft' ? 'bg-[#03b4fb] text-[#000814]' : 'border border-[#003566] bg-[#000814] text-slate-200 hover:border-[#03b4fb]'}`} onClick={() => onPageChange('draft')}>
            Draft
          </button>
          <button className={`rounded px-3 py-2 text-sm font-semibold ${activePage === 'pools' ? 'bg-[#03b4fb] text-[#000814]' : 'border border-[#003566] bg-[#000814] text-slate-200 hover:border-[#03b4fb]'}`} onClick={() => onPageChange('pools')}>
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

function SideToggle({ side, onChange }: { side: DraftState['ourSide']; onChange: (side: DraftState['ourSide']) => void }) {
  const isBlue = side === 'blue';
  return (
    <button
      className="relative h-10 w-44 rounded-full border border-[#003566] bg-[#000814] p-1 text-xs font-black uppercase tracking-wide text-white"
      onClick={() => onChange(isBlue ? 'red' : 'blue')}
      aria-label="Toggle team side"
    >
      <span className={`absolute top-1 h-8 w-[82px] rounded-full transition-all ${isBlue ? 'left-1 bg-[#03b4fb]' : 'left-[91px] bg-[#ff0000]'}`} />
      <span className="relative grid h-full grid-cols-2 items-center">
        <span className={isBlue ? 'text-[#000814]' : 'text-slate-400'}>Blue</span>
        <span className={!isBlue ? 'text-white' : 'text-slate-400'}>Red</span>
      </span>
    </button>
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
  const allyChampionIds = pickedChampionIds(draft.slots, 'our');
  const enemyChampionIds = pickedChampionIds(draft.slots, 'enemy');
  const allyComp = analyzeTeamComp(allyChampionIds);
  const enemyComp = analyzeEnemyComp(enemyChampionIds);

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-[1fr_34px_1fr] items-stretch gap-2">
        <TeamDraftBlock team={leftTeam} title="TEAM ONE" accent="blue" draft={draft} players={leftTeam === 'our' ? players : []} activeSlotId={activeSlotId} onSelectSlot={onSelectSlot} onClearSlot={onClearSlot} />
        <div className="flex flex-col items-center justify-center rounded bg-[#000814] text-xs font-bold uppercase text-[#03b4fb]">
          VS
        </div>
        <TeamDraftBlock team={rightTeam} title="TEAM TWO" accent="red" draft={draft} players={rightTeam === 'our' ? players : []} activeSlotId={activeSlotId} onSelectSlot={onSelectSlot} onClearSlot={onClearSlot} />
      </div>
      <DraftAdvantageBar draft={draft} />
      {slotMessage && <div className="rounded border border-[#03b4fb] bg-[#03b4fb]/10 px-3 py-2 text-sm text-[#03b4fb]">{slotMessage}</div>}
      <div className="grid gap-3 xl:grid-cols-[260px_minmax(420px,1fr)_260px]">
        <TeamCompPanel title="Our Comp" championIds={allyChampionIds} strengths={getAllyStrengths(allyComp)} weaknesses={getAllyWeaknesses(allyComp)} />
        <ChampionSearch activeSlot={activeSlot} ourSide={draft.ourSide} unavailable={unavailable} onAssignChampion={onAssignChampion} />
        <TeamCompPanel title="Enemy Comp" championIds={enemyChampionIds} strengths={getEnemyStrengths(enemyComp)} weaknesses={getEnemyWeaknesses(enemyComp)} />
      </div>
    </div>
  );
}

function DraftAdvantageBar({ draft }: { draft: DraftState }) {
  const bluePercent = getDraftAdvantagePercent(draft, 'blue');
  const redPercent = 100 - bluePercent;

  return (
    <div className="rounded border border-[#003566] bg-[#001D3D]/60 px-3 py-2">
      <p className="mb-1 text-center text-xs font-bold text-slate-300">Draft Advantage</p>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-[#03b4fb]">{bluePercent.toFixed(1)}% Blue Side</span>
        <span className="text-[#ff0000]">Red Side {redPercent.toFixed(1)}%</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-[#000814]">
        <div className="bg-[#03b4fb] transition-all" style={{ width: `${bluePercent}%` }} />
        <div className="bg-[#ff0000] transition-all" style={{ width: `${redPercent}%` }} />
      </div>
    </div>
  );
}

function getDraftAdvantagePercent(draft: DraftState, side: 'blue' | 'red') {
  const blueTeam: DraftTeam = draft.ourSide === 'blue' ? 'our' : 'enemy';
  const redTeam: DraftTeam = draft.ourSide === 'red' ? 'our' : 'enemy';
  const blueChampionIds = pickedChampionIds(draft.slots, blueTeam);
  const redChampionIds = pickedChampionIds(draft.slots, redTeam);
  const blueScore = scoreCompStrength(blueChampionIds, redChampionIds);
  const redScore = scoreCompStrength(redChampionIds, blueChampionIds);
  const total = blueScore + redScore;
  const percent = total > 0 ? Math.max(25, Math.min(75, (blueScore / total) * 100)) : 50;
  return side === 'blue' ? percent : 100 - percent;
}

function scoreCompStrength(championIds: string[], enemyChampionIds: string[]) {
  if (championIds.length === 0) return 50;

  const comp = analyzeTeamComp(championIds);
  const enemy = analyzeEnemyComp(enemyChampionIds);
  const metas = championIds.map(getChampionMetadata);
  let score = 45 + championIds.length * 5;

  if (comp.hasFrontline) score += 10;
  if (comp.hasEngage) score += 9;
  if (comp.hasPeel) score += 7;
  if (comp.hasReliableCC) score += 8;
  if (comp.hasWaveclear) score += 6;
  if (comp.hasScalingCarry) score += 6;
  if (comp.hasDisengage) score += 5;
  if (comp.adCount > 0 && comp.apCount > 0) score += 10;
  if (comp.adCount >= 4 || comp.apCount >= 4) score -= 8;

  score -= comp.missingNeeds.length * (championIds.length >= 4 ? 5 : 2);

  if (enemy.hasDive && metas.some((metadata) => metadata.counterTags.includes('CountersDive') || metadata.threatTags.includes('AntiDive'))) score += 7;
  if (enemy.hasHardEngage && metas.some((metadata) => metadata.counterTags.includes('CountersHardEngage') || metadata.threatTags.includes('AntiEngage'))) score += 6;
  if (enemy.hasFrontline && metas.some((metadata) => metadata.counterTags.includes('CountersTanks') || metadata.threatTags.includes('TankKiller'))) score += 6;
  if (enemy.hasImmobileCarries && metas.some((metadata) => metadata.threatTags.includes('ImmobileCarryPunish') || metadata.utilityTags.includes('BacklineAccess'))) score += 6;

  if (enemy.hasDive && metas.some((metadata) => metadata.weaknessTags.includes('WeakToDive') || metadata.weaknessTags.includes('LowMobility'))) score -= 5;
  if (enemy.hasPoke && metas.some((metadata) => metadata.weaknessTags.includes('WeakToPoke') || metadata.weaknessTags.includes('ShortRange'))) score -= 5;
  if (enemy.hasHardEngage && !comp.hasDisengage && !comp.hasPeel) score -= 5;

  return Math.max(10, score);
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
        <span className="text-xs font-semibold uppercase text-[#03b4fb]">Ban</span>
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
    <div className={`min-w-0 border-r border-[#003566] last:border-r-0 ${active ? 'bg-[#03b4fb]/15' : 'bg-[#000814]/70'}`}>
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
        active ? 'bg-[#03b4fb]/15 shadow-[inset_0_0_0_2px_rgba(3,180,251,0.65)]' : 'bg-[#000814] hover:bg-[#001D3D]'
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
    <div className="min-w-0 rounded border border-[#003566] bg-black p-3">
      <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
        <div>
          <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-[#03b4fb]">Champion Search</h3>
          <p className="text-center text-xs text-slate-500">
            Active slot: {activeSlot ? `${getDisplayTeamName(activeSlot.team, ourSide)} ${activeSlot.type}` : 'none selected'}
          </p>
          <p className="mt-1 text-center text-xs text-slate-500">
            Showing {filteredChampions.length} of {champions.length} champions
          </p>
        </div>
        <input
          className="w-full rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#03b4fb] focus:outline-none sm:w-72"
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
                disabled || !activeSlot ? 'cursor-not-allowed border-[#003566] bg-[#000814] opacity-35' : 'border-[#003566] bg-[#000814] hover:border-[#03b4fb] hover:bg-[#001D3D]'
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
      <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-[#03b4fb]">{title}</h3>
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
              <span className="rounded bg-[#03b4fb] px-2 py-1 text-xs font-black text-[#000814]">{recommendation.score}</span>
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
                <span>Network {recommendation.scoreBreakdown.networkStats}</span>
                <span>Risk -{recommendation.scoreBreakdown.riskPenalty}</span>
              </div>
            )}
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#03b4fb]">Why</p>
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

function TeamCompPanel({ title, championIds, strengths, weaknesses }: { title: string; championIds: string[]; strengths: string[]; weaknesses: string[] }) {
  return (
    <div className="mt-4 rounded border border-[#003566] bg-[#000814]/90 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-xs font-black uppercase tracking-wide text-[#03b4fb]">{title}</h4>
        <span className="text-[11px] text-slate-500">{championIds.length}/5 picks</span>
      </div>
      {championIds.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {championIds.map((championId) => {
            const champion = getChampion(championId);
            return champion ? <img key={championId} className="h-7 w-7 rounded object-cover" src={champion.imageUrl} alt={champion.name} title={champion.name} /> : null;
          })}
        </div>
      )}
      <CompList title="Benefits" items={strengths} tone="good" />
      <CompList title="Weaknesses" items={weaknesses} tone="bad" />
    </div>
  );
}

function CompList({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'bad' }) {
  const fallback = tone === 'good' ? 'Need more picks to evaluate.' : 'No major weakness detected from current tags.';
  return (
    <div className="mt-3">
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone === 'good' ? 'text-[#03b4fb]' : 'text-red-300'}`}>{title}</p>
      <ul className="mt-1 space-y-1 text-xs text-slate-300">
        {(items.length > 0 ? items : [fallback]).slice(0, 5).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function getAllyStrengths(comp: ReturnType<typeof analyzeTeamComp>) {
  const strengths: string[] = [];
  if (comp.hasFrontline) strengths.push('Has frontline');
  if (comp.hasEngage) strengths.push('Has engage tools');
  if (comp.hasPeel) strengths.push('Has peel for carries');
  if (comp.hasReliableCC) strengths.push('Has reliable crowd control');
  if (comp.hasWaveclear) strengths.push('Has waveclear');
  if (comp.adCount > 0 && comp.apCount > 0) strengths.push('Mixed damage profile');
  if (comp.hasScalingCarry) strengths.push('Has scaling threat');
  return strengths;
}

function getAllyWeaknesses(comp: ReturnType<typeof analyzeTeamComp>) {
  const weaknesses = comp.missingNeeds.map((need) => {
    if (need === 'APDamage') return 'May lack AP damage';
    if (need === 'ADDamage') return 'May lack AD damage';
    if (need === 'CrowdControl') return 'Needs more crowd control';
    if (need === 'EarlyPressure') return 'May lack early pressure';
    return `Needs ${need.toLowerCase()}`;
  });
  if (comp.adCount >= 4) weaknesses.push('Damage profile is heavily AD');
  if (comp.apCount >= 4) weaknesses.push('Damage profile is heavily AP');
  if (!comp.hasDisengage) weaknesses.push('Limited disengage if enemy forces fights');
  if (!comp.hasPeel) weaknesses.push('Limited peel against backline access');
  if (!comp.hasScalingCarry) weaknesses.push('May lack late-game carry threat');
  return [...new Set(weaknesses)];
}

function getEnemyStrengths(comp: ReturnType<typeof analyzeEnemyComp>) {
  const strengths: string[] = [];
  if (comp.hasDive) strengths.push('Shows dive threat');
  if (comp.hasPoke) strengths.push('Shows poke threat');
  if (comp.hasFrontline) strengths.push('Has frontline');
  if (comp.hasScaling) strengths.push('Has scaling threat');
  if (comp.hasHardEngage) strengths.push('Has hard engage');
  if (comp.adThreats > 0 && comp.apThreats > 0) strengths.push('Mixed damage threats');
  if (comp.mainThreats.length > 0) strengths.push(`Main threats: ${comp.mainThreats.slice(0, 2).join(', ')}`);
  return strengths;
}

function getEnemyWeaknesses(comp: ReturnType<typeof analyzeEnemyComp>) {
  const weaknesses: string[] = [];
  if (comp.hasImmobileCarries) weaknesses.push('Can be punished by backline access');
  if (!comp.hasFrontline) weaknesses.push('May lack frontline');
  if (!comp.hasHardEngage) weaknesses.push('May lack engage');
  if (comp.adThreats > 0 && comp.apThreats === 0) weaknesses.push('Mostly AD damage');
  if (comp.apThreats > 0 && comp.adThreats === 0) weaknesses.push('Mostly AP damage');
  if (!comp.hasScaling) weaknesses.push('May lack scaling');
  if (comp.hasDive && !comp.hasFrontline) weaknesses.push('Dive may be fragile without frontline');
  if (comp.hasPoke && !comp.hasHardEngage) weaknesses.push('Poke comp may struggle to start fights');
  return [...new Set(weaknesses)];
}

function getDisplayReasons(recommendation: Recommendation): string[] {
  const filteredReasons = recommendation.reasons.filter(
    (reason) => !reason.startsWith('High comfort score') && !reason.includes("matches Player") && !reason.includes("fits Player") && !reason.includes("Player-specific"),
  );
  return (filteredReasons.length > 0 ? filteredReasons : recommendation.reasons).slice(0, 3);
}
