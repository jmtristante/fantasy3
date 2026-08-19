import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured } from '../services/supabaseScraping';

const EMPTY = { precios: new Map(), mapeo: new Map(), scrapingPlayers: new Map() };
const PreciosActualesContext = createContext(EMPTY);

export function PreciosActualesProvider({ children }) {
  const { data } = useQuery({
    queryKey: ['preciosActuales'],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return EMPTY;
      try {
        const { getLatestPrices, getScrapingPlayers } = await import('../services/supabaseScraping');
        const [precios, scrapingPlayers] = await Promise.all([
          getLatestPrices(),
          getScrapingPlayers(),
        ]);

        // Fetch mapeo: player_master_id -> jugador_id
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/mapeo_jugadores?select=player_master_id,jugador_id&limit=50000`,
          {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
          },
        );
        const rows = res.ok ? await res.json() : [];
        const mapeo = new Map();
        for (const r of rows || []) {
          mapeo.set(Number(r.player_master_id), Number(r.jugador_id));
        }
        return { precios, mapeo, scrapingPlayers };
      } catch {
        return EMPTY;
      }
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return (
    <PreciosActualesContext.Provider value={data || EMPTY}>
      {children}
    </PreciosActualesContext.Provider>
  );
}

export function usePreciosActuales() {
  return useContext(PreciosActualesContext);
}
