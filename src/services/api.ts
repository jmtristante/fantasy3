import { useAuthStore } from '../stores/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://fantasy2-api.onrender.com';

export async function apiGet<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().getBearerToken();
  const res = await fetch(`${BASE_URL}/api?path=${encodeURIComponent(path)}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-laliga-token': token } : {}),
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const fantasyAPI = {
  getLeagues: () => apiGet<any>('/v1/competition/1/leagues?x-lang=es'),
  getLeagueRanking: (leagueId: string) => apiGet<any>(`/v1/competition/1/leagues/${leagueId}/standing?x-lang=es`),
  getTeamData: (leagueId: string, teamId: string) => apiGet<any>(`/v1/competition/1/leagues/${leagueId}/teams/${teamId}?x-lang=es`),
  getTeamMoney: (teamId: string) => apiGet<any>(`/v1/competition/1/teams/${teamId}/money?x-lang=es`),
  getAllPlayers: () => apiGet<any>('/v1/competition/1/players?x-lang=es'),
  getCurrentUser: () => apiGet<any>('/v4/user/me?x-lang=es'),
};
