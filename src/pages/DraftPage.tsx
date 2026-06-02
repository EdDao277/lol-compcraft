import { useEffect, useMemo, useState } from 'react';
import { DraftBoard } from '../components/DraftBoard';
import { EnemyPoolEditor } from '../components/EnemyPoolEditor';
import { PlayerPoolEditor } from '../components/PlayerPoolEditor';
import { champions } from '../logic/championData';
import { createInitialDraftState } from '../logic/draftUtils';
import { recommendBans } from '../logic/recommendBans';
import { recommendPicks } from '../logic/recommendPicks';
import { getSynergyStats } from '../services/championSynergyStatsService';
import { getSupabaseStatus, type SupabaseStatus } from '../services/supabaseStatusService';
import { createBlankPlayers, loadTeamPlayersOrMock, saveTeamPlayersToSupabase } from '../services/teamDataService';
import type { ChampionSynergyStatsRow } from '../types/database';
import type { DraftState } from '../types/draft';
import type { EnemyPoolEntry, Player } from '../types/player';

type Page = 'draft' | 'pools';

export function DraftPage() {
  const [players, setPlayers] = useState<Player[]>(() => createBlankPlayers());
  const [enemyPools, setEnemyPools] = useState<EnemyPoolEntry[]>([]);
  const [draft, setDraft] = useState<DraftState>(() => createInitialDraftState());
  const [page, setPage] = useState<Page>('draft');
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatus>('local');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('My Team');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [synergyStats, setSynergyStats] = useState<ChampionSynergyStatsRow[]>([]);

  const pickRecommendations = useMemo(() => recommendPicks(draft, players, enemyPools, synergyStats), [draft, players, enemyPools, synergyStats]);
  const banRecommendations = useMemo(() => recommendBans(draft, players, enemyPools), [draft, players, enemyPools]);

  useEffect(() => {
    let isMounted = true;

    async function loadOptionalSupabaseData() {
      const status = await getSupabaseStatus();
      if (!isMounted) return;
      setSupabaseStatus(status);

      if (status === 'connected') {
        const result = await loadTeamPlayersOrMock();
        if (!isMounted) return;
        setPlayers(result.players);
        setTeamId(result.teamId);
        setTeamName(result.teamName);
        if (result.source === 'mock') {
          setSupabaseStatus('local');
        } else {
          const stats = await getSynergyStats();
          if (isMounted) setSynergyStats(stats);
        }
      }
    }

    void loadOptionalSupabaseData();

    return () => {
      isMounted = false;
    };
  }, []);

  const reloadTeam = async () => {
    if (supabaseStatus !== 'connected') {
      setSaveMessage('Supabase is not connected. Using local state only.');
      return;
    }
    const result = await loadTeamPlayersOrMock();
    setPlayers(result.players);
    setTeamId(result.teamId);
    setTeamName(result.teamName);
    setSaveMessage(result.teamId ? 'Reloaded saved team from Supabase.' : 'No saved team yet. Start with these empty slots, then save.');
  };

  const saveTeam = async () => {
    if (supabaseStatus !== 'connected') {
      setSaveMessage('Supabase is not connected. Team pools are local only.');
      return;
    }
    setIsSaving(true);
    setSaveMessage(null);
    const result = await saveTeamPlayersToSupabase(teamName, players);
    setIsSaving(false);
    if (!result) {
      setSaveMessage('Could not save team pools to Supabase. Check table permissions.');
      return;
    }
    setPlayers(result.players);
    setTeamId(result.teamId);
    setTeamName(result.teamName);
    setSaveMessage('Saved team pools to Supabase.');
  };

  return (
    <main className="min-h-screen bg-[#000814] text-slate-100">
      {page === 'draft' ? (
        <DraftBoard
          draft={draft}
          players={players}
          pickRecommendations={pickRecommendations}
          banRecommendations={banRecommendations}
          activePage={page}
          championsLoaded={champions.length}
          supabaseStatus={supabaseStatus}
          onPageChange={setPage}
          onChange={setDraft}
          onReset={() => setDraft(createInitialDraftState())}
        />
      ) : (
        <div className="mx-auto grid min-h-screen max-w-[1500px] gap-5 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#003566] bg-[#001D3D] px-4 py-3">
            <h1 className="text-2xl font-black tracking-wide text-[#FFD60A]">CompCraft</h1>
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm font-semibold text-slate-200 hover:border-[#FFC300]" onClick={() => setPage('draft')}>
                Draft
              </button>
              <button className="rounded bg-[#FFC300] px-3 py-2 text-sm font-black text-[#000814]" onClick={() => setPage('pools')}>
                Team Pools
              </button>
              <SupabaseStatusBadge status={supabaseStatus} />
              <span className="rounded border border-[#003566] px-3 py-2 text-sm text-slate-300">{champions.length} champions loaded</span>
            </div>
          </div>
          <TeamPersistenceBar
            teamName={teamName}
            teamId={teamId}
            supabaseStatus={supabaseStatus}
            saveMessage={saveMessage}
            isSaving={isSaving}
            synergyRows={synergyStats.length}
            onTeamNameChange={setTeamName}
            onSave={saveTeam}
            onReload={reloadTeam}
          />
          <PlayerPoolEditor players={players} onChange={setPlayers} />
          <EnemyPoolEditor enemyPools={enemyPools} onChange={setEnemyPools} />
        </div>
      )}
    </main>
  );
}

function TeamPersistenceBar({
  teamName,
  teamId,
  supabaseStatus,
  saveMessage,
  isSaving,
  synergyRows,
  onTeamNameChange,
  onSave,
  onReload,
}: {
  teamName: string;
  teamId: string | null;
  supabaseStatus: SupabaseStatus;
  saveMessage: string | null;
  isSaving: boolean;
  synergyRows: number;
  onTeamNameChange: (value: string) => void;
  onSave: () => void;
  onReload: () => void;
}) {
  return (
    <section className="rounded-lg border border-[#003566] bg-[#001D3D] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-60 flex-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Team name
          <input
            className="mt-1 w-full rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm normal-case text-slate-100 placeholder:text-slate-500 focus:border-[#FFC300] focus:outline-none"
            value={teamName}
            onChange={(event) => onTeamNameChange(event.target.value)}
            placeholder="My Team"
          />
        </label>
        <button className="rounded bg-[#FFC300] px-4 py-2 text-sm font-black text-[#000814] hover:bg-[#FFD60A] disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving || supabaseStatus !== 'connected'} onClick={onSave}>
          {isSaving ? 'Saving...' : 'Save Team Pools'}
        </button>
        <button className="rounded border border-[#003566] bg-[#000814] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-[#FFC300]" onClick={onReload}>
          Reload
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
        <span>{teamId ? `Team ID: ${teamId}` : 'No saved team yet'}</span>
        <span>{synergyRows.toLocaleString()} synergy rows loaded</span>
        {saveMessage && <span className="text-[#FFD60A]">{saveMessage}</span>}
      </div>
    </section>
  );
}

function SupabaseStatusBadge({ status }: { status: SupabaseStatus }) {
  return (
    <span className="rounded border border-[#003566] px-3 py-2 text-sm text-slate-300">
      {status === 'connected' ? 'Supabase connected' : 'Using local data'}
    </span>
  );
}
