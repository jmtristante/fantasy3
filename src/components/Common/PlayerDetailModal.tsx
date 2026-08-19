import React, { useState, useMemo } from 'react';
import { X, User, MapPin, Trophy, BarChart3, LineChart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getPreciosDiariosJugador, isSupabaseConfigured } from '../../services/supabaseScraping';
import { usePreciosActuales } from '../../contexts/PreciosActualesContext';
import LineChartSVG from '../Rentabilidad/LineChartSVG';
import LoadingSpinner from './LoadingSpinner';

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
  const [activeTab, setActiveTab] = useState<'rendimiento' | 'evolucion'>('rendimiento');
  const { mapeo } = usePreciosActuales();

  // Resolve jugador_id for price history
  const jugadorId = useMemo(() => {
    if (!player) return null;
    if (player.jugador_id) return player.jugador_id;
    return mapeo.get(Number(player.id)) ?? null;
  }, [player, mapeo]);

  // Fetch price history for evolution tab
  const { data: preciosRows, isLoading: loadingPrecios } = useQuery({
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

  if (!isOpen || !player) return null;

  const pos = player.positionId;
  const image = player.images?.transparent?.['256x256'] || null;
  const teamName = player.team?.name || '';
  const teamBadge = player.team?.badgeColor || null;
  const stats = player.playerStats || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-5 flex items-center gap-4">
          {image ? (
            <img src={image} alt="" className="w-16 h-16 rounded-xl object-contain bg-white/10" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center">
              <span className="text-2xl font-bold">{(player.nickname || player.name || '?').charAt(0)}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate">{player.nickname || player.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80 mt-1">
              <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{POSITIONS[pos] || '?'}</span>
              {teamName && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{teamName}</span>}
              {player.lastSeasonPoints ? <span className="inline-flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />T. pasada: {player.lastSeasonPoints} pts</span> : null}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-6">
          <button onClick={() => setActiveTab('rendimiento')} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'rendimiento' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            <BarChart3 className="w-4 h-4" />Rendimiento
          </button>
          <button onClick={() => setActiveTab('evolucion')} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'evolucion' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            <LineChart className="w-4 h-4" />Evolución
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'rendimiento' ? (
            <div className="space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{player.points || 0}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Puntos</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{formatMoney(player.marketValue)}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Valor</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{player.averagePoints || 0}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Promedio</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.length}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Jornadas</p>
                </div>
              </div>

              {/* Points per matchday */}
              {stats.length > 0 && (
            <div className="overflow-visible">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Puntos por jornada</h4>
                  <div className="flex gap-1 overflow-x-auto pb-2">
                    {[...stats].sort((a, b) => a.weekNumber - b.weekNumber).map((s) => {
                      const maxPts = 20;
                      const h = Math.max(4, (Math.abs(s.totalPoints) / maxPts) * 60);
                      const color = s.totalPoints >= 10 ? 'bg-indigo-500' : s.totalPoints >= 5 ? 'bg-green-500' : s.totalPoints > 0 ? 'bg-yellow-500' : 'bg-gray-200 dark:bg-gray-700';
                      return (
                        <div key={s.weekNumber} className="flex flex-col items-center gap-1 min-w-[32px]">
                          <div className={`w-6 rounded-t ${color}`} style={{ height: `${h}px` }} />
                          <span className="text-[9px] text-gray-500">J{s.weekNumber}</span>
                          <span className="text-[9px] font-medium text-gray-700 dark:text-gray-300">{s.totalPoints}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-visible pl-2">
              {loadingPrecios ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : seriePrecios.fechas.length === 0 ? (
                <div className="text-center py-8 text-gray-400">Sin datos de evolución</div>
              ) : (
                <LineChartSVG
                  fechas={seriePrecios.fechas}
                  series={[{ nombre: player.nickname || player.name, datos: seriePrecios.datos, color: '#4F46E5' }]}
                  formatY={(v) => {
                    const abs = Math.abs(v);
                    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`;
                    if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K€`;
                    return `${v}€`;
                  }}
                  height={280}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
