import { fantasyAPI } from './api';
import { extractTeamPlayers } from '../utils/fetchAllTeamsData';
import { useAuthStore } from '../stores/authStore';
import {
  getLatestPrices,
  getScrapingPlayers,
  getScrapingEquipos,
  getPreciosDiarios,
  getMapeo,
  isSupabaseConfigured,
} from './supabaseScraping';
import { loadRentabilidadFromView, loadRentabilidadPlayersRaw, upsertRentabilidadPlayers, updateCacheTimestamp } from './rentabilidadCache';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CMP = `/v1/competition/${import.meta.env.VITE_COMPETITION_ID || '1'}`;

// Todo el mundo arranca la liga con equipo aleatorio y 100M en mano.
const PRESUPUESTO_INICIAL = 100_000_000;

// activityTypeId del API (ver activityUtils.js):
// 1 compró (a otro manager o mercado) · 6 premio jornada · 9 nuevo miembro ·
// 31 fichó (mercado) · 32 clausuló · 33 vendió.
// 32 es compra por cláusula (fichaje), NO subida de cláusula propia.
const TIPO_COMPRA_MANAGER = 1;
const TIPO_PREMIO = 6;
const TIPO_UNION = 9;
const TIPO_FICHAJE_MERCADO = 31;
const TIPO_CLAUSULA = 32;
const TIPO_VENTA = 33;

// Fallback si no hay actividad de unión ni fecha en teamData (arranque 26/27).
const FECHA_INICIO_TEMPORADA = '2026-08-15T00:00:00.000Z';

// Petición que NO pasa por el interceptor de api.js (evita toasts de
// "Acceso denegado" cuando la API rechaza ver datos de otros managers).
// Usa la misma URL base que el cliente api.js (respeta REACT_APP_API_BASE_URL).
async function silentGet(path) {
  const token = useAuthStore.getState().getBearerToken();
  const isDev = import.meta.env.MODE === 'development';
  let base;
  if (isDev) {
    const port = import.meta.env.VITE_PROXY_PORT || '3005';
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.hostname || 'localhost';
    base = `${protocol}//${host}:${port}/api`;
  } else {
    base = (import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`).replace(/\/$/, '');
    if (!base.endsWith('/api')) base = `${base}/api`;
  }
  const url = `${base}${path}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-lang': 'es',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const text = await r.text();
    return text.trim() ? JSON.parse(text) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const dayStart = (f) => {
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const toIso = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && !Number.isFinite(Number(v))) {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  const n = Number(v);
  if (Number.isFinite(n)) {
    // segundos vs ms
    const ms = n < 1e12 ? n * 1000 : n;
    const t = new Date(ms).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
};

// Fecha en la que el manager entró en la liga (teamData). Sondea campos habituales.
const extractTeamJoinDate = (teamData) => {
  const cand = [teamData?.data, teamData, teamData?.team, teamData?.data?.team];
  const fields = ['joinTime', 'startTime', 'joinedAt', 'createdAt', 'created', 'creationDate'];
  for (const o of cand) {
    if (!o || typeof o !== 'object') continue;
    for (const t of fields) {
      const val = o[t] ?? o.manager?.[t] ?? o.team?.[t];
      const iso = toIso(val);
      if (iso) return iso;
    }
  }
  return null;
};

// Carga el mapeo persistido (player_master_id -> jugador_id). SOLO LECTURA.
async function resolverMapeo({ laligaPlayers, signal }) {
  const map = new Map();
  if (!isSupabaseConfigured()) return map;
  try {
    const m = await getMapeo(
      laligaPlayers.map((p) => p.id),
      signal,
    );
    for (const [k, v] of m) map.set(k, v);
  } catch {
    /* mapa vacío: jugadores sin mapear */
  }
  return map;
}

async function getAllActivity(leagueId, maxPages = 25, since?: string | null) {
  const items = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await fantasyAPI.getLeagueActivity(leagueId, page);
    const arr = Array.isArray(res) ? res : res?.data || [];
    if (!arr.length) break;
    // If since is provided, stop when we reach older entries
    if (since) {
      const sinceTs = new Date(since).getTime();
      let foundOlder = false;
      for (const item of arr) {
        const itemTs = item.createdAt ? new Date(item.createdAt).getTime() : 0;
        if (itemTs < sinceTs) { foundOlder = true; break; }
        items.push(item);
      }
      if (foundOlder) break;
    } else {
      items.push(...arr);
    }
    await sleep(100);
  }
  return items;
}

// Reduce precios_diarios a un valor por día (el último del día).
// Map jugador_id -> [{ ts, label, valor }] ordenado por día.
function reducirPreciosDiarios(porJugador) {
  const out = new Map();
  const dayLabel = (f) => {
    const d = new Date(f);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  };
  for (const [jid, rows] of porJugador.entries()) {
    const byDay = new Map();
    for (const r of rows) {
      const lbl = dayLabel(r.fecha);
      const ts = dayStart(r.fecha);
      if (ts == null) continue;
      const cur = byDay.get(lbl);
      if (!cur || ts >= cur.ts) byDay.set(lbl, { ts, label: lbl, valor: r.valor });
    }
    out.set(jid, [...byDay.values()].sort((a, b) => a.ts - b.ts));
  }
  return out;
}

// userId del item de unión (activityTypeId 9).
function unionUserId(a) {
  return a.user1Id ?? a.user2Id ?? a.manager?.id ?? a.manager?.userId ?? null;
}

/**
 * Calcula la rentabilidad:
 *  - Por cada (amigo, jugador): fichaje / subidas / ventas / valor actual /
 *    diferencia diaria / tendencia; rentabilidad = devuelto - invertido.
 *  - Drafts = valor de mercado el día que el manager entró en la liga.
 *  - Serie histórica = cash (100M + movimientos + premios) + plantilla día a día.
 */
export async function fetchRentabilidad(leagueId, signal) {
  console.log('[Rent] fetchRentabilidad called for league:', leagueId);

  const standingRes = await fantasyAPI.getLeagueRanking(leagueId);
  const rawMiembros = Array.isArray(standingRes) ? standingRes : standingRes?.data || [];
  // Normalizar: añadir userId desde team.manager.id (como hace adaptStandingResponse)
  const miembros = rawMiembros.map((m: any) => ({
    ...m,
    userId: m.userId ?? m.team?.manager?.id,
    id: m.id ?? m.team?.id,
    name: m.name ?? m.team?.name,
    manager: typeof m.manager === 'string' ? m.manager : m.team?.manager?.managerName,
  }));
  if (!miembros.length) {
    return {
      miembros: [],
      serieRentabilidad: { fechas: [], amigos: [] },
      supabaseOk: isSupabaseConfigured(),
    };
  }

  const allPlayersRes = await fantasyAPI.getAllPlayers();
  const allPlayers = Array.isArray(allPlayersRes) ? allPlayersRes : allPlayersRes?.data || [];
  const allPlayersMap = new Map(allPlayers.map((p) => [String(p.id), p]));

  // Mapa de puntos por jugador por jornada (playerMasterId -> week -> points)
  const playerWeekPts = new Map<string, Map<number, number>>();
  try {
    const currentWeekRes = await fantasyAPI.getCurrentWeek();
    const currentWeek = currentWeekRes?.weekNumber ?? currentWeekRes?.data?.weekNumber ?? 1;
    // Parallelize match stats calls in chunks of 4
    const weekChunks = [];
    for (let i = 1; i <= currentWeek; i += 4) {
      weekChunks.push(Array.from({ length: Math.min(4, currentWeek - i + 1) }, (_, j) => i + j));
    }
    for (const chunk of weekChunks) {
      const results = await Promise.all(chunk.map((w) => fantasyAPI.getMatchStats(w).catch(() => null)));
      for (const stats of results) {
        if (!stats) continue;
        const matches = Array.isArray(stats) ? stats : stats?.data || [];
        for (const m of matches) {
          for (const team of [m.local, m.visitor]) {
            if (!team?.players) continue;
            for (const p of team.players) {
              const id = String(p.id);
              const pts = p.weekPoints || 0;
              if (pts !== 0) {
                if (!playerWeekPts.has(id)) playerWeekPts.set(id, new Map());
                playerWeekPts.get(id)!.set(chunk[results.indexOf(stats)], pts);
              }
            }
          }
        }
      }
    }
  } catch {}

  const activity = await getAllActivity(leagueId);

  let latestPrices = new Map();
  let scrapingPlayers = new Map();
  let equipos = new Map();
  let supabaseOk = false;
  if (isSupabaseConfigured()) {
    try {
      [latestPrices, scrapingPlayers, equipos] = await Promise.all([
        getLatestPrices(signal),
        getScrapingPlayers(signal),
        getScrapingEquipos(signal),
      ]);
      supabaseOk = true;
    } catch {
      supabaseOk = false;
    }
  }

  // Fechas de unión por manager (activityTypeId 9).
  const joinByMid = new Map();
  for (const a of activity) {
    if (a.activityTypeId !== TIPO_UNION) continue;
    const mid = unionUserId(a);
    if (mid == null || !a.createdAt) continue;
    const ts = new Date(a.createdAt).getTime();
    if (!Number.isFinite(ts)) continue;
    const prev = joinByMid.get(Number(mid));
    if (prev == null || ts < prev) joinByMid.set(Number(mid), ts);
  }

  const fechaInicioFallback = new Date(FECHA_INICIO_TEMPORADA).getTime();
  let fechaActividadMasTemprana = fechaInicioFallback;
  for (const ts of joinByMid.values()) {
    if (ts < fechaActividadMasTemprana) fechaActividadMasTemprana = ts;
  }
  // Si no hay uniones, usa la actividad más antigua con fecha.
  if (joinByMid.size === 0 && activity.length) {
    let minTs = Infinity;
    for (const a of activity) {
      if (!a.createdAt) continue;
      const ts = new Date(a.createdAt).getTime();
      if (Number.isFinite(ts) && ts < minTs) minTs = ts;
    }
    if (Number.isFinite(minTs)) fechaActividadMasTemprana = minTs;
  }
  const fechaInicio = fechaActividadMasTemprana;
  const inicioIso = new Date(fechaInicio).toISOString();

  // Plantillas actuales + fecha de entrada por manager.
  const detalle = await mapLimit(miembros, 4, async (m) => {
    const teamId = m.id || m.team?.id;
    const mid = Number(m.userId ?? teamId);
    let players = [];
    let joinTs = joinByMid.has(mid)
      ? new Date(joinByMid.get(mid)).toISOString()
      : null;
    try {
      const raw = await silentGet(`${CMP}/leagues/${leagueId}/teams/${teamId}?x-lang=es`);
      if (!joinTs) {
        joinTs = extractTeamJoinDate(raw) || inicioIso;
      }
      players = extractTeamPlayers(raw)
        .map((pt) => {
          const pm = pt?.playerMaster || pt?.player || {};
          const id = pm.id ?? pt?.id;
          return id != null
            ? {
                playerMasterId: Number(id),
                nickname: pm.nickname || pm.name,
                marketValue: num(pm.marketValue ?? pt?.marketValue),
              }
            : null;
        })
        .filter(Boolean);
    } catch {
      if (!joinTs) joinTs = inicioIso;
    }
    await sleep(100);
    return { teamId: Number(teamId), mid, players, joinTs };
  });

  const mvMap = new Map();
  for (const d of detalle) {
    for (const p of d.players) {
      mvMap.set(`${d.mid}:${p.playerMasterId}`, p.marketValue);
    }
  }

  const scopeIds = new Set();
  activity.forEach((a) => a.playerMasterId != null && scopeIds.add(Number(a.playerMasterId)));
  detalle.forEach((d) => d.players.forEach((p) => scopeIds.add(Number(p.playerMasterId))));
  const laligaPlayers = [...scopeIds]
    .map((id) => {
      const p = allPlayersMap.get(String(id));
      return p ? { id: p.id, name: p.name, nickname: p.nickname, teamId: p.team?.id } : null;
    })
    .filter(Boolean);

  const map = await resolverMapeo({ laligaPlayers, signal });
  const scopeJugadores = [...new Set([...map.values()])];

  let preciosDiarios = new Map();
  if (supabaseOk && scopeJugadores.length) {
    try {
      preciosDiarios = await getPreciosDiarios(scopeJugadores, signal);
    } catch {
      preciosDiarios = new Map();
    }
  }
  const preciosPorDia = reducirPreciosDiarios(preciosDiarios);

  // Valor de entrada (draft) = último precio en/antes del día de entrada del manager.
  const valorEntrada = (jid, fecha) => {
    const arr = preciosPorDia.get(jid);
    if (!arr || !arr.length) return null;
    if (fecha == null) return arr[0].valor;
    const target = dayStart(fecha);
    if (target == null) return arr[0].valor;
    let cand = null;
    for (const x of arr) {
      if (x.ts <= target) cand = x.valor;
      else break;
    }
    return cand ?? arr[0].valor;
  };

  const jugadorInfo = new Map();
  for (const [jid, p] of scrapingPlayers.entries()) {
    const eq = equipos.get(p.equipo_id);
    jugadorInfo.set(jid, {
      nombre: p.nombre,
      equipo: eq?.nombre ?? null,
      foto: p.foto_url ?? null,
      escudo: eq?.escudo_url ?? null,
    });
  }

  // Movimientos de actividad -> stubs por (miembro, jugador LaLiga).
  const porKey = new Map();
  const keyDe = (m, pmId) => `${m}:${pmId}`;
  const stub = (m, pmId) => {
    const k = keyDe(m, pmId);
    let s = porKey.get(k);
    if (!s) {
      s = {
        invertido: 0,
        devuelto: 0,
        fichaje: 0,
        subidas: 0,
        ventas: 0,
        jugador_id: map.get(Number(pmId)) ?? null,
        tuvoCompra: false,
        compraWeek: null,
        ventaWeek: null,
      };
      porKey.set(k, s);
    }
    return s;
  };

  // Helper: convert timestamp to approximate week number
  const tsToWeek = (ts: number): number => {
    const startMs = new Date(inicioIso).getTime();
    const diffMs = ts - startMs;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return Math.max(1, Math.ceil(diffDays / 7));
  };

  for (const a of activity) {
    const pmId = a.playerMasterId != null ? Number(a.playerMasterId) : null;
    if (pmId == null) continue;
    const t = a.activityTypeId;
    const amount = num(a.amount);
    const ts = a.createdAt ? new Date(a.createdAt).getTime() : null;
    const week = ts != null ? tsToWeek(ts) : null;

    if (t === TIPO_VENTA) {
      if (a.user1Id != null) {
        const s = stub(a.user1Id, pmId);
        s.devuelto += amount;
        s.ventas += amount;
        if (week != null) s.ventaWeek = week;
      }
    } else if (t === TIPO_COMPRA_MANAGER) {
      // Traspaso / compra: user1 paga, user2 (si hay) cobra.
      if (a.user1Id != null) {
        const s = stub(a.user1Id, pmId);
        s.invertido += amount;
        s.fichaje += amount;
        s.tuvoCompra = true;
        if (week != null && (s.compraWeek == null || week < s.compraWeek)) s.compraWeek = week;
      }
      if (a.user2Id != null) {
        const s = stub(a.user2Id, pmId);
        s.devuelto += amount;
        s.ventas += amount;
        if (week != null) s.ventaWeek = week;
      }
    } else if (t === TIPO_FICHAJE_MERCADO || t === TIPO_CLAUSULA) {
      // 31 fichaje mercado · 32 compra por cláusula → coste de adquisición (fichaje).
      if (a.user1Id != null) {
        const s = stub(a.user1Id, pmId);
        s.invertido += amount;
        s.fichaje += amount;
        s.tuvoCompra = true;
        if (week != null && (s.compraWeek == null || week < s.compraWeek)) s.compraWeek = week;
      }
    }
    // Resto de tipos (4 blindaje, 6 premio, 7 alineación, 9 unión…): no afectan a fichaje.
  }

  // Drafts: jugadores de plantilla inicial sin compra conocida.
  // 1) Los que siguen en plantilla (están en detalle).
  for (const d of detalle) {
    for (const p of d.players) {
      const k = keyDe(d.mid, p.playerMasterId);
      const existing = porKey.get(k);
      if (existing?.tuvoCompra) continue;
      const s = stub(d.mid, p.playerMasterId);
      if (s.fichaje > 0 || s.tuvoCompra) continue;
      // Si no tiene compra conocida pero está en plantilla, asumir desde jornada 1
      if (s.compraWeek == null) s.compraWeek = 1;
      const j = s.jugador_id;
      const mv = mvMap.get(k) ?? 0;
      const fechaDraft = d.joinTs || inicioIso;
      const entrada =
        (j != null ? valorEntrada(j, fechaDraft) : null) ??
        latestPrices.get(j)?.valor ??
        mv;
      s.invertido += entrada;
      s.fichaje += entrada;
    }
  }
  // 2) Los que ya fueron vendidos (aparecen en actividad pero no en plantilla
  //    actual): necesitan su fichaje al precio del día de entrada del manager.
  const joinTsByMid = new Map();
  for (const d of detalle) joinTsByMid.set(d.mid, d.joinTs || inicioIso);
  for (const [k, s] of porKey.entries()) {
    if (s.tuvoCompra || s.fichaje > 0) continue;
    const [mRaw] = k.split(':');
    const mid = Number(mRaw);
    const j = s.jugador_id;
    const mv = mvMap.get(k) ?? 0;
    const fechaDraft = joinTsByMid.get(mid) || inicioIso;
    const entrada =
      (j != null ? valorEntrada(j, fechaDraft) : null) ??
      latestPrices.get(j)?.valor ??
      mv;
    s.invertido += entrada;
    s.fichaje += entrada;
    // Si no tiene compra conocida, asumir desde jornada 1
    if (s.compraWeek == null) s.compraWeek = 1;
  }

  // Valor actual de los que siguen en plantilla (devuelto) + puntos ganados (100k por punto).
  const owners = new Set();
  const PUNTO_VALOR = 100_000;
  for (const d of detalle) {
    for (const p of d.players) {
      const k = keyDe(d.mid, p.playerMasterId);
      owners.add(k);
      const s = stub(d.mid, p.playerMasterId);
      const j = s.jugador_id;
      const mv = mvMap.get(k) ?? null;
      const valor = (j != null ? latestPrices.get(j)?.valor : null) ?? mv;
      if (valor != null) s.devuelto += valor;
    }
  }

  const filasPorMiembro = new Map();
  for (const [k, s] of porKey.entries()) {
    const [mRaw, pmRaw] = k.split(':');
    const mid = Number(mRaw);
    const pmId = Number(pmRaw);
    const j = s.jugador_id;
    const info = j != null ? jugadorInfo.get(j) : null;
    const enPlantilla = owners.has(k);
    const lp = j != null ? latestPrices.get(j) : null;
    const mv = mvMap.get(k) ?? null;
    const laLiga = allPlayersMap.get(String(pmId));
    const fila = {
      jugador_id: j,
      player_master_id: pmId,
      nombre: info?.nombre ?? laLiga?.nickname ?? laLiga?.name ?? 'Jugador',
      equipo: info?.equipo ?? laLiga?.team?.name ?? null,
      foto: info?.foto ?? null,
      escudo: info?.escudo ?? null,
      fichaje: s.fichaje,
      subidas: s.subidas,
      ventas: s.ventas,
      valor_actual: enPlantilla ? (lp?.valor ?? mv) : null,
      diferencia_diaria: lp?.diferencia ?? null,
      diferencia_pct_diaria: lp?.diferencia_pct ?? null,
      tendencia: lp?.tendencia ?? null,
      aceleracion_estado: lp?.aceleracion_estado ?? null,
      en_plantilla: enPlantilla,
      invertido: s.invertido,
      devuelto: s.devuelto,
      ganado_puntos: s.ganado_puntos || 0,
      rentabilidad: s.devuelto - s.invertido,
    };
    const lista = filasPorMiembro.get(mid) ?? [];
    lista.push(fila);
    filasPorMiembro.set(mid, lista);
  }

  const resumen = miembros
    .map((m) => {
      const mid = Number(m.userId ?? m.id);
      const filas = filasPorMiembro.get(mid) ?? [];
      const totales = filas.reduce(
        (acc, f) => ({
          invertido: acc.invertido + f.invertido,
          devuelto: acc.devuelto + f.devuelto,
          ganado_puntos: acc.ganado_puntos + (f.ganado_puntos || 0),
        }),
        { invertido: 0, devuelto: 0, ganado_puntos: 0 },
      );
      const subidaHoy = filas
        .filter((f) => f.en_plantilla)
        .reduce((acc, f) => acc + (f.diferencia_diaria ?? 0), 0);
      return {
        id: mid,
        teamId: Number(m.id ?? m.team?.id),
        nombre: m.manager || m.name || 'Amigo',
        foto: null,
        filas,
        invertido: totales.invertido,
        devuelto: totales.devuelto,
        ganado_puntos: totales.ganado_puntos,
        rentabilidad: totales.devuelto - totales.invertido,
        subida_hoy: subidaHoy,
      };
    })
    .sort((a, b) => b.rentabilidad - a.rentabilidad);

  // Compute ganado_puntos: fetch lineup per team per week to get per-player matchday points
  const debugPuntos: any[] = [];
  try {
    const currentWeekRes2 = await fantasyAPI.getCurrentWeek();
    const currentWeek2 = currentWeekRes2?.weekNumber ?? currentWeekRes2?.data?.weekNumber ?? 1;
    for (const d of detalle) {
      const friend = resumen.find((r: any) => r.id === d.mid);
      const friendName = friend?.nombre || String(d.mid);
      for (let w = 1; w <= currentWeek2; w++) {
        try {
          const lineup = await fantasyAPI.getTeamLineup(String(d.teamId), w);
          const data = lineup?.data || lineup;
          const formation = data?.formation;
          if (!formation) continue;
          const posKeys = ['goalkeeper', 'defender', 'midfield', 'striker'];
          for (const pk of posKeys) {
            if (!Array.isArray(formation[pk])) continue;
            for (const p of formation[pk]) {
              const pm = p?.playerMaster;
              if (!pm) continue;
              const pts = pm.lastStats?.find((s: any) => s.weekNumber === w)?.totalPoints ?? p.points ?? 0;
              debugPuntos.push({
                friend: friendName,
                friendMid: d.mid,
                player: pm.nickname || pm.name || `#${pm.id}`,
                playerId: Number(pm.id),
                week: w,
                pts,
              });
            }
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  } catch {}

  // Aggregate points by (manager, player)
  const ganadoPtsMap = new Map<string, number>();
  for (const d of debugPuntos) {
    if (d.pts === 0) continue;
    const key = `${d.friendMid}:${d.playerId}`;
    ganadoPtsMap.set(key, (ganadoPtsMap.get(key) || 0) + d.pts);
  }
  for (const d of debugGroupByArray) {
    if (d.totalPts > 0) {
      ganadoPtsMap.set(`${d.friendMid}:${d.playerId}`, d.totalPts);
    }
  }

  // Apply ganado_puntos from matchday stats to resumen AND porKey stubs
  const PUNTO_VALOR2 = 100_000;
  for (const r of resumen) {
    let total = 0;
    for (const f of r.filas) {
      const pts = ganadoPtsMap.get(`${r.id}:${f.player_master_id}`) || 0;
      f.ganado_puntos = pts * PUNTO_VALOR2;
      total += f.ganado_puntos;
      const k = `${r.id}:${f.player_master_id}`;
      const s = porKey.get(k);
      if (s) s.ganado_puntos = f.ganado_puntos;
    }
    r.ganado_puntos = total;
  }

  const result = {
    miembros: resumen,
    supabaseOk,
    preciosDiarios,
    ligaInicio: inicioIso,
  };

  // Save to rentabilidad_players table - ALL players from porKey (current + sold)
  try {
    const playersToSave: any[] = [];
    for (const [k, s] of porKey.entries()) {
      const [mRaw, pmRaw] = k.split(':');
      const mid = Number(mRaw);
      const pmId = Number(pmRaw);
      const managerName = resumen.find((r: any) => r.id === mid)?.nombre || String(mid);
      const laLiga = allPlayersMap.get(String(pmId));
      playersToSave.push({
        managerId: String(mid),
        managerName,
        playerName: laLiga?.nickname || laLiga?.name || `#${pmId}`,
        playerMasterId: pmId,
        invertido: s.invertido,
        fichaje: s.fichaje,
        ventas: s.ventas,
        ganado_puntos: s.ganado_puntos || 0,
        en_plantilla: owners.has(k),
      });
    }
    console.log('[Rent] Saving', playersToSave.length, 'players to rentabilidad_players');
    await upsertRentabilidadPlayers(leagueId, playersToSave);
    const lastActivityAt = activity.length > 0 ? activity[0]?.createdAt || null : null;
    const currentWeekRes3 = await fantasyAPI.getCurrentWeek();
    const currentWeek3 = currentWeekRes3?.weekNumber ?? currentWeekRes3?.data?.weekNumber ?? 1;
    await updateCacheTimestamp(leagueId, lastActivityAt, currentWeek3);
    console.log('[Rent] Saved successfully');
  } catch (e) {
    console.log('[Rent] Save error:', e);
  }

  return result;
}

/**
 * Refresco incremental: solo procesa actividad nueva y jornadas nuevas
 * desde la última actualización. Mucho más rápido que fetchRentabilidad completo.
 */
export async function fetchRentabilidadIncremental(leagueId, signal) {
  console.log('[Rent] Incremental refresh for league:', leagueId);

  // 1. Load cached state from Supabase
  const [rawPlayers, cacheRes] = await Promise.all([
    loadRentabilidadPlayersRaw(leagueId),
    (async () => {
      if (!isSupabaseConfigured()) return null;
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/rentabilidad_cache?select=last_activity_at,last_matchday&league_id=eq.${leagueId}&limit=1`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        const d = await r.json();
        return d?.[0] || null;
      } catch { return null; }
    })(),
  ]);

  // If no cached data, fall back to full calculation
  if (!rawPlayers || rawPlayers.length === 0) {
    console.log('[Rent] No cached data, falling back to full calculation');
    return fetchRentabilidad(leagueId, signal);
  }

  const lastActivityAt = cacheRes?.last_activity_at || null;
  const lastMatchday = cacheRes?.last_matchday || 0;

  // 2. Load current roster map from rentabilidad_players
  const rosterMap = new Map();
  for (const p of rawPlayers) {
    const key = `${p.manager_id}:${p.player_master_id}`;
    rosterMap.set(key, {
      manager_id: p.manager_id,
      manager_name: p.manager_name,
      player_master_id: p.player_master_id,
      player_name: p.player_name,
      invertido: Number(p.invertido) || 0,
      fichaje: Number(p.fichaje) || 0,
      ventas: Number(p.ventas) || 0,
      ganado_puntos: Number(p.ganado_puntos) || 0,
      en_plantilla: p.en_plantilla,
    });
  }

  // 3. Detect new activity since last_activity_at
  const newActivity = await getAllActivity(leagueId, 25, lastActivityAt);
  const marketActivity = newActivity.filter(a =>
    a.activityTypeId === TIPO_VENTA ||
    a.activityTypeId === TIPO_COMPRA_MANAGER ||
    a.activityTypeId === TIPO_FICHAJE_MERCADO ||
    a.activityTypeId === TIPO_CLAUSULA
  );
  console.log('[Rent] New market activities:', marketActivity.length);

  // Group activity by day for chronological processing
  const activityByDay = new Map();
  for (const a of marketActivity) {
    const day = a.createdAt ? dayStart(a.createdAt) : null;
    if (day == null) continue;
    const arr = activityByDay.get(day) || [];
    arr.push(a);
    activityByDay.set(day, arr);
  }

  // 4. Detect new matchdays
  const currentWeekRes = await fantasyAPI.getCurrentWeek();
  const currentWeek = currentWeekRes?.weekNumber ?? currentWeekRes?.data?.weekNumber ?? 1;
  const newMatchdays: number[] = [];
  for (let w = lastMatchday + 1; w <= currentWeek; w++) {
    newMatchdays.push(w);
  }
  console.log('[Rent] New matchdays to process:', newMatchdays);

  // Fetch stats for new matchdays
  const matchdayStats = new Map();
  for (const w of newMatchdays) {
    try {
      const stats = await fantasyAPI.getMatchStats(w);
      const matches = Array.isArray(stats) ? stats : stats?.data || [];
      const ptsMap = new Map();
      for (const m of matches) {
        for (const team of [m.local, m.visitor]) {
          if (!team?.players) continue;
          for (const p of team.players) {
            const pts = p.weekPoints || 0;
            if (pts !== 0) ptsMap.set(String(p.id), pts);
          }
        }
      }
      matchdayStats.set(w, ptsMap);
    } catch {}
  }

  // Group matchdays by day (approximate: matchday = week * 7 days from season start)
  const seasonStart = new Date(FECHA_INICIO_TEMPORADA).getTime();
  const matchdayByDay = new Map();
  for (const w of newMatchdays) {
    const dayTs = seasonStart + w * 7 * 864e5;
    const day = dayStart(new Date(dayTs));
    const arr = matchdayByDay.get(day) || [];
    arr.push(w);
    matchdayByDay.set(day, arr);
  }

  // 5. Process all events chronologically (market movements BEFORE matchday stats)
  const allDays = [...new Set([...activityByDay.keys(), ...matchdayByDay.keys()])].sort((a, b) => a - b);

  for (const day of allDays) {
    // Process market movements first
    const activities = activityByDay.get(day) || [];
    for (const a of activities) {
      const pmId = a.playerMasterId != null ? Number(a.playerMasterId) : null;
      if (pmId == null) continue;
      const t = a.activityTypeId;
      const amount = num(a.amount);

      if (t === TIPO_VENTA && a.user1Id != null) {
        const key = `${a.user1Id}:${pmId}`;
        const existing = rosterMap.get(key) || {
          manager_id: String(a.user1Id),
          manager_name: '',
          player_master_id: pmId,
          player_name: '',
          invertido: 0,
          fichaje: 0,
          ventas: 0,
          ganado_puntos: 0,
          en_plantilla: false,
        };
        existing.ventas += amount;
        existing.en_plantilla = false;
        rosterMap.set(key, existing);
      } else if ((t === TIPO_COMPRA_MANAGER || t === TIPO_FICHAJE_MERCADO || t === TIPO_CLAUSULA) && a.user1Id != null) {
        const key = `${a.user1Id}:${pmId}`;
        const existing = rosterMap.get(key) || {
          manager_id: String(a.user1Id),
          manager_name: '',
          player_master_id: pmId,
          player_name: '',
          invertido: 0,
          fichaje: 0,
          ventas: 0,
          ganado_puntos: 0,
          en_plantilla: false,
        };
        existing.invertido += amount;
        existing.fichaje += amount;
        existing.en_plantilla = true;
        rosterMap.set(key, existing);
      }
    }

    // Process matchday stats
    const matchdays = matchdayByDay.get(day) || [];
    for (const w of matchdays) {
      const ptsMap = matchdayStats.get(w);
      if (!ptsMap) continue;

      for (const [key, entry] of rosterMap) {
        if (!entry.en_plantilla) continue;
        const pts = ptsMap.get(String(entry.player_master_id));
        if (pts && pts > 0) {
          entry.ganado_puntos += pts * 100_000;
        }
      }
    }
  }

  // 6. Save updated data to Supabase
  const newLastActivityAt = marketActivity.length > 0
    ? marketActivity.reduce((latest, a) => {
        const ts = a.createdAt || '';
        return ts > latest ? ts : latest;
      }, lastActivityAt || '')
    : lastActivityAt;

  const playersToSave = Array.from(rosterMap.values()).map(e => ({
    managerId: e.manager_id,
    managerName: e.manager_name,
    playerName: e.player_name,
    playerMasterId: e.player_master_id,
    invertido: e.invertido,
    fichaje: e.fichaje,
    ventas: e.ventas,
    ganado_puntos: e.ganado_puntos,
    en_plantilla: e.en_plantilla,
  }));

  await Promise.all([
    upsertRentabilidadPlayers(leagueId, playersToSave),
    updateCacheTimestamp(leagueId, newLastActivityAt || null, currentWeek),
  ]);

  console.log('[Rent] Incremental refresh complete. Updated', playersToSave.length, 'players');

  // Return data compatible with the page
  return { miembros: [] };
}
