import React, { useEffect, useMemo } from 'react';
import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { fantasyAPI } from '../services/api';
import { useStandings, useCurrentUser } from '../hooks/useStandings';
import StatsCards from '../components/Dashboard/StatsCards';
import LeagueStandings from '../components/Dashboard/LeagueStandings';
import RecentActivity from '../components/Dashboard/RecentActivity';

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
  const { data: standings, isLoading: loadingStandings } = useStandings();
  const currentUser = useCurrentUser(standings || []);

  const [activity, setActivity] = React.useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = React.useState(true);
  const [allPlayers, setAllPlayers] = React.useState<Map<string, any>>(new Map());

  const teamId = currentUser?.teamId || currentUser?.team?.id;

  // Fetch team money from API
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

  // Build manager name lookup from standings
  const managers = useMemo(() => {
    const map = new Map<string, string>();
    extractArray(standings).forEach((s: any) => {
      const uid = s.userId || s.team?.userId || s.team?.manager?.id;
      const name = s.manager || s.team?.manager?.managerName || s.name || '?';
      if (uid) map.set(String(uid), name);
    });
    return map;
  }, [standings]);

  // Fetch activity + allPlayers
  useEffect(() => {
    if (!leagueId) return;
    setLoadingActivity(true);

    const fetchData = async () => {
      try {
        const token = useAuthStore.getState().getBearerToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-lang': 'es',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const [activityRes, playersRes] = await Promise.all([
          fetch(
            `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3005/api'}/v1/competition/1/leagues/${leagueId}/activity/0?x-lang=es`,
            { headers }
          ),
          fantasyAPI.getAllPlayers(),
        ]);

        if (activityRes.ok) {
          const data = await activityRes.json();
          setActivity(extractArray(data));
        }

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
          <h1 className="text-3xl font-bold">{leagueName || 'Dashboard'}</h1>
          <p className="text-muted">Gestiona tu equipo de Fantasy</p>
        </div>
      </div>

      <StatsCards
        position={position}
        points={points}
        teamValue={teamValue}
        cash={cash}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {loadingActivity ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <RecentActivity data={activity} managers={managers} players={allPlayers} />
          )}
        </div>
        <div>
          <LeagueStandings data={standings} />
        </div>
      </div>
    </div>
  );
}
