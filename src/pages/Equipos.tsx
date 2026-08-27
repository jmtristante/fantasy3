import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet, X } from 'lucide-react';
import { fantasyAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/Common/LoadingSpinner';

const POSITIONS: Record<number, string> = { 1: 'PO', 2: 'DF', 3: 'MC', 4: 'DL' };
const POS_CONFIG: Record<number, { label: string; short: string; color: string; headerColor: string }> = {
  1: { label: 'Porteros', short: 'PO', color: 'bg-yellow-500', headerColor: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
  2: { label: 'Defensas', short: 'DF', color: 'bg-blue-500', headerColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  3: { label: 'Centrocampistas', short: 'MC', color: 'bg-green-500', headerColor: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  4: { label: 'Delanteros', short: 'DL', color: 'bg-red-500', headerColor: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
};

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  return [];
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M€`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K€`;
  return `${value}€`;
}

const PRESUPUESTO_INICIAL = 100_000_000;

type SortKey = 'manager' | 'valor' | 'cartera' | 'total';

export default function Equipos() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const laligaUser = useAuthStore((s) => s.laligaUser);
  const [sortBy, setSortBy] = useState<SortKey>('total');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedManager, setSelectedManager] = useState<any>(null);

  const { data: selectedTeamData, isLoading: loadingTeam } = useQuery({
    queryKey: ['teamData', leagueId, selectedManager?.id],
    queryFn: () => fantasyAPI.getTeamData(leagueId!, String(selectedManager?.id)),
    enabled: !!leagueId && !!selectedManager?.id,
  });

  const selectedPlayers = useMemo(() => {
    if (!selectedTeamData) return [];
    const data = selectedTeamData?.data || selectedTeamData;
    return data?.players || [];
  }, [selectedTeamData]);

  const { data: standings, isLoading: loadingStandings } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId!),
    enabled: !!leagueId,
    staleTime: 60_000,
  });

  const { data: activityData, isLoading: loadingActivity } = useQuery({
    queryKey: ['leagueActivity', leagueId],
    queryFn: async () => {
      const all = [];
      for (let page = 0; page < 25; page++) {
        const res = await fantasyAPI.getLeagueActivity(leagueId!, page);
        const arr = extractArray(res);
        if (!arr.length) break;
        all.push(...arr);
        await new Promise((r) => setTimeout(r, 200));
      }
      return all;
    },
    enabled: !!leagueId,
    staleTime: 120_000,
  });

  const teams = useMemo(() => extractArray(standings), [standings]);

  const userTeamId = useMemo(() => {
    for (const t of teams) {
      const uid = t.userId || t.team?.manager?.id || t.team?.userId;
      if (uid && laligaUser?.userId && String(uid) === String(laligaUser.userId)) {
        return String(t.id || t.team?.id);
      }
    }
    return null;
  }, [teams, laligaUser]);

  const { data: userTeamMoney } = useQuery({
    queryKey: ['teamMoney', userTeamId],
    queryFn: () => fantasyAPI.getTeamMoney(userTeamId!),
    enabled: !!userTeamId,
    staleTime: 30_000,
  });

  const carteraPorManager = useMemo(() => {
    if (!activityData?.length) return new Map();
    const cartera = new Map<number, number>();
    const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    for (const a of activityData) {
      const t = a.activityTypeId;
      const amount = num(a.amount);
      const agregar = (mid: any, delta: number) => {
        if (mid == null) return;
        const id = Number(mid);
        cartera.set(id, (cartera.get(id) ?? PRESUPUESTO_INICIAL) + delta);
      };
      if (t === 33) agregar(a.user1Id, amount);
      else if (t === 1) { agregar(a.user1Id, -amount); agregar(a.user2Id, amount); }
      else if (t === 31 || t === 32) agregar(a.user1Id, -amount);
    }

    if (userTeamId) {
      const rawMoney = userTeamMoney?.data ?? userTeamMoney;
      const cashReal = typeof rawMoney === 'number' ? rawMoney : rawMoney?.teamMoney ?? rawMoney?.amount ?? null;
      if (cashReal != null) {
        const mid = Number(laligaUser?.userId);
        const estimado = cartera.get(mid) ?? PRESUPUESTO_INICIAL;
        const bonusDiario = cashReal - estimado;
        if (Number.isFinite(bonusDiario) && bonusDiario !== 0) {
          for (const [id, val] of cartera) cartera.set(id, val + bonusDiario);
          for (const item of teams) {
            const uid = Number(item.userId || item.team?.manager?.id || item.team?.userId);
            if (uid && !cartera.has(uid)) cartera.set(uid, PRESUPUESTO_INICIAL + bonusDiario);
          }
        }
      }
    }

    return cartera;
  }, [activityData, userTeamMoney, userTeamId, laligaUser, teams]);

  const rows = useMemo(() => {
    return teams.map((t: any) => {
      const uid = Number(t.userId || t.team?.manager?.id || t.team?.userId);
      const manager = t.manager || t.team?.manager?.managerName || '—';
      const valor = t.teamValue || t.team?.teamValue || 0;
      const cartera = carteraPorManager.get(uid) ?? PRESUPUESTO_INICIAL;
      return { id: String(t.id || t.team?.id), manager, uid, valor, cartera, total: valor + cartera };
    }).sort((a: any, b: any) => {
      const dir = sortAsc ? 1 : -1;
      if (sortBy === 'manager') return dir * a.manager.localeCompare(b.manager);
      if (sortBy === 'valor') return dir * (a.valor - b.valor);
      if (sortBy === 'cartera') return dir * (a.cartera - b.cartera);
      return dir * (a.total - b.total);
    });
  }, [teams, carteraPorManager, sortBy, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  };

  if (loadingStandings || loadingActivity) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Equipos</h1>
        </div>
        <div className="flex gap-1">
          {(['total', 'valor', 'cartera', 'manager'] as SortKey[]).map((col) => (
            <button key={col} onClick={() => toggleSort(col)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                sortBy === col ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
              }`}>
              {col === 'total' ? 'Total' : col === 'valor' ? 'Valor' : col === 'cartera' ? 'Cartera' : 'A-Z'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {rows.map((row: any) => {
          const isMe = laligaUser?.userId && String(row.uid) === String(laligaUser.userId);
          return (
            <div key={row.id}
              onClick={() => setSelectedManager(row)}
              className={`bg-white dark:bg-gray-900 rounded-xl border p-4 flex flex-col gap-2 cursor-pointer hover:shadow-md transition-all ${
                isMe ? 'border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-200 dark:ring-indigo-800' : 'border-gray-200 dark:border-gray-800'
              }`}>
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-semibold truncate ${isMe ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>
                  {row.manager}
                </span>
                {isMe && <span className="text-[8px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-1 rounded">Tú</span>}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] text-gray-500">Valor</span>
                  <span className="text-[11px] font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency(row.valor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-gray-500">Cartera</span>
                  <span className="text-[11px] text-gray-600 dark:text-gray-400 tabular-nums">{formatCurrency(row.cartera)}</span>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-800 pt-1 flex justify-between">
                  <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Total</span>
                  <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(row.total)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        Cartera estimada a partir de 100M€ iniciales + actividad de mercado
      </p>

      {/* Team players modal */}
      {selectedManager && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setSelectedManager(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{selectedManager.manager}</span>
              <button onClick={() => setSelectedManager(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {loadingTeam ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : selectedPlayers.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Sin datos</div>
              ) : (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((posId) => {
                    const players = selectedPlayers.filter((pt: any) => pt.playerMaster?.positionId === posId);
                    if (players.length === 0) return null;
                    const cfg = POS_CONFIG[posId];
                    return (
                      <div key={posId}>
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1 ${cfg.headerColor}`}>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.color} text-white`}>{cfg.short}</span>
                          <span className="text-[11px] font-semibold">{cfg.label}</span>
                          <span className="text-[10px] opacity-70 ml-auto">{players.length}</span>
                        </div>
                        <div className="space-y-0.5">
                          {players.map((pt: any) => {
                            const pm = pt.playerMaster;
                            if (!pm) return null;
                            const img = pm.images?.transparent?.['256x256'] || pm.images?.transparent?.['128x128'] || null;
                            return (
                              <div key={pt.playerTeamId || pt.id} className="flex items-center gap-3 py-1.5 px-1">
                                {img ? <img src={img} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                                  : <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0"><span className="text-[10px] text-gray-500">{(pm.nickname || pm.name || '?').charAt(0)}</span></div>}
                                <span className="text-[11px] font-medium text-gray-900 dark:text-white flex-1 truncate">{pm.nickname || pm.name}</span>
                                <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{pm.points || 0} pts</span>
                                {pm.team?.badgeColor && <img src={pm.team.badgeColor} alt="" className="w-4 h-4 object-contain flex-shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
