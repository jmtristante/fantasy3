import React, { useState, useMemo } from 'react';
import { Card, Spinner } from '@heroui/react';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { fetchRentabilidad } from '../services/rentabilidad';
import TrendBadge from '../components/Common/TrendBadge';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';
import LineChartSVG from '../components/Rentabilidad/LineChartSVG';

function formatMoney(v: number) {
  if (!v) return '0€';
  return new Intl.NumberFormat('es-ES').format(v) + '€';
}

const FRIEND_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d'];

export default function Rentabilidad() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [soloPlantilla, setSoloPlantilla] = useState(true);
  const [visibleAmigos, setVisibleAmigos] = useState<Set<number>>(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['rentabilidad', leagueId],
    queryFn: ({ signal }) => fetchRentabilidad(leagueId!, signal),
    enabled: !!leagueId,
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }
  if (error || !data) {
    return <div className="text-center py-16"><p className="text-red-500">Error al calcular rentabilidad</p></div>;
  }

  const { miembros, serieRentabilidad } = data;
  const miembroActual = filtro ? miembros.find((m: any) => m.id === Number(filtro)) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Rentabilidad</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Cuánto rinde cada jugador frente a lo invertido en fichaje y subidas de cláusula.
        </p>
      </div>

      {/* Member filter buttons */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFiltro(null)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filtro === null ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
          General
        </button>
        {miembros.map((m: any) => (
          <button key={m.id} onClick={() => setFiltro(String(m.id))} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filtro === String(m.id) ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            {m.nombre}
          </button>
        ))}
      </div>

      {/* General view */}
      {filtro === null ? (
        <>
          {serieRentabilidad?.fechas?.length > 0 && (() => {
            const allVisible = visibleAmigos.size === 0;
            const filteredSeries = serieRentabilidad.amigos
              .map((a: any, i: number) => ({ ...a, idx: i, color: FRIEND_COLORS[i % FRIEND_COLORS.length] }))
              .filter((a) => allVisible || visibleAmigos.has(a.idx));
            return (
              <Card>
                <Card.Header><Card.Title>Evolución patrimonio</Card.Title></Card.Header>
                <Card.Content>
                  <LineChartSVG
                    fechas={serieRentabilidad.fechas}
                    series={filteredSeries.map((a) => ({ nombre: a.nombre, datos: a.datos, color: a.color }))}
                    formatY={(v: number) => { const abs = Math.abs(v); if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`; if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K€`; return `${v}€`; }}
                    height={300}
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {serieRentabilidad.amigos.map((a: any, i: number) => {
                      const isVisible = visibleAmigos.size === 0 || visibleAmigos.has(i);
                      return (
                        <button key={i} onClick={() => {
                          setVisibleAmigos((prev) => {
                            const next = new Set(prev);
                            if (next.size === 0) { serieRentabilidad.amigos.forEach((_: any, j: number) => next.add(j)); next.delete(i); }
                            else if (next.has(i)) { next.delete(i); if (next.size === 0) serieRentabilidad.amigos.forEach((_: any, j: number) => next.add(j)); }
                            else next.add(i);
                            return next;
                          });
                        }} className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all ${isVisible ? 'opacity-100' : 'opacity-30'}`}>
                          <span className="w-3 h-1.5 rounded" style={{ background: FRIEND_COLORS[i % FRIEND_COLORS.length] }} />
                          <span className="text-gray-600 dark:text-gray-400">{a.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                </Card.Content>
              </Card>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {miembros.map((m: any, i: number) => {
              const filas = m.filas || [];
              const topP = filas.length > 0 ? [...filas].sort((a: any, b: any) => b.rentabilidad - a.rentabilidad)[0] : null;
              const worstP = filas.length > 0 ? [...filas].sort((a: any, b: any) => a.rentabilidad - b.rentabilidad)[0] : null;
              return (
                <Card key={m.id}>
                  <Card.Content className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: FRIEND_COLORS[i % FRIEND_COLORS.length] }}>{m.nombre?.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{m.nombre}</h3>
                      <p className={`text-lg font-bold ${m.rentabilidad >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {m.rentabilidad >= 0 ? '+' : ''}{formatMoney(m.rentabilidad)}
                      </p>
                      <div className="flex flex-col gap-0.5 mt-1 text-xs">
                        {topP && <span className="text-green-600 dark:text-green-400">▲ {topP.nombre} ({formatMoney(topP.rentabilidad)})</span>}
                        {worstP && worstP !== topP && <span className="text-red-500 dark:text-red-400">▼ {worstP.nombre} ({formatMoney(worstP.rentabilidad)})</span>}
                      </div>
                    </div>
                  </Card.Content>
                </Card>
              );
            })}
          </div>
        </>
      ) : miembroActual ? (
        <MemberDetail member={miembroActual} search={search} setSearch={setSearch} soloPlantilla={soloPlantilla} setSoloPlantilla={setSoloPlantilla} onPlayerClick={setSelectedPlayer} />
      ) : null}

      <PlayerDetailModal isOpen={!!selectedPlayer} onClose={() => setSelectedPlayer(null)} player={selectedPlayer} />
    </div>
  );
}

function MemberDetail({ member, search, setSearch, soloPlantilla, setSoloPlantilla, onPlayerClick }: any) {
  const filteredFilas = useMemo(() => {
    let filas = member.filas || [];
    if (soloPlantilla) filas = filas.filter((f: any) => f.en_plantilla);
    if (search) { const q = search.toLowerCase(); filas = filas.filter((f: any) => f.nombre?.toLowerCase().includes(q)); }
    return filas;
  }, [member.filas, soloPlantilla, search]);

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <Card.Title>{member.nombre}</Card.Title>
            <div className="flex items-center gap-4 text-sm mt-1">
              <span className="text-muted">Invertido: <strong className="text-gray-900 dark:text-white">{formatMoney(member.invertido)}</strong></span>
              <span className="text-muted">Devuelto: <strong className="text-gray-900 dark:text-white">{formatMoney(member.devuelto)}</strong></span>
              <span className={`font-bold ${member.rentabilidad >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {member.rentabilidad >= 0 ? '+' : ''}{formatMoney(member.rentabilidad)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={soloPlantilla} onChange={(e) => setSoloPlantilla(e.target.checked)} className="rounded" />
              Solo en plantilla
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar jugador..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48" />
            </div>
          </div>
        </div>
      </Card.Header>
      <Card.Content className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-left">
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Jugador</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Fichaje</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Ventas</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Valor</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Invertido</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Devuelto</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Rentab.</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredFilas.map((f: any, i: number) => (
              <tr key={i} onClick={() => onPlayerClick(f)}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {f.foto ? <img src={f.foto} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0"><span className="text-xs font-medium text-gray-500">{f.nombre?.charAt(0)}</span></div>}
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate max-w-[150px]">{f.nombre}</div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        {f.escudo && <img src={f.escudo} alt="" className="w-3.5 h-3.5 object-contain" />}
                        <span className="truncate">{f.equipo || ''}</span>
                      </div>
                    </div>
                    {f.tendencia != null && <div className="ml-1"><TrendBadge tendencia={f.tendencia} aceleracionEstado={f.aceleracion_estado} /></div>}
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatMoney(f.fichaje)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatMoney(f.ventas)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatMoney(f.valor_actual)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatMoney(f.invertido)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatMoney(f.devuelto)}</td>
                <td className={`px-4 py-2 text-right font-semibold tabular-nums ${f.rentabilidad >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {f.rentabilidad >= 0 ? '+' : ''}{formatMoney(f.rentabilidad)}
                </td>
                <td className="px-4 py-2 text-center">
                  {f.en_plantilla
                    ? <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">En plantilla</span>
                    : <span className="text-xs font-medium text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded">Vendido</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card.Content>
    </Card>
  );
}
