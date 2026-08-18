import React, { useMemo } from 'react';
import { Card, Spinner } from '@heroui/react';
import { Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fantasyAPI } from '../../services/api';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  if (res?.data?.elements && Array.isArray(res.data.elements)) return res.data.elements;
  if (res?.data?.matches && Array.isArray(res.data.matches)) return res.data.matches;
  return [];
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function UpcomingMatches() {
  const { data: weekData } = useQuery({
    queryKey: ['currentWeek'],
    queryFn: () => fantasyAPI.getCurrentWeek(),
    staleTime: 60 * 60 * 1000,
  });

  const currentWeek = weekData?.data?.weekNumber || weekData?.weekNumber || 1;

  const { data: matchesData, isLoading } = useQuery({
    queryKey: ['matches', currentWeek],
    queryFn: () => fantasyAPI.getMatchday(currentWeek),
    enabled: !!currentWeek,
    staleTime: 15 * 60 * 1000,
  });

  const { data: teamsMasterData } = useQuery({
    queryKey: ['teamsMaster'],
    queryFn: () => fantasyAPI.getTeamsMaster(),
    staleTime: 60 * 60 * 1000,
  });

  const teamsMaster = useMemo(() => {
    const map = new Map<number, any>();
    const arr = extractArray(teamsMasterData);
    arr.forEach((t: any) => map.set(Number(t.id), t));
    return map;
  }, [teamsMasterData]);

  const getTeamName = (id: number) => teamsMaster.get(id)?.name || teamsMaster.get(id)?.shortName || 'TBD';
  const getTeamBadge = (id: number) => teamsMaster.get(id)?.badgeColor || null;

  const matches = useMemo(() => {
    const all = extractArray(matchesData);
    return all
      .filter((m: any) => m.matchState !== 7)
      .sort((a: any, b: any) => {
        if (a.matchState === 2 && b.matchState !== 2) return -1;
        if (a.matchState !== 2 && b.matchState === 2) return 1;
        return new Date(a.matchDate || a.date).getTime() - new Date(b.matchDate || b.date).getTime();
      })
      .slice(0, 5);
  }, [matchesData]);

  return (
    <Card>
      <Card.Header>
        <Card.Title className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Próximos Partidos
        </Card.Title>
      </Card.Header>
      <Card.Content>
        {isLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : matches.length === 0 ? (
          <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
            No hay partidos programados
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((m: any, i: number) => {
              const localName = getTeamName(m.localId);
              const localBadge = getTeamBadge(m.localId);
              const visitorName = getTeamName(m.visitorId);
              const visitorBadge = getTeamBadge(m.visitorId);
              const isLive = m.matchState === 2;
              const hasScore = m.localScore != null && m.visitorScore != null;

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isLive ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {localBadge && <img src={localBadge} alt="" className="w-6 h-6 object-contain flex-shrink-0" />}
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{localName}</span>
                  </div>

                  <div className="flex-shrink-0 text-center px-2">
                    {hasScore ? (
                      <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                        {m.localScore} - {m.visitorScore}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500">vs</span>
                    )}
                    {isLive && (
                      <div className="text-[10px] font-bold text-red-600 dark:text-red-400 mt-0.5">EN VIVO</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate text-right">{visitorName}</span>
                    {visitorBadge && <img src={visitorBadge} alt="" className="w-6 h-6 object-contain flex-shrink-0" />}
                  </div>

                  <div className="hidden sm:block flex-shrink-0 text-right min-w-[100px]">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(m.matchDate || m.date)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
