import React, { useState, useMemo } from 'react';
import { X, User, MapPin, Trophy, BarChart3, LineChart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getPreciosDiariosJugador, isSupabaseConfigured } from '../../services/supabaseScraping';
import { usePreciosActuales } from '../../contexts/PreciosActualesContext';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LineChartSVG from '../Rentabilidad/LineChartSVG';
import LoadingSpinner from './LoadingSpinner';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  if (res?.data?.elements && Array.isArray(res.data.elements)) return res.data.elements;
  return [];
}

interface PlayerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: any;
}

function formatMoney(v: number) {
  if (!v) return '—';
  return new Intl.NumberFormat('es-ES').format(v) + '€';
}

const POSITIONS: Record<number, string> = { 1: 'Portero', 2: 'Defensa', 3: 'Centrocampista', 4: 'Delantero' };

export default function PlayerDetailModal({ isOpen, onClose, player }: PlayerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'rendimiento' | 'evolucion' | 'desglose'>('rendimiento');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [chartFilter, setChartFilter] = useState<'all' | 'month' | 'week'>('all');
  const { mapeo } = usePreciosActuales();

  // Fetch teams master for team name resolution
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

  // Fetch full player details from API
  const resolvedId = player?.player_master_id || player?.id;
  console.log('[Modal] resolvedId:', resolvedId, 'isOpen:', isOpen, 'leagueId:', useAuthStore.getState().leagueId);
  const { data: playerDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['playerDetails', resolvedId],
    queryFn: async () => {
      const leagueId = useAuthStore.getState().leagueId;
      if (!resolvedId || !leagueId) return null;
      console.log('[Modal] fetching playerDetails for', resolvedId, 'league', leagueId);
      const res = await fantasyAPI.getPlayerDetails(String(resolvedId), leagueId);
      console.log('[Modal] playerDetails result:', JSON.stringify(res)?.slice(0, 200));
      return res?.data || res || null;
    },
    enabled: isOpen && !!resolvedId,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Resolve jugador_id for price history
  const jugadorId = useMemo(() => {
    if (!player) return null;
    if (player.jugador_id) return player.jugador_id;
    const pmId = player.player_master_id || player.id;
    return mapeo.get(Number(pmId)) ?? null;
  }, [player, mapeo]);

  const { data: preciosRows } = useQuery({
    queryKey: ['preciosDiarios', jugadorId],
    queryFn: ({ signal }) => getPreciosDiariosJugador(jugadorId, signal),
    enabled: isOpen && activeTab === 'evolucion' && isSupabaseConfigured() && jugadorId != null,
    staleTime: 5 * 60 * 1000,
  });

  const seriePrecios = useMemo(() => {
    const rows = preciosRows || [];
    const byDay = new Map();
    for (const r of rows) {
      const d = new Date(r.fecha);
      const lbl = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      const ts = d.setHours(0, 0, 0, 0);
      const cur = byDay.get(lbl);
      if (!cur || ts >= cur.ts) byDay.set(lbl, { lbl, ts, valor: r.valor });
    }
    const arr = [...byDay.values()].sort((a, b) => a.ts - b.ts);
    return { fechas: arr.map((x) => x.lbl), datos: arr.map((x) => x.valor) };
  }, [preciosRows]);

  const filteredSeriePrecios = useMemo(() => {
    if (chartFilter === 'all') return seriePrecios;
    const now = Date.now();
    const cutoff = chartFilter === 'week' ? now - 7 * 86400000 : now - 30 * 86400000;
    const rows = preciosRows || [];
    const byDay = new Map();
    for (const r of rows) {
      const d = new Date(r.fecha);
      const ts = d.setHours(0, 0, 0, 0);
      if (ts < cutoff) continue;
      const lbl = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      const cur = byDay.get(lbl);
      if (!cur || ts >= cur.ts) byDay.set(lbl, { lbl, ts, valor: r.valor });
    }
    const arr = [...byDay.values()].sort((a, b) => a.ts - b.ts);
    return { fechas: arr.map((x) => x.lbl), datos: arr.map((x) => x.valor) };
  }, [preciosRows, chartFilter]);

  // Get full player data from API
  const fullPlayer = useMemo(() => {
    if (!player) return null;
    if (playerDetails) {
      const pm = playerDetails.playerMaster || playerDetails;
      return { ...player, ...pm };
    }
    return player;
  }, [player, playerDetails]);

  if (!isOpen || !fullPlayer) return null;

  const pos = fullPlayer.positionId;
  const image = fullPlayer.images?.transparent?.['256x256'] || fullPlayer.foto || null;
  const teamName = fullPlayer.team?.name || fullPlayer.equipo || teamNameMap.get(String(fullPlayer.teamId)) || '';
  const stats = fullPlayer.playerStats || [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="relative bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 sm:px-6 py-3 sm:py-5 flex items-center gap-3 sm:gap-4">
          {image ? (
            <img src={image} alt="" className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl object-contain bg-white/10" />
          ) : (
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-white/10 flex items-center justify-center">
              <span className="text-xl sm:text-2xl font-bold">{(fullPlayer.nickname || fullPlayer.name || '?').charAt(0)}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold truncate">{fullPlayer.nickname || fullPlayer.name}</h2>
            <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5 sm:gap-y-1 text-xs sm:text-sm text-white/80 mt-0.5 sm:mt-1">
              <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{POSITIONS[pos] || '?'}</span>
              {teamName && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{teamName}</span>}
              {fullPlayer.lastSeasonPoints ? <span className="inline-flex items-center gap-1 hidden sm:inline-flex"><Trophy className="w-3.5 h-3.5" />T. pasada: {fullPlayer.lastSeasonPoints} pts</span> : null}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-3 sm:px-6">
          <button onClick={() => setActiveTab('rendimiento')} className={`flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'rendimiento' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Rendimiento
          </button>
          <button onClick={() => setActiveTab('evolucion')} className={`flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'evolucion' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            <LineChart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Evolución
          </button>
          <button onClick={() => setActiveTab('desglose')} className={`flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'desglose' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Desglose
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {activeTab === 'rendimiento' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 sm:p-3 text-center">
                  <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{fullPlayer.points || 0}</p>
                  <p className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400">Puntos</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 sm:p-3 text-center">
                  <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(fullPlayer.marketValue)}</p>
                  <p className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400">Valor</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 sm:p-3 text-center">
                  <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{fullPlayer.averagePoints || 0}</p>
                  <p className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400">Promedio</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 sm:p-3 text-center">
                  <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{stats.length}</p>
                  <p className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400">Jornadas</p>
                </div>
              </div>
            </div>
          ) : activeTab === 'desglose' ? (
            <div className="space-y-4">
              {stats.length > 0 ? (
                <>
                  
                  {/* Bar chart */}
                  <div className="flex gap-1 overflow-x-auto pb-2">
                    {[...stats].sort((a: any, b: any) => a.weekNumber - b.weekNumber).map((s: any) => {
                      const maxPts = 20;
                      const h = Math.max(4, (Math.abs(s.totalPoints) / maxPts) * 60);
                      const color = s.totalPoints >= 10 ? 'bg-indigo-500' : s.totalPoints >= 5 ? 'bg-green-500' : s.totalPoints > 0 ? 'bg-yellow-500' : 'bg-gray-200 dark:bg-gray-700';
                      const isSelected = selectedWeek === s.weekNumber;
                      return (
                        <button
                          key={s.weekNumber}
                          onClick={() => setSelectedWeek(isSelected ? null : s.weekNumber)}
                          className={`flex flex-col items-center gap-1 min-w-[40px] p-1 rounded transition-all ${isSelected ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                        >
                          <div className={`w-8 rounded-t ${color}`} style={{ height: `${h}px` }} />
                          <span className="text-[9px] text-gray-500">J{s.weekNumber}</span>
                          <span className="text-[9px] font-bold text-gray-700 dark:text-gray-300">{s.totalPoints}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected matchday detail */}
                  {selectedWeek != null && (() => {
                    const stat = stats.find((s: any) => s.weekNumber === selectedWeek);
                    if (!stat) return null;
                    const STAT_LABELS: Record<string, string> = {
                      mins_played: 'Minutos', goals: 'Goles', goal_assist: 'Asistencias',
                      offtarget_att_assist: 'Asist. No Gol', pen_area_entries: 'Área Penal',
                      penalty_won: 'Penaltis', penalty_save: 'Paradas Pen.',
                      saves: 'Paradas', effective_clearance: 'Despejes',
                      penalty_failed: 'Pen. Fallado', own_goals: 'Autogol',
                      goals_conceded: 'Goles Enc.', yellow_card: 'Tarj. Amarilla',
                      second_yellow_card: 'Seg. Amarilla', red_card: 'Tarj. Roja',
                      total_scoring_att: 'Tiros', won_contest: 'Duelos',
                      ball_recovery: 'Recuperaciones', poss_lost_all: 'Pérdidas',
                      penalty_conceded: 'Pen. Concedido', marca_points: 'Marca',
                    };
                    const allStats = Object.entries(stat.stats || {})
                      .map(([key, v]: any) => ({
                        label: STAT_LABELS[key] || key,
                        value: v[0],
                        points: v[1],
                      }));
                    return (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <h5 className="text-xs font-semibold text-gray-900 dark:text-white mb-2">
                          Jornada {selectedWeek} — {stat.totalPoints} pts
                        </h5>
                        <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                          {allStats.map((s, i) => (
                            <div key={i} className="text-center bg-white dark:bg-gray-700 rounded px-1 py-1.5">
                              <p className="text-xs font-bold text-gray-900 dark:text-white">{s.value}</p>
                              <p className="text-[8px] text-gray-500 dark:text-gray-400 leading-tight">{s.label}</p>
                              {s.points != null && s.points !== 0 && (
                                <p className={`text-[8px] font-medium ${s.points > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {s.points > 0 ? '+' : ''}{s.points}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="text-center py-8 text-gray-400">Datos de desglose no disponibles</div>
              )}
            </div>
          ) : (
            <div className="space-y-3 overflow-visible">
              {/* Time range filter */}
              <div className="flex gap-1">
                {([['all', 'Total'], ['month', 'Último mes'], ['week', 'Última semana']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setChartFilter(key)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                      chartFilter === key ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              {filteredSeriePrecios.fechas.length === 0 ? (
                <div className="text-center py-8 text-gray-400">Sin datos de evolución</div>
              ) : (
                <LineChartSVG
                  fechas={filteredSeriePrecios.fechas}
                  series={[{ nombre: fullPlayer.nickname || fullPlayer.name, datos: filteredSeriePrecios.datos, color: '#4F46E5' }]}
                  formatY={(v: number) => { const abs = Math.abs(v); if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`; if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K€`; return `${v}€`; }}
                  height={380}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
