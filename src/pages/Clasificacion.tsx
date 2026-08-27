import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { fantasyAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  return [];
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return `${value}`;
}

const POSITION_MAP: Record<number, string> = {
  1: 'PO', 2: 'DF', 3: 'MC', 4: 'DL',
};

const POSITION_COLORS: Record<number, string> = {
  1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  3: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

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

export default function Clasificacion() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const user = useAuthStore((s) => s.user);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const { data: currentWeekData, isLoading: loadingWeek } = useQuery({
    queryKey: ['currentWeek'],
    queryFn: () => fantasyAPI.getCurrentWeek(),
    enabled: !!leagueId,
  });
  const currentWeek = currentWeekData?.weekNumber ?? currentWeekData?.data?.weekNumber ?? 1;

  if (selectedWeek === null && currentWeek) {
    setSelectedWeek(currentWeek);
  }

  const { data: overallStandings, isLoading: loadingOverall } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId!),
    enabled: !!leagueId,
    staleTime: 60_000,
  });

  const { data: weeklyData, isLoading: loadingWeekly } = useQuery({
    queryKey: ['weeklyRanking', leagueId, selectedWeek],
    queryFn: () => fantasyAPI.getLeagueRankingByWeek(leagueId!, selectedWeek!),
    enabled: !!leagueId && selectedWeek != null,
    staleTime: 60_000,
  });

  const teamsMaster = useQuery({
    queryKey: ['teamsMaster'],
    queryFn: () => fantasyAPI.getTeamsMaster(),
    staleTime: 5 * 60_000,
  });

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    extractArray(teamsMaster.data).forEach((t: any) => {
      map.set(String(t.id), t.name || t.shortName);
    });
    return map;
  }, [teamsMaster.data]);

  const standings = useMemo(() => {
    const overall = extractArray(overallStandings);
    const weekly = extractArray(weeklyData);

    const weeklyMap = new Map<string, any>();
    weekly.forEach((entry: any) => {
      const teamId = String(entry.id || entry.team?.id);
      weeklyMap.set(teamId, entry);
    });

    return overall.map((entry: any) => {
      const teamId = String(entry.id || entry.team?.id);
      const weekEntry = weeklyMap.get(teamId);
      return {
        ...entry,
        teamId,
        weekPoints: weekEntry?.points ?? 0,
        manager: entry.manager || entry.team?.manager?.managerName || '—',
        totalPoints: entry.points || entry.team?.teamPoints || 0,
        teamValue: entry.teamValue || entry.team?.teamValue || 0,
      };
    }).sort((a: any, b: any) => (a.position || 999) - (b.position || 999));
  }, [overallStandings, weeklyData]);

  const { data: lineupData, isLoading: loadingLineup } = useQuery({
    queryKey: ['lineup', expandedTeam, selectedWeek],
    queryFn: () => fantasyAPI.getTeamLineup(expandedTeam!, selectedWeek!),
    enabled: !!expandedTeam && selectedWeek != null,
    staleTime: 60_000,
  });

  const lineupPlayers = useMemo(() => processLineup(lineupData), [lineupData]);

  const loading = loadingWeek || loadingOverall || loadingWeekly;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Clasificación</h1>
      </div>

      {/* Jornada selector */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {Array.from({ length: currentWeek }, (_, i) => i + 1).map((week) => (
          <button
            key={week}
            onClick={() => { setSelectedWeek(week); setExpandedTeam(null); }}
            className={`min-w-[40px] px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedWeek === week
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            J{week}
          </button>
        ))}
      </div>

      {/* Standings table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[40px_1fr_70px_70px] md:grid-cols-[50px_1fr_80px_90px_100px] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">
          <span>Pos</span>
          <span>Manager</span>
          <span className="text-center">Pts J{selectedWeek}</span>
          <span className="text-center">Total</span>
          <span className="text-right hidden md:block">Valor</span>
        </div>

        {/* Rows */}
        {standings.map((entry: any) => {
          const isMe = user?.id === entry.team?.manager?.id || user?.id === entry.userId;
          const isExpanded = expandedTeam === entry.teamId;
          const teamName = teamNameMap.get(entry.teamId) || entry.name;

          return (
            <div key={entry.teamId}>
              <button
                onClick={() => setExpandedTeam(isExpanded ? null : entry.teamId)}
                className={`w-full grid grid-cols-[40px_1fr_70px_70px] md:grid-cols-[50px_1fr_80px_90px_100px] gap-2 px-3 py-2.5 text-left items-center transition-colors ${
                  isMe
                    ? 'bg-indigo-50 dark:bg-indigo-900/10 hover:bg-indigo-100 dark:hover:bg-indigo-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                } ${isExpanded ? 'bg-gray-50 dark:bg-gray-800/50' : ''}`}
              >
                <span className="text-xs font-bold text-gray-900 dark:text-white">
                  {entry.position || '—'}
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-xs font-medium truncate ${isMe ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>
                    {entry.manager}
                  </span>
                  {isMe && <span className="text-[9px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-1 rounded">Tú</span>}
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  )}
                </div>
                <span className={`text-xs font-bold text-center ${entry.weekPoints > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                  {entry.weekPoints}
                </span>
                <span className="text-xs font-semibold text-center text-gray-900 dark:text-white">
                  {entry.totalPoints}
                </span>
                <span className="text-[10px] text-gray-500 text-right hidden md:block">
                  {formatCurrency(entry.teamValue)}
                </span>
              </button>

              {/* Expanded lineup */}
              {isExpanded && (
                <div className="px-3 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                  {loadingLineup ? (
                    <div className="text-xs text-gray-400 text-center py-2">Cargando alineación...</div>
                  ) : lineupPlayers.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-2">Sin datos de alineación</div>
                  ) : (
                    <div className="relative bg-gradient-to-b from-green-800/20 to-green-900/30 rounded-lg p-4 space-y-3">
                      {([1, 2, 3, 4] as const).map((posId) => {
                        const players = lineupPlayers.filter((p: any) => p.positionId === posId);
                        if (players.length === 0) return null;
                        return (
                          <div key={posId} className={`flex justify-center ${players.length >= 5 ? 'gap-1 sm:gap-2' : 'gap-2 sm:gap-3'}`}>
                            {players.map((p: any, i: number) => {
                              const pm = p.playerMaster || {};
                              const weekStat = pm.lastStats?.find((s: any) => s.weekNumber === selectedWeek);
                              const pts = weekStat?.totalPoints ?? null;
                              const img = pm.images?.transparent?.['128x128'] || pm.images?.transparent?.['256x256'] || pm.images?.transparent?.['64x64'];
                              const photoSize = players.length >= 5 ? 'w-11 h-11' : 'w-14 h-14';
                              return (
                                <div key={i} className={`flex flex-col items-center gap-0.5 ${players.length >= 5 ? 'w-14' : 'w-16'}`}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedPlayer({
                                        id: pm.id,
                                        player_master_id: pm.id,
                                        name: pm.name,
                                        nickname: pm.nickname,
                                        images: pm.images,
                                      });
                                      setIsPlayerModalOpen(true);
                                    }}
                                    className="relative"
                                  >
                                    <img
                                      src={img}
                                      alt=""
                                      className={`${photoSize} rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-600 shadow cursor-pointer hover:scale-110 transition-transform`}
                                      onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><circle cx="28" cy="28" r="28" fill="%23374151"/><text x="28" y="35" text-anchor="middle" fill="white" font-size="20">?</text></svg>'; }}
                                    />
                                    {pts !== null && (
                                      <span className={`absolute -bottom-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow ${
                                        pts > 0 ? 'bg-green-500 text-white' : pts < 0 ? 'bg-red-500 text-white' : 'bg-gray-400 text-white'
                                      }`}>
                                        {pts}
                                      </span>
                                    )}
                                  </button>
                                  <span className="text-[10px] font-medium text-gray-900 dark:text-white text-center leading-tight truncate w-full">
                                    {pm.nickname || pm.name || '—'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <PlayerDetailModal
        player={selectedPlayer}
        isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedPlayer(null); }}
      />
    </div>
  );
}
