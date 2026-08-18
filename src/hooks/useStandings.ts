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
  if (!standings?.length || !laligaUser?.userId) return null;

  return standings.find((s: any) => {
    const uid = String(s.userId || s.team?.userId || s.team?.manager?.id || '');
    return uid === laligaUser.userId;
  }) || null;
}
