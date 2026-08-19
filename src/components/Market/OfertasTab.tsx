import React, { useState, useEffect, useMemo } from 'react';
import { Card, Spinner } from '@heroui/react';
import { Check, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { fantasyAPI } from '../../services/api';
import { useStandings } from '../../hooks/useStandings';
import { usePreciosActuales } from '../../contexts/PreciosActualesContext';
import marketTrendsService from '../../services/marketTrendsService';
import TrendBadge from '../Common/TrendBadge';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import toast from 'react-hot-toast';

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
  return [];
}

export default function OfertasTab() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const queryClient = useQueryClient();
  const [confirmModal, setConfirmModal] = useState<{ offer: any; player: any; action: 'accept' | 'decline' } | null>(null);
  const [playersWithOffers, setPlayersWithOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const { precios, mapeo } = usePreciosActuales();

  const { data: standingsData } = useStandings();

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

  useEffect(() => {
    if (!leagueId) return;
    if (standingsData == null) return;
    if (myTeamId == null) { setLoading(false); return; }

    setLoading(true);
    const fetchOffers = async () => {
      try {
        const marketRes = await fantasyAPI.getMarket(leagueId);
        const marketData = extractArray(marketRes);

        const myPlayersWithOffers = marketData.filter((item: any) =>
          item.discr === 'marketPlayerTeam' &&
          item.numberOfOffers > 0 &&
          item.sellerTeam?.id?.toString() === myTeamId.toString()
        );

        const detailed = await Promise.all(
          myPlayersWithOffers.map(async (player: any) => {
            try {
              const offerRes = await fantasyAPI.getPlayerOffers(leagueId, player.playerTeam?.playerTeamId || player.id);
              return { ...player, offers: extractArray(offerRes) };
            } catch {
              return { ...player, offers: [] };
            }
          })
        );

        setPlayersWithOffers(detailed.filter((p) => p.offers.length > 0));
      } catch (e: any) {
        console.error('Error fetching offers:', e);
      }
      setLoading(false);
    };
    fetchOffers();
  }, [leagueId, myTeamId, standingsData]);

  const handleAccept = async (offer: any, player: any) => {
    try {
      await fantasyAPI.acceptOffer(leagueId!, player.id, offer.id, offer.money || offer.offerMoney);
      toast.success('Oferta aceptada');
      queryClient.invalidateQueries({ queryKey: ['market', leagueId] });
      setConfirmModal(null);
      setPlayersWithOffers((prev) => prev.filter((p) => p.id !== player.id));
    } catch (e: any) { toast.error(e.message || 'Error al aceptar'); }
  };

  const handleDecline = async (offer: any, player: any) => {
    try {
      await fantasyAPI.declineOffer(leagueId!, player.id, offer.id);
      toast.success('Oferta rechazada');
      queryClient.invalidateQueries({ queryKey: ['market', leagueId] });
      setConfirmModal(null);
      setPlayersWithOffers((prev) =>
        prev.map((p) => p.id === player.id ? { ...p, offers: p.offers.filter((o: any) => o.id !== offer.id) } : p)
          .filter((p) => p.offers.length > 0)
      );
    } catch (e: any) { toast.error(e.message || 'Error al rechazar'); }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (playersWithOffers.length === 0) return <div className="py-12 text-center text-gray-400 dark:text-gray-500">No tienes ofertas pendientes</div>;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {playersWithOffers.map((item: any, i: number) => {
          const p = item.playerMaster || {};
          const pos = p.positionId;
          const image = p.images?.transparent?.['256x256'] || null;
          const teamBadge = p.team?.badgeColor || null;

          // Resolve trend from Supabase
          let trendData = null;
          const jugadorId = mapeo.get(Number(p.id));
          if (jugadorId != null) {
            const precio = precios.get(jugadorId);
            if (precio?.tendencia != null) {
              trendData = { tendencia: precio.tendencia, aceleracionEstado: precio.aceleracion_estado };
            }
          }
          if (!trendData && marketTrendsService.marketValuesCache.size > 0) {
            const trend = marketTrendsService.resolveTrendForPlayer(p);
            if (trend) trendData = { tendencia: trend.diferencia1, aceleracionEstado: null };
          }

          const offers = item.offers || [];

          return (
            <Card key={i} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedPlayer(p)}>
              <div className="relative">
                <div className="relative h-36 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                  {image ? (
                    <img src={image} alt="" className="h-32 object-contain" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <span className="text-xl font-bold text-gray-400">{(p.nickname || p.name || '?').charAt(0)}</span>
                    </div>
                  )}
                  <span className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold ${POS_COLORS[pos] || ''}`}>
                    {POSITIONS[pos] || '?'}
                  </span>
                  {trendData && (
                    <div className="absolute top-2 right-2">
                      <TrendBadge tendencia={trendData.tendencia} aceleracionEstado={trendData.aceleracionEstado} />
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 bg-white/90 dark:bg-gray-900/90 rounded-md px-1.5 py-0.5 shadow-sm">
                    <span className="text-[11px] font-bold text-gray-900 dark:text-white tabular-nums">{p.points || 0}</span>
                    <span className="text-[9px] text-gray-500 dark:text-gray-400 ml-0.5">pts</span>
                  </div>
                </div>
              </div>

              <div className="p-3 space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.nickname || p.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      {teamBadge && <img src={teamBadge} alt="" className="w-3.5 h-3.5 object-contain" />}
                      <span className="truncate">{p.team?.name || ''}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wider">Venta</span>
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">{formatMoney(item.salePrice)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valor real</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">{formatMoney(p.marketValue)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {offers.slice(0, 2).map((offer: any, j: number) => {
                    const bidderName = offer.user1Name || offer.userName || offer.buyerName || null;
                    return (
                      <div key={j} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">{formatMoney(offer.money || offer.offerMoney)}</span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            {bidderName || 'Liga'}
                          </span>
                        </div>
                        {offer.status === 'pending' && (
                          <div className="flex gap-1">
                            <button onClick={() => setConfirmModal({ offer, player: item, action: 'accept' })} className="p-1.5 rounded-md bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setConfirmModal({ offer, player: item, action: 'decline' })} className="p-1.5 rounded-md bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {offers.length > 2 && <p className="text-[10px] text-gray-400 text-center">+{offers.length - 2} más</p>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">{confirmModal.action === 'accept' ? 'Aceptar oferta' : 'Rechazar oferta'}</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {confirmModal.action === 'accept'
                  ? `¿Aceptar ${formatMoney(confirmModal.offer.money || confirmModal.offer.offerMoney)} por ${confirmModal.player.playerMaster?.nickname || '?'}?`
                  : `¿Rechazar la oferta de ${formatMoney(confirmModal.offer.money || confirmModal.offer.offerMoney)}?`}
              </p>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setConfirmModal(null)} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium">Cancelar</button>
              <button
                onClick={() => confirmModal.action === 'accept' ? handleAccept(confirmModal.offer, confirmModal.player) : handleDecline(confirmModal.offer, confirmModal.player)}
                className={`flex-1 py-2 rounded-lg text-white text-sm font-semibold ${confirmModal.action === 'accept' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {confirmModal.action === 'accept' ? 'Aceptar' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PlayerDetailModal
        isOpen={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        player={selectedPlayer}
      />
    </>
  );
}
