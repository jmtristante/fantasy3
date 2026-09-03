import React, { useState, useMemo } from 'react';
import { Card, Spinner } from '@heroui/react';
import { Search } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { fetchRentabilidad, fetchRentabilidadIncremental } from '../services/rentabilidad';
import { loadRentabilidadFromView } from '../services/rentabilidadCache';
import TrendBadge from '../components/Common/TrendBadge';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';

function formatMoney(v: number) {
  if (!v) return '0€';
  return new Intl.NumberFormat('es-ES').format(v) + '€';
}

const FRIEND_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d'];

export default function Rentabilidad() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [soloPlantilla, setSoloPlantilla] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['rentabilidad', leagueId],
    queryFn: async ({ signal }) => {
      // First try to load from Supabase view (instant)
      const viewData = await loadRentabilidadFromView(leagueId!);
      if (viewData && viewData.miembros.length > 0) {
        console.log('[Rent] Loaded from view');
        return { miembros: viewData.miembros };
      }
      // Fall back to full calculation
      console.log('[Rent] View empty, calculating...');
      const result = await fetchRentabilidad(leagueId!, signal);
      return { miembros: result.miembros };
    },
    enabled: !!leagueId,
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
    retry: 0,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchRentabilidadIncremental(leagueId!);
      queryClient.removeQueries({ queryKey: ['rentabilidad', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['rentabilidad', leagueId] });
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }
  if (error || !data) {
    return <div className="text-center py-16"><p className="text-red-500">Error al calcular rentabilidad</p></div>;
  }

  const { miembros } = data;
  const miembroActual = filtro ? miembros.find((m: any) => m.id === Number(filtro)) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Rentabilidad</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Cuánto rinde cada jugador frente a lo invertido en fichaje y subidas de cláusula.
          </p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
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
    return [...filas].sort((a: any, b: any) => (b.rentabilidad || 0) - (a.rentabilidad || 0));
  }, [member.filas, soloPlantilla, search]);

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Card.Title className="truncate">{member.nombre}</Card.Title>
            <span className={`text-sm font-bold flex-shrink-0 ${member.rentabilidad >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {member.rentabilidad >= 0 ? '+' : ''}{formatMoney(member.rentabilidad)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setSoloPlantilla(!soloPlantilla)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                soloPlantilla ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}>
              Plantilla
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-32 sm:w-40 pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>
      </Card.Header>
      {/* Desktop table */}
      <Card.Content className="p-0 overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-left">
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Jugador</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Fichaje</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Ventas</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Valor</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Invertido</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Devuelto</th>
              <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-right">Puntos</th>
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
                <td className="px-4 py-2 text-right tabular-nums text-green-600 dark:text-green-400">
                  {f.ganado_puntos > 0 ? `+${formatMoney(f.ganado_puntos)}` : '—'}
                </td>
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

      {/* Mobile cards */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 pb-3">
        {filteredFilas.map((f: any, i: number) => (
          <button key={i} onClick={() => onPlayerClick(f)}
            className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-stretch gap-3">
            {f.foto ? <img src={f.foto} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0 self-center" />
              : <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 self-center"><span className="text-sm font-medium text-gray-500">{f.nombre?.charAt(0)}</span></div>}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">{f.nombre}</span>
                {f.tendencia != null && <TrendBadge tendencia={f.tendencia} aceleracionEstado={f.aceleracion_estado} />}
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto flex-shrink-0 ${f.en_plantilla ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                  {f.en_plantilla ? 'Plantilla' : 'Vendido'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px] mt-1">
                <div className="text-center">
                  <div className="font-semibold text-gray-900 dark:text-white">{formatMoney(f.valor_actual)}</div>
                  <div className="text-gray-500">Valor</div>
                </div>
                <div className="text-center">
                  <div className={`font-bold ${f.rentabilidad >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {f.rentabilidad >= 0 ? '+' : ''}{formatMoney(f.rentabilidad)}
                  </div>
                  <div className="text-gray-500">Rentab.</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-green-600 dark:text-green-400">
                    {f.ganado_puntos > 0 ? `+${formatMoney(f.ganado_puntos)}` : '—'}
                  </div>
                  <div className="text-gray-500">Puntos</div>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
