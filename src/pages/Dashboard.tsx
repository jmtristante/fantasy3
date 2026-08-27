import React, { useEffect, useMemo } from 'react';
import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { fantasyAPI } from '../services/api';
import { useStandings, useCurrentUser } from '../hooks/useStandings';
import StatsCards from '../components/Dashboard/StatsCards';
import LeagueStandings from '../components/Dashboard/LeagueStandings';
import RecentActivity from '../components/Dashboard/RecentActivity';
import UpcomingMatches from '../components/Dashboard/UpcomingMatches';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  if (res?.data?.elements && Array.isArray(res.data.elements)) return res.data.elements;
  return [];
}

function extractPlayers(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  if (res?.data?.elements && Array.isArray(res.data.elements)) return res.data.elements;
  return [];
}

export default function Dashboard() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const leagueName = useAuthStore((s) => s.leagueName);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { data: standings, isLoading: loadingStandings } = useStandings();
  const currentUser = useCurrentUser(standings || []);

  const [activity, setActivity] = React.useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = React.useState(true);
  const [allPlayers, setAllPlayers] = React.useState<Map<string, any>>(new Map());

  const teamId = currentUser?.teamId || currentUser?.team?.id;

  const { data: teamMoney } = useQuery({
    queryKey: ['teamMoney', teamId],
    queryFn: () => fantasyAPI.getTeamMoney(String(teamId)),
    enabled: !!teamId,
    staleTime: 0,
  });

  const cash = useMemo(() => {
    if (!teamMoney) return 0;
    const data = teamMoney?.data || teamMoney;
    return data?.teamMoney ?? data?.money ?? data?.amount ?? 0;
  }, [teamMoney]);

  const managers = useMemo(() => {
    const map = new Map<string, string>();
    extractArray(standings).forEach((s: any) => {
      const uid = s.userId || s.team?.userId || s.team?.manager?.id;
      const name = s.manager || s.team?.manager?.managerName || s.name || '?';
      if (uid) map.set(String(uid), name);
    });
    return map;
  }, [standings]);

  useEffect(() => {
    if (!leagueId) return;
    setLoadingActivity(true);

    const fetchData = async () => {
      try {
        const [activityRes, playersRes] = await Promise.all([
          fantasyAPI.getLeagueActivity(leagueId),
          fantasyAPI.getAllPlayers(),
        ]);

        setActivity(extractArray(activityRes));

        const players = extractPlayers(playersRes);
        const map = new Map<string, any>();
        players.forEach((p: any) => map.set(String(p.id), p));
        setAllPlayers(map);
      } catch {}
      setLoadingActivity(false);
    };
    fetchData();
  }, [leagueId]);

  if (loadingStandings) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const position = currentUser?.position || 0;
  const points = currentUser?.points || currentUser?.team?.points || 0;
  const teamValue = currentUser?.teamValue || currentUser?.team?.teamValue || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {leagueName || 'Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestiona tu equipo de Fantasy</p>
        </div>
        <button
          onClick={() => navigate('/select-league')}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          Cambiar liga
        </button>
      </div>

      <StatsCards position={position} points={points} teamValue={teamValue} cash={cash} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {loadingActivity ? (
            <div className="card flex justify-center py-8"><Spinner /></div>
          ) : (
            <RecentActivity data={activity} managers={managers} players={allPlayers} />
          )}
        </div>
        <div className="space-y-6">
          <LeagueStandings data={standings} />
          <UpcomingMatches />
        </div>
      </div>

      {/* Logout button - mobile only */}
      <div className="md:hidden pt-4 pb-2">
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
