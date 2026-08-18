import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Spinner } from '@heroui/react';
import { useAuthStore } from '../stores/authStore';
import { fantasyAPI } from '../services/api';

interface League {
  id: string;
  name: string;
}

export default function LeagueSelector() {
  const navigate = useNavigate();
  const { setLeague, laligaAuthenticated } = useAuthStore();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!laligaAuthenticated) {
      navigate('/login');
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
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-400 to-primary-600 p-4">
      <Card className="w-full max-w-md">
        <Card.Header className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-bold">Selecciona tu liga</h1>
          <p className="text-sm text-muted">Elige la liga en la que quieres jugar</p>
        </Card.Header>
        <Card.Content>
          {error && <p className="text-danger text-sm mb-4">{error}</p>}
          <div className="flex flex-col gap-2">
            {leagues.length === 0 ? (
              <p className="text-muted text-center py-4">No se encontraron ligas</p>
            ) : (
              leagues.map((league) => (
                <Button
                  key={league.id}
                  variant="flat"
                  className="justify-start"
                  onPress={() => handleSelect(league)}
                >
                  {league.name}
                </Button>
              ))
            )}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
