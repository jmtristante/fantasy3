import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Swords, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { fantasyAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  return [];
}

function processLineup(raw: any): any[] {
  const lineup = raw?.data ? raw.data : raw;
  if (!lineup?.formation) return [];
  const f = lineup.formation;
  const players: any[] = [];
  for (const [posKey, posPlayers] of Object.entries(f)) {
    if (!Array.isArray(posPlayers)) continue;
    const posId = posKey === 'goalkeeper' ? 1 : posKey === 'defender' ? 2 : posKey === 'midfield' ? 3 : posKey === 'striker' ? 4 : 1;
    for (const p of posPlayers) {
      if (!p?.playerMaster) continue;
      players.push({ ...p, positionId: posId });
    }
  }
  return players.sort((a, b) => a.positionId - b.positionId);
}

const POS_LABELS: Record<number, string> = { 1: 'Portero', 2: 'Defensa', 3: 'Centrocampista', 4: 'Delantero' };
const POS_SHORT: Record<number, string> = { 1: 'PO', 2: 'DF', 3: 'MC', 4: 'DL' };
const POS_COLORS: Record<number, string> = {
  1: 'bg-yellow-500', 2: 'bg-blue-500', 3: 'bg-green-500', 4: 'bg-red-500',
};

function getPointsColor(pts: number): string {
  if (pts >= 20) return 'bg-purple-500 text-white';
  if (pts >= 10) return 'bg-blue-500 text-white';
  if (pts >= 5) return 'bg-green-500 text-white';
  if (pts > 0) return 'bg-yellow-500 text-white';
  if (pts === 0) return 'bg-gray-400 text-white';
  return 'bg-red-500 text-white';
}

export default function MiAlineacion() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const user = useAuthStore((s) => s.user);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const { data: currentWeekData, isLoading: loadingWeek } = useQuery({
    queryKey: ['currentWeek'],
    queryFn: () => fantasyAPI.getCurrentWeek(),
    enabled: !!leagueId,
  });
  const currentWeek = currentWeekData?.weekNumber ?? currentWeekData?.data?.weekNumber ?? 1;

  if (selectedWeek === null && currentWeek) setSelectedWeek(currentWeek);

  const { data: standings, isLoading: loadingStandings } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId!),
    enabled: !!leagueId,
    staleTime: 60_000,
  });

  const teams = useMemo(() => extractArray(standings), [standings]);

  const userTeam = useMemo(() => {
    return teams.find((t: any) => {
      const managerId = t.team?.manager?.id || t.userId;
      return managerId === user?.id;
    });
  }, [teams, user]);

  if (!selectedTeamId && userTeam) {
    setSelectedTeamId(String(userTeam.id || userTeam.team?.id));
  }

  const { data: lineupData, isLoading: loadingLineup } = useQuery({
    queryKey: ['lineup', selectedTeamId, selectedWeek],
    queryFn: () => fantasyAPI.getTeamLineup(selectedTeamId!, selectedWeek!),
    enabled: !!selectedTeamId && selectedWeek != null,
    staleTime: 60_000,
  });

  const lineupPlayers = useMemo(() => processLineup(lineupData), [lineupData]);

  const grouped = useMemo(() => {
    const groups: Record<number, any[]> = { 1: [], 2: [], 3: [], 4: [] };
    lineupPlayers.forEach((p: any) => groups[p.positionId]?.push(p));
    return groups;
  }, [lineupPlayers]);

  const weekPoints = useMemo(() => {
    return lineupPlayers.reduce((sum: number, p: any) => {
      const stat = p.playerMaster?.lastStats?.find((s: any) => s.weekNumber === selectedWeek);
      return sum + (stat?.totalPoints ?? 0);
    }, 0);
  }, [lineupPlayers, selectedWeek]);

  const selectedTeam = teams.find((t: any) => String(t.id || t.team?.id) === selectedTeamId);
  const teamName = selectedTeam?.name || selectedTeam?.team?.name || '';

  const loading = loadingWeek || loadingStandings;
  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Mi Alineación</h1>
          </div>
          {selectedWeek != null && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setSelectedWeek(Math.max(1, (selectedWeek || 1) - 1)); }}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[40px] text-center">
                J{selectedWeek}
              </span>
              <button
                onClick={() => { setSelectedWeek(Math.min(currentWeek, (selectedWeek || 1) + 1)); }}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Team selector */}
        <select
          value={selectedTeamId || ''}
          onChange={(e) => setSelectedTeamId(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
        >
          {teams.map((t: any) => {
            const id = String(t.id || t.team?.id);
            const name = t.name || t.team?.name || id;
            const manager = t.manager || t.team?.manager?.managerName || '';
            return <option key={id} value={id}>{name} — {manager}</option>;
          })}
        </select>

        {/* Stats */}
        {teamName && (
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-white">{teamName}</span>
            <span>·</span>
            <span>J{selectedWeek}</span>
            <span>·</span>
            <span className={weekPoints > 0 ? 'text-green-600 dark:text-green-400 font-semibold' : ''}>
              {weekPoints} pts
            </span>
            <span>·</span>
            <span>{lineupPlayers.length}/11</span>
          </div>
        )}
      </div>

      {/* Pitch */}
      {loadingLineup ? (
        <LoadingSpinner />
      ) : lineupPlayers.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center text-gray-400 text-sm">
          Sin datos de alineación para esta jornada
        </div>
      ) : (
        <div className="bg-gradient-to-b from-green-700 to-green-900 rounded-xl p-4 relative overflow-hidden">
          {/* Field markings */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-white rounded-full" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-b-0 border-white rounded-b-none" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-t-0 border-white rounded-t-none" />
          </div>

          {/* Formation rows */}
          <div className="relative space-y-6 py-4">
            {[4, 3, 2, 1].map((posId) => {
              const players = grouped[posId];
              if (!players || players.length === 0) return null;
              return (
                <div key={posId} className="flex justify-center gap-4">
                  {players.map((p: any, i: number) => {
                    const pm = p.playerMaster;
                    const stat = pm.lastStats?.find((s: any) => s.weekNumber === selectedWeek);
                    const pts = stat?.totalPoints ?? null;
                    const img = pm.images?.transparent?.['128x128'] || pm.images?.transparent?.['256x256'] || pm.images?.transparent?.['64x64'];
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedPlayer({ id: pm.id, player_master_id: pm.id, name: pm.name, nickname: pm.nickname, images: pm.images });
                          setIsPlayerModalOpen(true);
                        }}
                        className="flex flex-col items-center gap-1 group"
                      >
                        <div className="relative">
                          <img
                            src={img}
                            alt=""
                            className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/60 shadow-lg group-hover:scale-110 transition-transform"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><circle cx="28" cy="28" r="28" fill="%23ffffff33"/><text x="28" y="35" text-anchor="middle" fill="white" font-size="20">?</text></svg>'; }}
                          />
                          {pts !== null && (
                            <span className={`absolute -bottom-1 -left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow ${getPointsColor(pts)}`}>
                              {pts}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-white drop-shadow text-center leading-tight max-w-[72px] truncate">
                          {pm.nickname || pm.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Player list by position */}
      {lineupPlayers.length > 0 && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((posId) => {
            const players = grouped[posId];
            if (!players || players.length === 0) return null;
            return (
              <div key={posId} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className={`px-3 py-2 flex items-center gap-2 ${POS_COLORS[posId]}`}>
                  <span className="text-[10px] font-bold text-white/80">{POS_SHORT[posId]}</span>
                  <span className="text-xs font-semibold text-white">{POS_LABELS[posId]}s</span>
                  <span className="text-[10px] text-white/70 ml-auto">{players.length}</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {players.map((p: any, i: number) => {
                    const pm = p.playerMaster;
                    const stat = pm.lastStats?.find((s: any) => s.weekNumber === selectedWeek);
                    const pts = stat?.totalPoints ?? null;
                    const img = pm.images?.transparent?.['64x64'] || pm.images?.transparent?.['128x128'];
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedPlayer({ id: pm.id, player_master_id: pm.id, name: pm.name, nickname: pm.nickname, images: pm.images });
                          setIsPlayerModalOpen(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <img
                          src={img}
                          alt=""
                          className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span className="text-xs font-medium text-gray-900 dark:text-white flex-1 text-left truncate">
                          {pm.nickname || pm.name}
                        </span>
                        {pts !== null && (
                          <span className={`text-xs font-bold ${pts > 0 ? 'text-green-600 dark:text-green-400' : pts < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {pts} pts
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PlayerDetailModal
        player={selectedPlayer}
        isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedPlayer(null); }}
      />
    </div>
  );
}
