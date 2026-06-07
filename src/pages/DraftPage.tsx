import { useEffect, useMemo, useState } from 'react';
import { DraftBoard } from '../components/DraftBoard';
import { EnemyPoolEditor } from '../components/EnemyPoolEditor';
import { PlayerPoolEditor } from '../components/PlayerPoolEditor';
import { champions } from '../logic/championData';
import { createInitialDraftState } from '../logic/draftUtils';
import { recommendBans } from '../logic/recommendBans';
import { recommendPicks } from '../logic/recommendPicks';
import { getSynergyStats } from '../services/championSynergyStatsService';
import { getNetworkStats, type NetworkStats } from '../services/networkStatsService';
import { getSupabaseStatus, type SupabaseStatus } from '../services/supabaseStatusService';
import { createBlankPlayers, getSavedTeamOptions, loadTeamPlayersById, loadTeamPlayersOrMock, saveTeamPlayersToSupabase, type SavedTeamOption } from '../services/teamDataService';
import { getMlAdvisorScores, getMlAdvisorStatus, type MlAdvisorScores, type MlAdvisorStatus } from '../services/mlAdvisorService';
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
  const [savedTeams, setSavedTeams] = useState<SavedTeamOption[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [synergyStats, setSynergyStats] = useState<ChampionSynergyStatsRow[]>([]);
  const [networkStats, setNetworkStats] = useState<NetworkStats>({ roleStats: [], matchupStats: [], teamCompSignatureStats: [] });
  const [mlAdvisorScores, setMlAdvisorScores] = useState<MlAdvisorScores>({});
  const [mlAdvisorStatus, setMlAdvisorStatus] = useState<MlAdvisorStatus>('checking');

  const pickRecommendations = useMemo(
    () => recommendPicks(draft, players, enemyPools, synergyStats, networkStats.roleStats, networkStats.matchupStats, networkStats.teamCompSignatureStats, mlAdvisorScores),
    [draft, players, enemyPools, synergyStats, networkStats, mlAdvisorScores],
  );
  const banRecommendations = useMemo(
    () => recommendBans(draft, players, enemyPools, networkStats.matchupStats, networkStats.teamCompSignatureStats),
    [draft, players, enemyPools, networkStats.matchupStats, networkStats.teamCompSignatureStats],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadOptionalSupabaseData() {
      const status = await getSupabaseStatus();
      if (!isMounted) return;
      setSupabaseStatus(status);

      if (status === 'connected') {
        const [result, teams, stats, loadedNetworkStats] = await Promise.all([loadTeamPlayersOrMock(), getSavedTeamOptions(), getSynergyStats(), getNetworkStats()]);
        if (!isMounted) return;
        setSavedTeams(teams);
        setPlayers(result.players);
        setTeamId(result.teamId);
        setTeamName(result.teamName);
        setSynergyStats(stats);
        setNetworkStats(loadedNetworkStats);
        if (result.source === 'mock') {
          setSupabaseStatus('local');
        }
      }
    }

    void loadOptionalSupabaseData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshMlAdvisor() {
      const status = await getMlAdvisorStatus();
      if (!cancelled) setMlAdvisorStatus(status);
      const scores = await getMlAdvisorScores(draft, players);
      if (!cancelled) setMlAdvisorScores(scores);
    }

    void refreshMlAdvisor();

    return () => {
      cancelled = true;
    };
  }, [draft, players]);

  const loadTeam = async (nextTeamId: string) => {
    if (supabaseStatus !== 'connected') {
      setSaveMessage('Supabase is not connected. Using local state only.');
      return;
    }
    const result = await loadTeamPlayersById(nextTeamId);
    setPlayers(result.players);
    setTeamId(result.teamId);
    setTeamName(result.teamName);
    setSaveMessage(result.teamId ? `Loaded ${result.teamName}.` : 'Could not load that team.');
  };

  const startNewTeam = () => {
    setTeamId(null);
    setTeamName('My Team');
    setPlayers(createBlankPlayers());
    setSaveMessage('Started a new unsaved team. Save it to create a new Supabase team.');
  };

  const reloadTeam = async () => {
    if (supabaseStatus !== 'connected') {
      setSaveMessage('Supabase is not connected. Using local state only.');
      return;
    }
    const result = teamId ? await loadTeamPlayersById(teamId) : await loadTeamPlayersOrMock();
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
    const result = await saveTeamPlayersToSupabase(teamId, teamName, players);
    setIsSaving(false);
    if (!result) {
      setSaveMessage('Could not save team pools to Supabase. Check table permissions.');
      return;
    }
    setPlayers(result.players);
    setTeamId(result.teamId);
    setTeamName(result.teamName);
    setSavedTeams(await getSavedTeamOptions());
    setSaveMessage(teamId ? 'Saved team pools to Supabase.' : 'Created and saved new team to Supabase.');
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
          mlAdvisorStatus={mlAdvisorStatus}
          onPageChange={setPage}
          onChange={setDraft}
          onReset={() => {
            const nextDraft = createInitialDraftState();
            setDraft({ ...nextDraft, ourSide: draft.ourSide, format: draft.format });
          }}
        />
      ) : (
        <div className="mx-auto grid min-h-screen max-w-[1500px] gap-5 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#003566] bg-[#001D3D] px-4 py-3">
            <h1 className="text-2xl font-black tracking-wide text-[#03b4fb]">CompCraft</h1>
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm font-semibold text-slate-200 hover:border-[#03b4fb]" onClick={() => setPage('draft')}>
                Draft
              </button>
              <button className="rounded bg-[#03b4fb] px-3 py-2 text-sm font-black text-[#000814]" onClick={() => setPage('pools')}>
                Team Pools
              </button>
              <SupabaseStatusBadge status={supabaseStatus} />
              <MlAdvisorStatusBadge status={mlAdvisorStatus} />
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
            savedTeams={savedTeams}
            onTeamNameChange={setTeamName}
            onTeamSelect={(nextTeamId) => void loadTeam(nextTeamId)}
            onNewTeam={startNewTeam}
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
  savedTeams,
  onTeamNameChange,
  onTeamSelect,
  onNewTeam,
  onSave,
  onReload,
}: {
  teamName: string;
  teamId: string | null;
  supabaseStatus: SupabaseStatus;
  saveMessage: string | null;
  isSaving: boolean;
  synergyRows: number;
  savedTeams: SavedTeamOption[];
  onTeamNameChange: (value: string) => void;
  onTeamSelect: (teamId: string) => void;
  onNewTeam: () => void;
  onSave: () => void;
  onReload: () => void;
}) {
  return (
    <section className="rounded-lg border border-[#003566] bg-[#001D3D] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Saved teams
          <select
            className="mt-1 w-full rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm normal-case text-slate-100 focus:border-[#03b4fb] focus:outline-none disabled:opacity-50"
            value={teamId ?? ''}
            disabled={supabaseStatus !== 'connected'}
            onChange={(event) => {
              if (event.target.value) {
                onTeamSelect(event.target.value);
              } else {
                onNewTeam();
              }
            }}
          >
            <option value="">{savedTeams.length > 0 ? 'New unsaved team' : 'No saved teams yet'}</option>
            {savedTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-60 flex-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Team name
          <input
            className="mt-1 w-full rounded border border-[#003566] bg-[#000814] px-3 py-2 text-sm normal-case text-slate-100 placeholder:text-slate-500 focus:border-[#03b4fb] focus:outline-none"
            value={teamName}
            onChange={(event) => onTeamNameChange(event.target.value)}
            placeholder="My Team"
          />
        </label>
        <button className="rounded border border-[#003566] bg-[#000814] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-[#03b4fb] disabled:cursor-not-allowed disabled:opacity-50" disabled={supabaseStatus !== 'connected'} onClick={onNewTeam}>
          New Team
        </button>
        <button className="rounded bg-[#03b4fb] px-4 py-2 text-sm font-black text-[#000814] hover:bg-[#38c8ff] disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving || supabaseStatus !== 'connected'} onClick={onSave}>
          {isSaving ? 'Saving...' : teamId ? 'Save Team Pools' : 'Create Team'}
        </button>
        <button className="rounded border border-[#003566] bg-[#000814] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-[#03b4fb]" onClick={onReload}>
          Reload
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
        <span>{teamId ? `Team ID: ${teamId}` : 'No saved team yet'}</span>
        <span>{synergyRows.toLocaleString()} synergy rows loaded</span>
        {saveMessage && <span className="text-[#03b4fb]">{saveMessage}</span>}
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

function MlAdvisorStatusBadge({ status }: { status: MlAdvisorStatus }) {
  return (
    <span className={`rounded border px-3 py-2 text-sm ${status === 'connected' ? 'border-[#03b4fb] text-[#03b4fb]' : 'border-[#003566] text-slate-400'}`}>
      {status === 'connected' ? 'ML advisor connected' : status === 'checking' ? 'ML advisor checking' : 'ML advisor offline'}
    </span>
  );
}
