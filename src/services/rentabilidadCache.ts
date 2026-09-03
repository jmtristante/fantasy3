import { isSupabaseConfigured } from './supabaseScraping';
import { fantasyAPI } from './api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

/**
 * Leer rentabilidad desde la vista materializada en Supabase.
 * Devuelve { miembros, lastActivityAt, lastMatchday } o null si no hay datos.
 */
export async function loadRentabilidadFromView(leagueId: string): Promise<{ miembros: any[]; lastActivityAt: string | null; lastMatchday: number } | null> {
  if (!isSupabaseConfigured() || !SUPABASE_URL) return null;
  try {
    // 1. Get cache metadata
    const cacheRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rentabilidad_cache?select=last_activity_at,last_matchday&league_id=eq.${leagueId}&limit=1`,
      { headers: headers() }
    );
    const cacheData = await cacheRes.json();
    const lastActivityAt = cacheData?.[0]?.last_activity_at || null;
    const lastMatchday = cacheData?.[0]?.last_matchday || 0;

    // 2. Get all players from the view
    const viewRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rentabilidad_view?select=*&league_id=eq.${leagueId}`,
      { headers: headers() }
    );
    if (!viewRes.ok) return null;
    const rows = await viewRes.json();
    if (!rows || rows.length === 0) return null;

    // 3. Fetch player photos from API
    let allPlayersMap = new Map<string, any>();
    try {
      const allPlayersRes = await fantasyAPI.getAllPlayers();
      const allPlayers = Array.isArray(allPlayersRes) ? allPlayersRes : allPlayersRes?.data || [];
      allPlayersMap = new Map(allPlayers.map((p: any) => {
        const imageUrl = p.image || (p.images?.transparent?.['256x256']) || null;
        const images = p.images || (imageUrl ? { transparent: { '256x256': imageUrl } } : undefined);
        return [String(p.id), { ...p, images }];
      }));
    } catch {}

    // 4. Group by manager
    const byManager = new Map<string, any[]>();
    for (const row of rows) {
      const mid = row.manager_id;
      if (!byManager.has(mid)) byManager.set(mid, []);
      byManager.get(mid)!.push(row);
    }

    // 5. Build resumen
    const miembros = Array.from(byManager.entries()).map(([mid, players]) => {
      const invertido = players.reduce((s, p) => s + (Number(p.invertido) || 0), 0);
      const devuelto = players.reduce((s, p) => s + (Number(p.devuelto) || 0), 0);
      const ganado_puntos = players.reduce((s, p) => s + (Number(p.ganado_puntos) || 0), 0);
      const rentabilidad = players.reduce((s, p) => s + (Number(p.rentabilidad) || 0), 0);
      return {
        id: Number(mid),
        nombre: players[0]?.manager_name || mid,
        invertido,
        devuelto,
        ganado_puntos,
        rentabilidad,
        filas: players.map(p => {
          return {
            player_master_id: p.player_master_id,
            nombre: p.player_name,
            foto: allPlayersMap.get(String(p.player_master_id))?.images?.transparent?.['256x256'] || null,
            fichaje: Number(p.fichaje) || 0,
            ventas: Number(p.ventas) || 0,
            ganado_puntos: Number(p.ganado_puntos) || 0,
            en_plantilla: p.en_plantilla,
            invertido: Number(p.invertido) || 0,
            devuelto: Number(p.devuelto) || 0,
            valor_actual: Number(p.precio_actual) || 0,
            tendencia: Number(p.tendencia) || 0,
            tendencia_dia: Number(p.tendencia_dia) || 0,
            aceleracion_estado: p.aceleracion_estado || null,
            rentabilidad: Number(p.rentabilidad) || 0,
          };
        }),
      };
    }).sort((a, b) => b.rentabilidad - a.rentabilidad);

    return { miembros, lastActivityAt, lastMatchday };
  } catch (e) {
    console.log('[RentCache] Error loading from view:', e);
    return null;
  }
}

/**
 * Leer datos raw de rentabilidad_players (sin JOIN con precios).
 * Usado por el refresco incremental para modificar datos directamente.
 */
export async function loadRentabilidadPlayersRaw(leagueId: string): Promise<any[] | null> {
  if (!isSupabaseConfigured() || !SUPABASE_URL) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rentabilidad_players?select=*&league_id=eq.${leagueId}`,
      { headers: headers() }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

/**
 * Guardar/actualizar filas en rentabilidad_players.
 * upsert por (league_id, manager_id, player_master_id).
 */
export async function upsertRentabilidadPlayers(
  leagueId: string,
  players: Array<{
    managerId: string;
    managerName: string;
    playerName: string;
    playerMasterId: number;
    invertido: number;
    fichaje: number;
    ventas: number;
    ganado_puntos: number;
    en_plantilla: boolean;
  }>
): Promise<void> {
  if (!isSupabaseConfigured() || !SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const rows = players.map(p => ({
      league_id: leagueId,
      manager_id: p.managerId,
      manager_name: p.managerName,
      player_master_id: p.playerMasterId,
      player_name: p.playerName,
      invertido: p.invertido,
      fichaje: p.fichaje,
      ventas: p.ventas,
      ganado_puntos: p.ganado_puntos,
      en_plantilla: p.en_plantilla,
      updated_at: new Date().toISOString(),
    }));

    // Upsert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      await fetch(`${SUPABASE_URL}/rest/v1/rentabilidad_players`, {
        method: 'POST',
        headers: {
          ...headers(),
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(batch),
      });
    }
  } catch (e) {
    console.log('[RentCache] Error upserting players:', e);
  }
}

/**
 * Actualizar last_activity_at y last_matchday en el caché.
 */
export async function updateCacheTimestamp(leagueId: string, lastActivityAt: string | null, lastMatchday: number): Promise<void> {
  if (!isSupabaseConfigured() || !SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rentabilidad_cache`, {
      method: 'POST',
      headers: {
        ...headers(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        league_id: leagueId,
        calculated_at: new Date().toISOString(),
        last_activity_at: lastActivityAt,
        last_matchday: lastMatchday,
      }),
    });
  } catch {}
}
