import { useAuthStore } from '../stores/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3005';

let _toast: any = null;
import('react-hot-toast').then((m) => { _toast = m.default; });

function showError(msg: string) {
  _toast?.error(msg, { duration: 5000 });
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().getBearerToken();
  if (!token) {
    showError('La sesión de LaLiga ha expirado. Vuelve a conectar tu cuenta.');
    throw new Error('No token');
  }
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-lang': 'es',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    useAuthStore.getState().logoutLaLiga();
    showError('La sesión de LaLiga ha expirado. Vuelve a conectar tu cuenta.');
    throw new Error('Token expired');
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const fantasyAPI = {
  getLeagues: () => apiGet<any>('/v1/competition/1/leagues?x-lang=es'),
  getLeagueRanking: (leagueId: string) => apiGet<any>(`/v1/competition/1/leagues/${leagueId}/standing?x-lang=es`),
  getLeagueActivity: (leagueId: string, page: number = 0) => apiGet<any>(`/v1/competition/1/leagues/${leagueId}/activity/${page}?x-lang=es`),
  getMarket: (leagueId: string) => apiGet<any>(`/v1/competition/1/league/${leagueId}/market?x-lang=es`),
  getTeamData: (leagueId: string, teamId: string) => apiGet<any>(`/v1/competition/1/leagues/${leagueId}/teams/${teamId}?x-lang=es`),
  getTeamMoney: (teamId: string) => apiGet<any>(`/v1/competition/1/teams/${teamId}/money?x-lang=es`),
  getMatchday: (week: number) => apiGet<any>(`/v1/competition/1/calendar?weekNumber=${week}&x-lang=es`),
  getCurrentWeek: () => apiGet<any>('/v1/competition/1/week/current?x-lang=es'),
  getTeamsMaster: () => apiGet<any>('/v3/teams-master?x-lang=es'),
  getAllPlayers: () => apiGet<any>('/v1/competition/1/players?x-lang=es'),
  getPlayerDetails: (playerId: string, leagueId: string) => apiGet<any>(`/v1/competition/1/player/${playerId}/league/${leagueId}?x-lang=es`),
  getLeagueRankingByWeek: (leagueId: string, week: number) => apiGet<any>(`/v1/competition/1/leagues/${leagueId}/standing/${week}?x-lang=es`),
  getTeamLineup: (teamId: string, week: number) => apiGet<any>(`/v1/competition/1/teams/${teamId}/lineup/week/${week}?x-lang=es`),
  getCurrentUser: () => apiGet<any>('/v4/user/me?x-lang=es'),
};
