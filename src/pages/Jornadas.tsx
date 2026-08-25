import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
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

  const matches = useMemo(() => extractArray(matchStats), [matchStats]);

  const loading = loadingWeek || loadingStats;

  if (loading) return <LoadingSpinner />;

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
          <button onClick={() => setSelectedWeek(Math.min(currentWeek, (selectedWeek || 1) + 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Week selector */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {Array.from({ length: currentWeek }, (_, i) => i + 1).map((week) => (
          <button key={week}
            onClick={() => { setSelectedWeek(week); setExpandedMatch(null); }}
            className={`min-w-[40px] px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedWeek === week
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}>
            J{week}
          </button>
        ))}
      </div>

      {/* Matches */}
      <div className="space-y-3">
        {matches.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center text-gray-400 text-sm">
            Sin datos para esta jornada
          </div>
        ) : matches.map((match: any) => {
          const matchId = match.id || `${match.local?.id}-${match.visitor?.id}`;
          const isExpanded = expandedMatch === matchId;
          const localName = match.local?.mainName || match.local?.name || 'Local';
          const visitorName = match.visitor?.mainName || match.visitor?.name || 'Visitante';
          const localBadge = match.local?.badgeColor;
          const visitorBadge = match.visitor?.badgeColor;
          const localScore = match.localScore ?? '?';
          const visitorScore = match.visitorScore ?? '?';
          const isFinished = match.matchState >= 7;
          const isLive = match.matchState >= 2 && match.matchState < 7;

          const localPlayers = (match.local?.players || []).sort((a: any, b: any) => (POS_ORDER[a.positionId] ?? 9) - (POS_ORDER[b.positionId] ?? 9));
          const visitorPlayers = (match.visitor?.players || []).sort((a: any, b: any) => (POS_ORDER[a.positionId] ?? 9) - (POS_ORDER[b.positionId] ?? 9));

          return (
            <div key={matchId} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              {/* Match header */}
              <button onClick={() => setExpandedMatch(isExpanded ? null : matchId)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {localBadge && <img src={localBadge} alt="" className="w-6 h-6 object-contain" />}
                  <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">{localName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold ${isFinished ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                    {localScore}
                  </span>
                  <span className="text-[10px] text-gray-400">-</span>
                  <span className={`text-sm font-bold ${isFinished ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                    {visitorScore}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                  <span className="text-xs font-semibold text-gray-900 dark:text-white truncate text-right">{visitorName}</span>
                  {visitorBadge && <img src={visitorBadge} alt="" className="w-6 h-6 object-contain" />}
                </div>
                {isLive && <span className="text-[9px] font-bold text-red-500 animate-pulse">● EN VIVO</span>}
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </button>

              {/* Expanded player scores */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800">
                  <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-800">
                    {/* Local team */}
                    <div>
                      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 uppercase">
                        {localName}
                      </div>
                      <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {localPlayers.length === 0 ? (
                          <div className="px-3 py-2 text-[10px] text-gray-400 text-center">Sin datos</div>
                        ) : localPlayers.map((p: any) => (
                          <button key={p.id}
                            onClick={() => {
                              setSelectedPlayer({ id: p.id, player_master_id: p.id, name: p.name, nickname: p.nickname, images: p.images });
                              setIsPlayerModalOpen(true);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <img src={p.images?.transparent?.['64x64']} alt="" className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            <span className="text-[9px] font-bold text-gray-400 min-w-[18px]">{POS_LABELS[p.positionId] || '?'}</span>
                            <span className="text-[11px] text-gray-900 dark:text-white flex-1 text-left truncate">{p.nickname || p.name}</span>
                            <span className={`text-[11px] font-bold ${getPointsColor(p.weekPoints ?? 0)}`}>
                              {p.weekPoints ?? 0}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Visitor team */}
                    <div>
                      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 uppercase">
                        {visitorName}
                      </div>
                      <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {visitorPlayers.length === 0 ? (
                          <div className="px-3 py-2 text-[10px] text-gray-400 text-center">Sin datos</div>
                        ) : visitorPlayers.map((p: any) => (
                          <button key={p.id}
                            onClick={() => {
                              setSelectedPlayer({ id: p.id, player_master_id: p.id, name: p.name, nickname: p.nickname, images: p.images });
                              setIsPlayerModalOpen(true);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <img src={p.images?.transparent?.['64x64']} alt="" className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            <span className="text-[9px] font-bold text-gray-400 min-w-[18px]">{POS_LABELS[p.positionId] || '?'}</span>
                            <span className="text-[11px] text-gray-900 dark:text-white flex-1 text-left truncate">{p.nickname || p.name}</span>
                            <span className={`text-[11px] font-bold ${getPointsColor(p.weekPoints ?? 0)}`}>
                              {p.weekPoints ?? 0}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <PlayerDetailModal player={selectedPlayer} isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedPlayer(null); }} />
    </div>
  );
}
