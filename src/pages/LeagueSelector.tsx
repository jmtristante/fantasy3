import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@heroui/react';
import { Trophy, ChevronRight, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { fantasyAPI } from '../services/api';

interface League {
  id: string;
  name: string;
}

export default function LeagueSelector() {
  const navigate = useNavigate();
  const { setLeague, laligaAuthenticated, logoutLaLiga } = useAuthStore();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!laligaAuthenticated) {
      navigate('/laliga-auth');
      return;
    }

    const fetchLeagues = async () => {
      try {
        const res = await fantasyAPI.getLeagues();
        const data = res?.data || res;
        const list = Array.isArray(data) ? data : data?.elements || data?.leagues || [];
        setLeagues(list.map((l: any) => ({ id: String(l.id), name: l.name || `Liga ${l.id}` })));
      } catch (e: any) {
        setError(e.message || 'Error al cargar ligas');
      } finally {
        setLoading(false);
      }
    };

    fetchLeagues();
  }, [laligaAuthenticated, navigate]);

  const handleSelect = (league: League) => {
    setLeague(league.id, league.name);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/25">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Selecciona tu liga</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Elige la liga en la que quieres jugar</p>
        </div>

        {/* League List */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          {error && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {leagues.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Trophy className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No se encontraron ligas</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {leagues.map((league, i) => (
                <button
                  key={league.id}
                  onClick={() => handleSelect(league)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <Trophy className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{league.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">ID: {league.id}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-500 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Back to login */}
        <div className="text-center mt-6">
          <button
            onClick={() => { logoutLaLiga(); navigate('/laliga-auth'); }}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex items-center gap-1 mx-auto"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cambiar cuenta de LaLiga
          </button>
        </div>
      </div>
    </div>
  );
}
