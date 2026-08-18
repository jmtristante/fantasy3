import { useQuery } from '@tanstack/react-query';
import { fantasyAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  if (res?.data?.elements && Array.isArray(res.data.elements)) return res.data.elements;
  return [];
}

export function useStandings() {
  const leagueId = useAuthStore((s) => s.leagueId);
  return useQuery({
    queryKey: ['standings', leagueId],
    queryFn: async () => {
      const res = await fantasyAPI.getLeagueRanking(leagueId!);
      return extractArray(res);
    },
    enabled: !!leagueId,
    staleTime: 60_000,
  });
}

export function useCurrentUser(standings: any[]) {
  const laligaUser = useAuthStore((s) => s.laligaUser);
  const laligaTokens = useAuthStore((s) => s.laligaTokens);

  if (!standings?.length) return null;

  // Debug: log what we have
  console.log('[useCurrentUser] laligaUser:', laligaUser);
  console.log('[useCurrentUser] standings userIds:', standings.map((s: any) => s.userId || s.team?.userId || s.team?.manager?.id));

  // Try matching by laligaUser.userId first
  if (laligaUser?.userId) {
    const found = standings.find((s: any) => {
      const uid = String(s.userId || s.team?.userId || s.team?.manager?.id || '');
      return uid === laligaUser.userId;
    });
    if (found) return found;
  }

  // Fallback: try to find by decoding the id_token
  if (laligaTokens?.id_token) {
    try {
      const payload = JSON.parse(atob(laligaTokens.id_token.split('.')[1]));
      const sub = payload.sub || payload.oid;
      console.log('[useCurrentUser] id_token sub:', sub);
      if (sub) {
        const found = standings.find((s: any) => {
          const uid = String(s.userId || s.team?.userId || s.team?.manager?.id || '');
          return uid === sub;
        });
        if (found) return found;
      }
    } catch {}
  }

  return null;
}
