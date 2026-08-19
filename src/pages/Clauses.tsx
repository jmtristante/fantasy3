import React, { useState, useEffect, useMemo } from 'react';
import { Card, Spinner } from '@heroui/react';
import { RefreshCw, Shield, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { fantasyAPI } from '../services/api';
import { useStandings } from '../hooks/useStandings';
import { usePreciosActuales } from '../contexts/PreciosActualesContext';
import marketTrendsService from '../services/marketTrendsService';
import TrendBadge from '../components/Common/TrendBadge';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';
import toast from 'react-hot-toast';
import { getClauseTimeRemaining } from '../utils/clauseUtils';
import { fetchAllTeamsData, extractTeamPlayers } from '../utils/fetchAllTeamsData';

const POSITIONS: Record<number, string> = { 1: 'PO', 2: 'DF', 3: 'MC', 4: 'DL' };
const POS_COLORS: Record<number, string> = {
  1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  3: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function formatMoney(v: number) {
  return new Intl.NumberFormat('es-ES').format(v) + '€';
}

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  if (res?.data?.elements && Array.isArray(res.data.elements)) return res.data.elements;
  return [];
}

export default function Clauses() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: standingsData } = useStandings();
  const { precios, mapeo } = usePreciosActuales();

  const myTeamId = useMemo(() => {
    if (!standingsData) return null;
    const laligaUser = useAuthStore.getState().laligaUser;
    if (!laligaUser?.userId) return null;
    for (const s of extractArray(standingsData)) {
      const uid = String(s.userId || s.team?.userId || s.team?.manager?.id || '');
      if (uid === laligaUser.userId) return s.id || s.team?.id;
    }
    return null;
  }, [standingsData]);

  const [clausesData, setClausesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [sortBy, setSortBy] = useState('clauseValue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [payModal, setPayModal] = useState<any>(null);
  const [payLoading, setPayLoading] = useState(false);

  // Fetch clause data from all teams
  useEffect(() => {
    if (!leagueId || !standingsData) return;
    setLoading(true);

    const fetchClauses = async () => {
      try {
        const standings = extractArray(standingsData);
        console.log('[Clauses] standings:', standings.length);
        const teamsData = await fetchAllTeamsData(queryClient, leagueId, standings, {
          staleTime: 5 * 60 * 1000,
          gcTime: 15 * 60 * 1000,
        });
        console.log('[Clauses] teamsData:', teamsData.size);

        const clauses: any[] = [];
        const now = new Date();

        for (const [teamId, { teamData, entry: rankData }] of teamsData) {
          for (const playerTeam of extractTeamPlayers(teamData)) {
            const player = playerTeam.playerMaster;
            if (!player || !playerTeam.buyoutClause) continue;

            let isLocked = false;
            let unlockTime = null;
            let hoursRemaining = 0;

            if (playerTeam.buyoutClauseLockedEndTime) {
              unlockTime = new Date(playerTeam.buyoutClauseLockedEndTime);
              if (unlockTime > now) {
                isLocked = true;
                hoursRemaining = Math.ceil((unlockTime - now) / (1000 * 60 * 60));
              }
            }

            // Resolve trend
            let trendData = null;
            const jugadorId = mapeo.get(Number(player.id));
            if (jugadorId != null) {
              const precio = precios.get(jugadorId);
              if (precio?.tendencia != null) {
                trendData = { tendencia: precio.tendencia, aceleracionEstado: precio.aceleracion_estado };
              }
            }
            if (!trendData && marketTrendsService.marketValuesCache.size > 0) {
              const trend = marketTrendsService.resolveTrendForPlayer(player);
              if (trend) trendData = { tendencia: trend.diferencia1, aceleracionEstado: null };
            }

            // Resolve probabilidad
            let probabilidad = null;
            if (jugadorId != null) {
              const sp = (await import('../services/supabaseScraping')).getScrapingPlayers ? null : null;
              // Will resolve from context
            }

            clauses.push({
              playerId: player.id,
              playerName: player.nickname || player.name,
              playerImage: player.images?.transparent?.['256x256'] || null,
              teamName: player.team?.name || '',
              teamBadge: player.team?.badgeColor || null,
              positionId: player.positionId,
              position: POSITIONS[player.positionId] || '?',
              points: player.points || 0,
              marketValue: player.marketValue || 0,
              clausulaAmount: playerTeam.buyoutClause,
              ownerName: rankData.name || rankData.team?.manager?.managerName || rankData.name || '?',
              ownerPosition: rankData.position,
              isLocked,
              unlockTime,
              hoursRemaining,
              trendData,
              teamId,
              isMine: myTeamId != null && teamId?.toString() === myTeamId.toString(),
            });
          }
        }

        setClausesData(clauses);
      } catch (e) {
        console.error('Error fetching clauses:', e);
      }
      setLoading(false);
    };

    fetchClauses();
  }, [leagueId, standingsData, queryClient, precios, mapeo]);

  const uniqueOwners = useMemo(
    () => [...new Set(clausesData.map((c) => c.ownerName))].sort(),
    [clausesData]
  );

  const filtered = useMemo(() => {
    let result = clausesData;
    if (!showAll) result = result.filter((c) => !c.isLocked);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.playerName.toLowerCase().includes(q) || c.teamName.toLowerCase().includes(q));
    }
    if (ownerFilter !== 'all') result = result.filter((c) => c.ownerName === ownerFilter);
    if (positionFilter !== 'all') result = result.filter((c) => c.positionId === Number(positionFilter));

    result.sort((a: any, b: any) => {
      let cmp = 0;
      if (sortBy === 'clauseValue') cmp = a.clausulaAmount - b.clausulaAmount;
      else if (sortBy === 'marketValue') cmp = a.marketValue - b.marketValue;
      else if (sortBy === 'points') cmp = a.points - b.points;
      else if (sortBy === 'timeRemaining') cmp = (a.hoursRemaining || 9999) - (b.hoursRemaining || 9999);
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    // Free agents first
    result.sort((a, b) => {
      if (!a.ownerName || a.ownerName === 'Desconocido') return -1;
      if (!b.ownerName || b.ownerName === 'Desconocido') return 1;
      return 0;
    });

    return result;
  }, [clausesData, showAll, search, ownerFilter, positionFilter, sortBy, sortOrder]);

  const handlePay = async (clause: any) => {
    setPayModal(clause);
  };

  const confirmPay = async () => {
    if (!payModal || !leagueId) return;
    setPayLoading(true);
    try {
      await fantasyAPI.payBuyoutClause(leagueId, payModal.playerId, payModal.clausulaAmount);
      toast.success('Cláusula pagada correctamente');
      queryClient.invalidateQueries({ queryKey: ['teamMoney'] });
      setPayModal(null);
      // Refresh clauses
      setLoading(true);
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message || 'Error al pagar');
    }
    setPayLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Cláusulas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {filtered.length} cláusulas {showAll ? 'totales' : 'disponibles'}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); window.location.reload(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar jugador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Show All toggle */}
        <div className="flex gap-1">
          <button onClick={() => setShowAll(false)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${!showAll ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            Disponibles
          </button>
          <button onClick={() => setShowAll(true)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${showAll ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            Todas
          </button>
        </div>

        {/* Position */}
        <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} className="filter-select">
          <option value="all">Todas</option>
          <option value="1">PO</option>
          <option value="2">DF</option>
          <option value="3">MC</option>
          <option value="4">DL</option>
        </select>

        {/* Owner */}
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="filter-select">
          <option value="all">Todos</option>
          {uniqueOwners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-select">
          <option value="clauseValue">Cláusula</option>
          <option value="marketValue">Valor</option>
          <option value="points">Puntos</option>
          <option value="timeRemaining">Tiempo</option>
        </select>

        <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="filter-select flex items-center gap-1">
          {sortOrder === 'desc' ? '↓ Mayor' : '↑ Menor'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <Card>
          <Card.Content className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 w-12"></th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Jugador</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-center">Pos</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-right">Cláusula</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-right">Valor</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-right">Gap</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-center">Tendencia</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-right">Puntos</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-center">Estado</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Manager</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((c, i) => (
                  <tr key={i} onClick={() => setSelectedPlayer({ id: c.playerId, images: c.playerImage ? { transparent: { '256x256': c.playerImage } } : undefined })} className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${c.isLocked ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2">
                      {c.playerImage ? (
                        <img src={c.playerImage} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <span className="text-xs text-gray-500">{c.playerName.charAt(0)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]">{c.playerName}</div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        {c.teamBadge && <img src={c.teamBadge} alt="" className="w-4 h-4 object-contain" />}
                        <span className="truncate">{c.teamName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${POS_COLORS[c.positionId] || ''}`}>{c.position}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-yellow-600 dark:text-yellow-400 tabular-nums">{formatMoney(c.clausulaAmount)}</td>
                    <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300 tabular-nums">{formatMoney(c.marketValue)}</td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums">
                      {c.marketValue > 0 ? (
                        <span className={`font-medium ${((c.clausulaAmount - c.marketValue) / c.marketValue) > 0.1 ? 'text-red-500' : 'text-green-500'}`}>
                          {((c.clausulaAmount - c.marketValue) / c.marketValue * 100).toFixed(0)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {c.trendData ? <TrendBadge tendencia={c.trendData.tendencia} aceleracionEstado={c.trendData.aceleracionEstado} /> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300 tabular-nums">{c.points}</td>
                    <td className="px-4 py-2 text-center">
                      {c.isLocked ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                          <Shield className="w-3 h-3" /> {getClauseTimeRemaining(c.unlockTime)}
                        </span>
                      ) : c.isMine ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Tu jugador</span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); handlePay(c); }} className="text-xs font-medium text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300">
                          Pagar
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{c.ownerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card.Content>
        </Card>
      )}

      {/* Pay Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPayModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Pagar cláusula</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                ¿Pagar <span className="font-semibold">{formatMoney(payModal.clausulaAmount)}</span> por <span className="font-semibold">{payModal.playerName}</span>?
              </p>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setPayModal(null)} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium">Cancelar</button>
              <button onClick={confirmPay} disabled={payLoading} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">
                {payLoading ? 'Procesando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PlayerDetailModal isOpen={!!selectedPlayer} onClose={() => setSelectedPlayer(null)} player={selectedPlayer} />
    </div>
  );
}
