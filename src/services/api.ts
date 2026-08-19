import { useAuthStore } from '../stores/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://fantasy2-api.onrender.com';

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

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const token = useAuthStore.getState().getBearerToken();
  if (!token) {
    throw new Error('No token');
  }
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-lang': 'es',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    useAuthStore.getState().logoutLaLiga();
    throw new Error('Token expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error: ${res.status}`);
  }
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().getBearerToken();
  if (!token) throw new Error('No token');
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'x-lang': 'es',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    useAuthStore.getState().logoutLaLiga();
    throw new Error('Token expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error: ${res.status}`);
  }
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
  getCurrentUser: () => apiGet<any>('/v4/user/me?x-lang=es'),
  makeBid: (leagueId: string, marketId: string, bidAmount: number) =>
    apiPost<any>(`/v1/competition/1/league/${leagueId}/market/${marketId}/bid?x-lang=es`, { money: bidAmount }),
  modifyBid: (leagueId: string, marketId: string, bidId: string, bidAmount: number) =>
    apiPost<any>(`/v1/competition/1/league/${leagueId}/market/${marketId}/bid/${bidId}?x-lang=es`, { money: bidAmount }),
  cancelBid: (leagueId: string, marketId: string, bidId: string) =>
    apiDelete<any>(`/v1/competition/1/league/${leagueId}/market/${marketId}/bid/${bidId}/cancel?x-lang=es`),
  getPlayerOffers: (leagueId: string, playerTeamId: string) =>
    apiGet<any>(`/v1/competition/1/league/${leagueId}/playerTeam/${playerTeamId}/offer?x-lang=es`),
  acceptOffer: (leagueId: string, marketId: string, offerId: string, offerMoney: number) =>
    apiPost<any>(`/v1/competition/1/league/${leagueId}/market/${marketId}/offer/${offerId}/accept?x-lang=es`, { offerMoney }),
  declineOffer: (leagueId: string, marketId: string, offerId: string) =>
    apiPost<any>(`/v1/competition/1/league/${leagueId}/market/${marketId}/offer/${offerId}/reject?x-lang=es`),
};
