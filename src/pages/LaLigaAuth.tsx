import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Card } from '@heroui/react';
import { useAuthStore } from '../stores/authStore';

export default function LaLigaAuth() {
  const navigate = useNavigate();
  const { loginLaLiga, laligaAuthenticated } = useAuthStore();

  const [tokenJson, setTokenJson] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleToken = async () => {
    setTokenError('');
    setLoading(true);
    try {
      const parsed = JSON.parse(tokenJson);
      if (!parsed.access_token && !parsed.id_token) {
        setTokenError('El JSON debe contener access_token o id_token');
        setLoading(false);
        return;
      }
      await loginLaLiga({
        access_token: parsed.access_token || parsed.id_token,
        id_token: parsed.id_token,
        refresh_token: parsed.refresh_token,
        expires_on: parsed.expires_on || parsed.id_token_expires_in
          ? Math.floor(Date.now() / 1000) + (parsed.id_token_expires_in || 3600)
          : undefined,
      });
      navigate('/select-league');
    } catch {
      setTokenError('JSON no válido');
    }
    setLoading(false);
  };

  if (laligaAuthenticated) {
    navigate('/select-league');
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-400 to-primary-600 p-4">
      <Card className="w-full max-w-md">
        <Card.Header className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-bold">Conectar LaLiga</h1>
          <p className="text-sm text-muted">Necesitamos tu sesión de LaLiga Fantasy</p>
        </Card.Header>
        <Card.Content>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 text-sm text-muted">
              <p>1. Abre <a href="https://miliga.laliga.com/" target="_blank" rel="noreferrer" className="text-primary underline font-medium">miliga.laliga.com</a> e inicia sesión</p>
              <p>2. Abre DevTools (F12) → Network → filtra por "token"</p>
              <p>3. Copia la respuesta JSON del request token</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">JSON del token</label>
              <Input
                placeholder='{"access_token": "...", "refresh_token": "..."}'
                value={tokenJson}
                onChange={(e) => setTokenJson(e.target.value)}
              />
            </div>
            {tokenError && <p className="text-danger text-sm">{tokenError}</p>}
            <Button variant="primary" onPress={handleToken} isPending={loading} isDisabled={!tokenJson.trim()}>
              Conectar LaLiga
            </Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
