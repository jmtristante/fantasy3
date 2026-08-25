import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Filter } from 'lucide-react';
import { fantasyAPI } from '../services/api';
import { usePreciosActuales } from '../contexts/PreciosActualesContext';
import { fetchAllTeamsData, extractTeamPlayers } from '../utils/fetchAllTeamsData';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';
import TrendBadge from '../components/Common/TrendBadge';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  return [];
}

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K€`;
  return `${v}€`;
}

const POSITIONS: Record<number, string> = { 1: 'PO', 2: 'DF', 3: 'MC', 4: 'DL' };
const POS_COLORS: Record<number, string> = {
  1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  3: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

type SortKey = 'name' | 'points' | 'value' | 'prob';

export default function Busqueda() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('points');
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const { data: playersData, isLoading } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 300_000,
  });

  const { precios, mapeo, scrapingPlayers } = usePreciosActuales();

  const { data: teamsMasterData } = useQuery({
    queryKey: ['teamsMaster'],
    queryFn: () => fantasyAPI.getTeamsMaster(),
    staleTime: 600_000,
  });

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    extractArray(teamsMasterData).forEach((t: any) => map.set(String(t.id), t.shortName || t.name));
    return map;
  }, [teamsMasterData]);

  const teamBadgeMap = useMemo(() => {
    const map = new Map<string, string>();
    extractArray(teamsMasterData).forEach((t: any) => { if (t.badgeColor) map.set(String(t.id), t.badgeColor); });
    return map;
  }, [teamsMasterData]);

  const { data: standings } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId!),
    enabled: !!leagueId,
    staleTime: 60_000,
  });

  const ownerMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!standings) return map;
    const teams = extractArray(standings);
    teams.forEach((t: any) => {
      const managerName = t.manager || t.team?.manager?.managerName || '';
      const teamId = String(t.id || t.team?.id);
      const teamData = queryClient.getQueryData(['teamData', leagueId, teamId]);
      const players = extractTeamPlayers(teamData);
      players.forEach((pt: any) => {
        const pmId = String(pt.playerMaster?.id || pt.playerId);
        if (pmId && managerName) map.set(pmId, managerName);
      });
    });
    return map;
  }, [standings, leagueId, queryClient]);

  // Trigger team data fetch
  useQuery({
    queryKey: ['allTeamsOwnership', leagueId],
    queryFn: async () => {
      if (!standings || !leagueId) return null;
      await fetchAllTeamsData(queryClient, leagueId, standings);
      return true;
    },
    enabled: !!standings && !!leagueId,
    staleTime: 300_000,
  });

  const players = useMemo(() => {
    return extractArray(playersData).map((p: any) => {
      const jugadorId = mapeo.get(Number(p.id));
      let probabilidad = null;
      let tendencia = null;
      if (jugadorId != null) {
        const sp = scrapingPlayers.get(jugadorId);
        if (sp?.probabilidad != null) probabilidad = sp.probabilidad;
        const precio = precios.get(jugadorId);
        if (precio?.tendencia != null) tendencia = precio.tendencia;
      }
      const teamName = teamNameMap.get(String(p.teamId || p.team?.id)) || '';
      const teamBadge = teamBadgeMap.get(String(p.teamId || p.team?.id)) || null;
      const owner = ownerMap.get(String(p.id)) || null;
      return { ...p, probabilidad, tendencia, teamName, teamBadge, owner };
    });
  }, [playersData, mapeo, scrapingPlayers, precios, teamNameMap, teamBadgeMap]);

  const filtered = useMemo(() => {
    let result = players;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p: any) => {
        const name = (p.nickname || p.name || '').toLowerCase();
        const team = (p.teamName || '').toLowerCase();
        return name.includes(q) || team.includes(q);
      });
    }
    if (posFilter !== 'all') {
      result = result.filter((p: any) => String(p.positionId) === posFilter);
    }
    result = [...result].sort((a: any, b: any) => {
      if (sortBy === 'name') return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '');
      if (sortBy === 'points') return (b.points || 0) - (a.points || 0);
      if (sortBy === 'value') return (b.marketValue || 0) - (a.marketValue || 0);
      if (sortBy === 'prob') return (b.probabilidad || 0) - (a.probabilidad || 0);
      return 0;
    });
    return result;
  }, [players, search, posFilter, sortBy]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Buscar Jugadores</h1>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} jugadores</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Nombre o equipo..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
          <option value="all">Todas</option>
          <option value="1">PO</option>
          <option value="2">DF</option>
          <option value="3">MC</option>
          <option value="4">DL</option>
        </select>
      </div>

      {/* Sort */}
      <div className="flex gap-1">
        {([['name', 'A-Z'], ['points', 'Puntos'], ['value', 'Valor'], ['prob', 'Titularidad']] as [SortKey, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSortBy(key)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              sortBy === key ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.slice(0, 100).map((p: any) => (
          <button key={p.id} onClick={() => {
            setSelectedPlayer({ id: p.id, player_master_id: p.id, name: p.name, nickname: p.nickname, images: p.images });
            setIsPlayerModalOpen(true);
          }}
            className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all text-left">
            <img src={p.images?.transparent?.['256x256'] || p.images?.transparent?.['128x128'] || p.image} alt=""
              className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">{p.nickname || p.name}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${POS_COLORS[p.positionId] || ''}`}>
                  {POSITIONS[p.positionId] || '?'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {p.teamBadge && <img src={p.teamBadge} alt="" className="w-3 h-3 rounded-full object-contain" />}
                <span className="text-[10px] text-gray-500 truncate">{p.teamName}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs font-bold text-gray-900 dark:text-white">{p.points || 0} pts</div>
              <div className="text-[9px] text-gray-500">{formatMoney(p.marketValue || 0)}</div>
              {p.probabilidad != null && (
                <div className={`text-[9px] font-semibold ${p.probabilidad >= 80 ? 'text-green-600' : p.probabilidad >= 60 ? 'text-yellow-600' : 'text-gray-500'}`}>
                  {p.probabilidad}%
                </div>
              )}
            </div>
            {p.tendencia != null && (
              <div className="flex-shrink-0">
                <TrendBadge tendencia={p.tendencia} />
              </div>
            )}
            {p.owner && (
              <div className="text-[9px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded flex-shrink-0">
                {p.owner}
              </div>
            )}
          </button>
        ))}
      </div>

      {filtered.length > 100 && (
        <p className="text-xs text-gray-400 text-center">Mostrando 100 de {filtered.length} resultados</p>
      )}

      <PlayerDetailModal player={selectedPlayer} isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedPlayer(null); }} />
    </div>
  );
}
