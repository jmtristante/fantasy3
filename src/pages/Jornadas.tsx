import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { fantasyAPI } from '../services/api';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  return [];
}

const POS_LABELS: Record<number, string> = { 1: 'PO', 2: 'DF', 3: 'MC', 4: 'DL', 5: 'DT' };
const POS_ORDER: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };

function getPointsColor(pts: number): string {
  if (pts >= 10) return 'text-blue-600 dark:text-blue-400';
  if (pts >= 5) return 'text-green-600 dark:text-green-400';
  if (pts > 0) return 'text-yellow-600 dark:text-yellow-400';
  if (pts === 0) return 'text-gray-400';
  return 'text-red-500';
}

export default function Jornadas() {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const { data: currentWeekData, isLoading: loadingWeek } = useQuery({
    queryKey: ['currentWeek'],
    queryFn: () => fantasyAPI.getCurrentWeek(),
  });
  const currentWeek = currentWeekData?.weekNumber ?? currentWeekData?.data?.weekNumber ?? 1;

  if (selectedWeek === null && currentWeek) setSelectedWeek(currentWeek);

  const { data: matchStats, isLoading: loadingStats } = useQuery({
    queryKey: ['matchStats', selectedWeek],
    queryFn: () => fantasyAPI.getMatchStats(selectedWeek!),
    enabled: selectedWeek != null,
    staleTime: 60_000,
  });

  const { data: calendarData, isLoading: loadingCalendar } = useQuery({
    queryKey: ['matchday', selectedWeek],
    queryFn: () => fantasyAPI.getMatchday(selectedWeek!),
    enabled: selectedWeek != null,
    staleTime: 60_000,
  });

  const matches = useMemo(() => {
    const stats = extractArray(matchStats);
    const calendar = extractArray(calendarData);
    const statsMap = new Map<string, any>();
    stats.forEach((s: any) => {
      const key = `${s.local?.id || s.localId}-${s.visitor?.id || s.visitorId}`;
      statsMap.set(key, s);
    });
    if (calendar.length > 0) {
      return calendar.map((c: any) => {
        const key = `${c.local?.id || c.localId}-${c.visitor?.id || c.visitorId}`;
        const stat = statsMap.get(key);
        return stat ? { ...c, ...stat, date: c.date || c.matchDate || stat.date } : c;
      }).sort((a: any, b: any) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return da - db;
      });
    }
    return stats;
  }, [matchStats, calendarData]);

  const loading = loadingWeek || loadingStats || loadingCalendar;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Jornadas</h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSelectedWeek(Math.max(1, (selectedWeek || 1) - 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[40px] text-center">
            J{selectedWeek}
          </span>
          <button onClick={() => setSelectedWeek(Math.min(38, (selectedWeek || 1) + 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Week selector */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {Array.from({ length: 38 }, (_, i) => i + 1).map((week) => (
          <button key={week}
            onClick={() => { setSelectedWeek(week); setSelectedMatch(null); }}
            className={`min-w-[40px] px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedWeek === week
                ? 'bg-indigo-600 text-white shadow-sm'
                : week > currentWeek
                  ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}>
            J{week}
          </button>
        ))}
      </div>

      {/* Matches grid */}
      {/* Matches */}
      {loadingStats || loadingCalendar ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : matches.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center text-gray-400 text-sm">
          Sin datos para esta jornada
        </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {matches.map((match: any) => {
          const matchId = match.id || `${match.local?.id}-${match.visitor?.id}`;
          const localName = match.local?.shortName || match.local?.mainName || match.local?.name || 'Local';
          const visitorName = match.visitor?.shortName || match.visitor?.mainName || match.visitor?.name || 'Visitante';
          const localBadge = match.local?.badgeColor;
          const visitorBadge = match.visitor?.badgeColor;
          const localScore = match.localScore;
          const visitorScore = match.visitorScore;
          const isFinished = match.matchState >= 7;
          const isLive = match.matchState >= 2 && match.matchState < 7;
          const hasData = isFinished || isLive;

          return (
            <button key={matchId}
              onClick={() => setSelectedMatch(match)}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 flex flex-col items-center gap-2 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer">
              {match.date && (
                <span className="text-[8px] text-gray-400">
                  {new Date(match.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} {new Date(match.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <div className="flex items-center gap-2 w-full">
                <div className="flex flex-col items-center flex-1 min-w-0">
                  {localBadge && <img src={localBadge} alt="" className="w-10 h-10 object-contain" />}
                </div>
                <div className="flex flex-col items-center">
                  {hasData ? (
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {localScore} - {visitorScore}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600">vs</span>
                  )}
                  {isLive && <span className="text-[8px] font-bold text-red-500 animate-pulse">EN VIVO</span>}
                </div>
                <div className="flex flex-col items-center flex-1 min-w-0">
                  {visitorBadge && <img src={visitorBadge} alt="" className="w-10 h-10 object-contain" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      )}

      {/* Match detail modal */}
      {selectedMatch && (() => {
        const localName = selectedMatch.local?.mainName || selectedMatch.local?.name || 'Local';
        const visitorName = selectedMatch.visitor?.mainName || selectedMatch.visitor?.name || 'Visitante';
        const localBadge = selectedMatch.local?.badgeColor;
        const visitorBadge = selectedMatch.visitor?.badgeColor;
        const localScore = selectedMatch.localScore ?? '?';
        const visitorScore = selectedMatch.visitorScore ?? '?';
        const localPlayers = (selectedMatch.local?.players || []).sort((a: any, b: any) => (POS_ORDER[a.positionId] ?? 9) - (POS_ORDER[b.positionId] ?? 9));
        const visitorPlayers = (selectedMatch.visitor?.players || []).sort((a: any, b: any) => (POS_ORDER[a.positionId] ?? 9) - (POS_ORDER[b.positionId] ?? 9));

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedMatch(null)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Match header */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                {selectedMatch.date && (
                  <div className="text-[10px] text-gray-400 text-center mb-2">
                    {new Date(selectedMatch.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · {new Date(selectedMatch.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    {localBadge && <img src={localBadge} alt="" className="w-8 h-8 object-contain" />}
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{localName}</span>
                  </div>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{localScore} - {visitorScore}</span>
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">{visitorName}</span>
                    {visitorBadge && <img src={visitorBadge} alt="" className="w-8 h-8 object-contain" />}
                  </div>
                </div>
              </div>

              {/* Player scores */}
              <div className="overflow-y-auto max-h-[70vh]">
                {localPlayers.length === 0 && visitorPlayers.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Sin datos de jugadores</div>
                ) : (
                  <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-800">
                    <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 uppercase">{localName}</div>
                      {localPlayers.map((p: any) => (
                        <button key={p.id}
                          onClick={() => { setSelectedPlayer({ id: p.id, player_master_id: p.id, name: p.name, nickname: p.nickname, images: p.images }); setIsPlayerModalOpen(true); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <img src={p.images?.transparent?.['256x256'] || p.images?.transparent?.['128x128'] || p.images?.transparent?.['64x64']} alt="" className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <span className="text-[9px] font-bold text-gray-400 min-w-[18px]">{POS_LABELS[p.positionId] || '?'}</span>
                          <span className="text-[11px] text-gray-900 dark:text-white flex-1 text-left truncate">{p.nickname || p.name}</span>
                          <span className={`text-[11px] font-bold ${getPointsColor(p.weekPoints ?? 0)}`}>{p.weekPoints ?? 0}</span>
                        </button>
                      ))}
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 uppercase">{visitorName}</div>
                      {visitorPlayers.map((p: any) => (
                        <button key={p.id}
                          onClick={() => { setSelectedPlayer({ id: p.id, player_master_id: p.id, name: p.name, nickname: p.nickname, images: p.images }); setIsPlayerModalOpen(true); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <img src={p.images?.transparent?.['256x256'] || p.images?.transparent?.['128x128'] || p.images?.transparent?.['64x64']} alt="" className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <span className="text-[9px] font-bold text-gray-400 min-w-[18px]">{POS_LABELS[p.positionId] || '?'}</span>
                          <span className="text-[11px] text-gray-900 dark:text-white flex-1 text-left truncate">{p.nickname || p.name}</span>
                          <span className={`text-[11px] font-bold ${getPointsColor(p.weekPoints ?? 0)}`}>{p.weekPoints ?? 0}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Close button */}
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <button onClick={() => setSelectedMatch(null)} className="w-full py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}

      <PlayerDetailModal player={selectedPlayer} isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedPlayer(null); }} />
    </div>
  );
}
