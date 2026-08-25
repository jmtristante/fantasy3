import React, { useState, useMemo, useCallback } from 'react';
import { Card, Spinner } from '@heroui/react';
import { Search, ShoppingCart, Inbox, Wallet } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { fantasyAPI } from '../services/api';
import marketTrendsService from '../services/marketTrendsService';
import { usePreciosActuales } from '../contexts/PreciosActualesContext';
import TrendBadge from '../components/Common/TrendBadge';
import BidModal from '../components/Market/BidModal';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';
import OfertasTab from '../components/Market/OfertasTab';

const POSITIONS: Record<number, string> = { 1: 'PO', 2: 'DF', 3: 'MC', 4: 'DL' };
const POS_COLORS: Record<number, string> = {
  1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  3: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  if (res?.data?.elements && Array.isArray(res.data.elements)) return res.data.elements;
  return [];
}

function formatMoney(v: number) {
  if (!v) return '—';
  return new Intl.NumberFormat('es-ES').format(v) + '€';
}

function formatHours(dateStr: string | null) {
  if (!dateStr) return '';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Expirado';
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m`;
  return `${h}h`;
}

export default function Market() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const laligaUser = useAuthStore((s) => s.laligaUser);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('all');
  const [sortBy, setSortBy] = useState('price');
  const [bidModal, setBidModal] = useState<{ item: any; isModifying: boolean } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'mercado' | 'ofertas'>('mercado');

  const { data: standings } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId!),
    enabled: !!leagueId,
    staleTime: 60_000,
  });

  const userTeamId = useMemo(() => {
    const teams = extractArray(standings);
    for (const t of teams) {
      const uid = t.userId || t.team?.manager?.id || t.team?.userId;
      if (uid && laligaUser?.userId && String(uid) === String(laligaUser.userId)) {
        return String(t.id || t.team?.id);
      }
    }
    return null;
  }, [standings, laligaUser]);

  const { data: teamMoneyData } = useQuery({
    queryKey: ['teamMoney', userTeamId],
    queryFn: () => fantasyAPI.getTeamMoney(userTeamId!),
    enabled: !!userTeamId,
    staleTime: 30_000,
  });

  const userMoney = useMemo(() => {
    const raw = teamMoneyData?.data ?? teamMoneyData;
    return typeof raw === 'number' ? raw : (raw?.teamMoney ?? raw?.money ?? 0);
  }, [teamMoneyData]);

  const handleCancelBid = async (item: any) => {
    if (!leagueId || !item.myBidId) return;
    try {
      await fantasyAPI.cancelBid(leagueId, item.id, item.myBidId);
      queryClient.invalidateQueries({ queryKey: ['market', leagueId] });
    } catch (e: any) {
      // Ignore cancel errors
    }
  };

  const { data: marketData, isLoading } = useQuery({
    queryKey: ['market', leagueId],
    queryFn: () => fantasyAPI.getMarket(leagueId!),
    enabled: !!leagueId,
    staleTime: 60_000,
  });

  const { data: teamsMasterData } = useQuery({
    queryKey: ['teamsMaster'],
    queryFn: () => fantasyAPI.getTeamsMaster(),
    staleTime: 600_000,
  });

  // Initialize market trends service
  const { data: trendsReady } = useQuery({
    queryKey: ['marketTrends'],
    queryFn: () => marketTrendsService.initialize(),
    staleTime: 3600_000,
  });

  const teamsMap = useMemo(() => {
    const map = new Map<number, any>();
    extractArray(teamsMasterData).forEach((t: any) => map.set(Number(t.id), t));
    return map;
  }, [teamsMasterData]);

  const { precios, mapeo, scrapingPlayers } = usePreciosActuales();

  const items = useMemo(() => {
    return extractArray(marketData)
      .filter((item: any) => item.discr === 'marketPlayerLeague')
      .map((item: any) => {
        const player = item.playerMaster || {};
        const team = teamsMap.get(Number(player.teamId));

        let aceleracionEstado = null;
        let tendencia = null;
        let probabilidad = null;
        const jugadorId = mapeo.get(Number(player.id));
        if (jugadorId != null) {
          const precio = precios.get(jugadorId);
          if (precio) {
            aceleracionEstado = precio.aceleracion_estado || null;
            tendencia = precio.tendencia ?? null;
          }
          const sp = scrapingPlayers.get(jugadorId);
          if (sp?.probabilidad != null) {
            probabilidad = sp.probabilidad;
          }
        }

        if (tendencia == null && marketTrendsService.marketValuesCache.size > 0) {
          const trend = marketTrendsService.resolveTrendForPlayer(player);
          if (trend) tendencia = trend.diferencia1 ?? null;
        }

        return {
          ...item,
          player: {
            ...player,
            teamName: team?.name || player.team?.name || '',
            teamBadge: team?.badgeColor || null,
          },
          trendData: tendencia != null ? { tendencia, aceleracionEstado } : null,
          myBid: item.bid?.money || 0,
          myBidId: item.bid?.id || null,
          probabilidad,
        };
      });
  }, [marketData, teamsMap, precios, mapeo, trendsReady]);

  const totalBids = useMemo(() => {
    return items.reduce((sum: number, item: any) => sum + (item.myBid || 0), 0);
  }, [items]);

  const remainingMoney = userMoney - totalBids;

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((item: any) => {
        const name = (item.player.nickname || item.player.name || '').toLowerCase();
        const team = (item.player.teamName || '').toLowerCase();
        return name.includes(q) || team.includes(q);
      });
    }
    if (posFilter !== 'all') {
      result = result.filter((item: any) => String(item.player.positionId) === posFilter);
    }
    result = [...result].sort((a: any, b: any) => {
      if (sortBy === 'price') return (b.salePrice || 0) - (a.salePrice || 0);
      if (sortBy === 'value') return (b.player.marketValue || 0) - (a.player.marketValue || 0);
      if (sortBy === 'points') return (b.player.points || 0) - (a.player.points || 0);
      if (sortBy === 'name') return (a.player.nickname || a.player.name || '').localeCompare(b.player.nickname || b.player.name || '');
      return 0;
    });
    return result;
  }, [items, search, posFilter, sortBy]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Mercado</h1>
      </div>

      {/* Money summary */}
      {userMoney > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">Cartera:</span>
              <span className="font-bold text-gray-900 dark:text-white">{formatMoney(userMoney)}</span>
            </div>
            {totalBids > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <div>
                  <span className="text-gray-500">Pujas: </span>
                  <span className="font-semibold text-orange-600 dark:text-orange-400">-{formatMoney(totalBids)}</span>
                </div>
                <span className="text-gray-300">|</span>
                <div>
                  <span className="text-gray-500">Disponible: </span>
                  <span className={`font-bold ${remainingMoney >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{formatMoney(remainingMoney)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('mercado')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'mercado'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Mercado
        </button>
        <button
          onClick={() => setActiveTab('ofertas')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'ofertas'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <Inbox className="w-4 h-4" />
          Ofertas
        </button>
      </div>

      {activeTab === 'mercado' ? (
        <>
          {/* Filters */}
          <Card>
        <Card.Content className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar jugador o equipo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-1">
              {(['all', '1', '2', '3', '4'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    posFilter === pos
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  {pos === 'all' ? 'Todos' : POSITIONS[pos]}
                </button>
              ))}
            </div>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-select">
              <option value="price">Precio</option>
              <option value="value">Valor</option>
              <option value="points">Puntos</option>
              <option value="name">Nombre</option>
            </select>
          </div>
        </Card.Content>
      </Card>

      {/* Cards Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-gray-400 dark:text-gray-500">Sin resultados</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item: any, i: number) => {
            const p = item.player;
            const pos = p.positionId;
            const image = p.images?.transparent?.['256x256'] || null;
            const teamBadge = p.team?.badgeColor || null;
            const trendData = item.trendData || null;

            return (
              <Card key={i} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedPlayer(item.player)}>
                <div className="relative">
                  {/* Player Image */}
                  <div className="relative h-36 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                    {image ? (
                      <img src={image} alt="" className="h-32 object-contain" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-xl font-bold text-gray-400">{(p.nickname || p.name || '?').charAt(0)}</span>
                      </div>
                    )}

                    {/* Position badge */}
                    <span className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold ${POS_COLORS[pos] || ''}`}>
                      {POSITIONS[pos] || '?'}
                    </span>

                    {/* Trend badge - top right */}
                    {trendData && (
                      <div className="absolute top-2 right-2">
                        <TrendBadge tendencia={trendData.tendencia} aceleracionEstado={trendData.aceleracionEstado} />
                      </div>
                    )}

                    {/* Time left - bottom left */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1">
                      {item.expirationDate && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm ${
                          formatHours(item.expirationDate) === 'Expirado'
                            ? 'bg-red-500/90 text-white'
                            : 'bg-white/90 dark:bg-gray-900/90 text-gray-700 dark:text-gray-300'
                        }`}>
                          {formatHours(item.expirationDate)}
                        </span>
                      )}
                      {item.numberOfBids > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/90 text-white shadow-sm">
                          {item.numberOfBids} puja{item.numberOfBids > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Points - bottom right */}
                    <div className="absolute bottom-2 right-2 bg-white/90 dark:bg-gray-900/90 rounded-md px-1.5 py-0.5 shadow-sm">
                      <span className="text-[11px] font-bold text-gray-900 dark:text-white tabular-nums">
                        {p.points || 0}
                      </span>
                      <span className="text-[9px] text-gray-500 dark:text-gray-400 ml-0.5">pts</span>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3 space-y-2">
                  {/* Name + Team + Probability */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {p.nickname || p.name || '?'}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        {p.teamBadge && <img src={p.teamBadge} alt="" className="w-3.5 h-3.5 object-contain" />}
                        <span className="truncate">{p.teamName || ''}</span>
                      </div>
                      {item.probabilidad != null && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          {item.probabilidad}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Prices */}
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wider">Venta</span>
                      <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                        {formatMoney(item.salePrice)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valor real</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                        {formatMoney(p.marketValue)}
                      </span>
                    </div>
                  </div>

                  {/* Bid buttons */}
                  {item.myBid > 0 ? (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setBidModal({ item, isModifying: true }); }}
                        className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors"
                      >
                        Modificar ({formatMoney(item.myBid)})
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancelBid(item); }}
                        className="py-2 px-3 rounded-lg border border-red-300 hover:bg-red-50 text-red-600 dark:border-red-700 dark:hover:bg-red-900/20 dark:text-red-400 text-xs font-semibold transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setBidModal({ item, isModifying: false }); }}
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
                    >
                      Pujar
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
        </>
      ) : (
        <OfertasTab />
      )}

    {/* Bid Modal */}
    {bidModal && (
      <BidModal
        isOpen={true}
        onClose={() => setBidModal(null)}
        item={bidModal.item}
        isModifying={bidModal.isModifying}
        currentBid={0}
        onAfterBid={() => {
          queryClient.invalidateQueries({ queryKey: ['market', leagueId] });
          setBidModal(null);
        }}
      />
    )}

    {/* Player Detail Modal */}
    <PlayerDetailModal
      isOpen={!!selectedPlayer}
      onClose={() => setSelectedPlayer(null)}
      player={selectedPlayer}
    />
    </div>
  );
}
