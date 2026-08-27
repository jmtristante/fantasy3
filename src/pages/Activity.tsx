import React, { useState, useMemo } from 'react';
import { Card, Button, Spinner } from '@heroui/react';
import { Search, RefreshCw, ShoppingCart, Shield, TrendingUp, Euro, UserPlus, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { fantasyAPI } from '../services/api';
import { ACTIVITY_TYPES } from '../components/Activity/activityUtils';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';

const ICONS: Record<number, React.ElementType> = {
  1: ShoppingCart, 31: ShoppingCart, 32: Shield, 33: TrendingUp, 6: Euro, 9: UserPlus, 4: Shield, 7: Calendar,
};

const VERBS: Record<number, string> = {
  1: 'compró', 31: 'fichó', 32: 'clausuló', 33: 'vendió', 6: 'ganó', 9: 'se unió a la liga', 4: 'blindó', 7: 'alineó',
};

const TYPE_COLORS: Record<number, string> = {
  1: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  31: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  32: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  33: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  6: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  9: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  4: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  7: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

function formatMoney(v: number) {
  return new Intl.NumberFormat('es-ES').format(v) + '€';
}

function formatDate(d: string | Date) {
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  if (diffH < 24) return `hace ${diffH}h`;
  if (diffD < 7) return `hace ${diffD}d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function resolveName(item: any, cache: Map<string, string>): string {
  return item.user1Name || cache.get(String(item.user1Id)) || 'Alguien';
}

function resolvePlayer(item: any, players: Map<string, any>): string {
  const embedded = item.playerMaster || item.player;
  if (embedded?.nickname || embedded?.name) return embedded.nickname || embedded.name;
  if (item.playerName) return item.playerName;
  const id = item.playerMasterId ?? item.playerId;
  if (id != null) { const p = players.get(String(id)); if (p) return p.nickname || p.name || ''; }
  return '';
}

function resolvePlayerImage(item: any, players: Map<string, any>): string | null {
  const embedded = item.playerMaster || item.player;
  if (embedded?.images?.transparent?.['256x256']) return embedded.images.transparent['256x256'];
  if (embedded?.image) return embedded.image;
  const id = item.playerMasterId ?? item.playerId;
  if (id != null) {
    const p = players.get(String(id));
    if (p?.images?.transparent?.['256x256']) return p.images.transparent['256x256'];
    if (p?.image) return p.image;
  }
  return null;
}

export default function Activity() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [limit, setLimit] = useState(50);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const [allActivity, setAllActivity] = useState<any[]>([]);
  const [fetchingPages, setFetchingPages] = useState(false);

  const { data: standings } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId!),
    enabled: !!leagueId,
    staleTime: 60_000,
  });

  const { data: playersData } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 300_000,
  });

  const managers = useMemo(() => {
    const map = new Map<string, string>();
    const arr = Array.isArray(standings) ? standings : standings?.data || [];
    arr.forEach((s: any) => {
      const uid = s.userId || s.team?.userId || s.team?.manager?.id;
      const name = s.manager || s.team?.manager?.managerName || s.name || '?';
      if (uid) map.set(String(uid), name);
    });
    return map;
  }, [standings]);

  const players = useMemo(() => {
    const map = new Map<string, any>();
    const arr = Array.isArray(playersData) ? playersData : playersData?.data || playersData?.data?.elements || [];
    arr.forEach((p: any) => map.set(String(p.id), p));
    return map;
  }, [playersData]);

  React.useEffect(() => {
    if (!leagueId) return;
    setFetchingPages(true);
    setAllActivity([]);
    const fetchAll = async () => {
      const all: any[] = [];
      for (let page = 0; page < 5; page++) {
        try {
          const res = await fantasyAPI.getLeagueActivity(leagueId, page);
          const arr = Array.isArray(res) ? res : res?.data || [];
          if (!arr.length) break;
          all.push(...arr);
          if (page < 4) await new Promise((r) => setTimeout(r, 300));
        } catch { break; }
      }
      setAllActivity(all);
      setFetchingPages(false);
    };
    fetchAll();
  }, [leagueId]);

  const filtered = useMemo(() => {
    let result = allActivity;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) => {
        const userName = resolveName(a, managers).toLowerCase();
        const playerName = resolvePlayer(a, players).toLowerCase();
        return userName.includes(q) || playerName.includes(q);
      });
    }
    if (typeFilter !== 'all') {
      result = result.filter((a) => String(a.activityTypeId) === typeFilter);
    }
    if (userFilter !== 'all') {
      result = result.filter((a) => String(a.user1Id) === userFilter);
    }
    return result.slice(0, limit);
  }, [allActivity, search, typeFilter, userFilter, limit, managers, players]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Actividad</h1>
        <p className="text-sm text-muted mt-1">{allActivity.length} movimientos en la liga</p>
      </div>

      {/* Filters */}
      <Card>
        <Card.Content className="p-4 space-y-2">
          {/* Search - full width */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar manager o jugador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>

          {/* Selects row */}
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
              <option value="all">Tipo</option>
              {Object.entries(ACTIVITY_TYPES).map(([id, { label }]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>

            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
              <option value="all">Manager</option>
              {Array.from(managers.entries()).map(([uid, name]) => (
                <option key={uid} value={uid}>{name}</option>
              ))}
            </select>
          </div>
        </Card.Content>
      </Card>

      {/* Activity List */}
      <Card>
        <Card.Content className="p-0">
          {fetchingPages && allActivity.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted">
              <Spinner /> Cargando actividad...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted">Sin actividad</div>
          ) : (
            <div className="divide-y divide-divider">
              {filtered.map((a: any, i: number) => {
                const Icon = ICONS[a.activityTypeId] || ShoppingCart;
                const verb = VERBS[a.activityTypeId] || 'realizó una acción';
                const userName = resolveName(a, managers);
                const sellerName = a.user2Id ? (a.user2Name || managers.get(String(a.user2Id)) || null) : null;
                const playerName = resolvePlayer(a, players);
                const playerImg = resolvePlayerImage(a, players);
                const typeColor = TYPE_COLORS[a.activityTypeId] || 'bg-gray-100 text-gray-600';

                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    {/* Player photo + Icon badge */}
                    <div className="relative flex-shrink-0">
                      {playerImg ? (
                        <button
                          onClick={() => {
                            const id = a.playerMasterId ?? a.playerId ?? a.playerMaster?.id;
                            if (id) {
                              const pm = a.playerMaster || players.get(String(id)) || {};
                              setSelectedPlayer({ id, player_master_id: id, name: pm.name, nickname: pm.nickname, images: pm.images });
                              setIsPlayerModalOpen(true);
                            }
                          }}
                          className="w-10 h-10 rounded-full overflow-hidden border-2 border-white dark:border-gray-800 shadow-sm"
                        >
                          <img src={playerImg} alt="" className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <span className="text-xs font-medium text-gray-500">
                            {playerName ? playerName.charAt(0).toUpperCase() : '?'}
                          </span>
                        </div>
                      )}
                      <div className={`absolute -top-1 -left-1 p-0.5 rounded-full ${typeColor}`}>
                        <Icon className="w-2.5 h-2.5" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-snug">
                        <span className="font-semibold text-gray-900 dark:text-white">{userName}</span>{' '}
                        <span className="text-muted">{verb}</span>{' '}
                        {playerName && (
                          <button
                            onClick={() => {
                              const id = a.playerMasterId ?? a.playerId ?? a.playerMaster?.id;
                              if (id) {
                                const pm = a.playerMaster || players.get(String(id)) || {};
                                setSelectedPlayer({ id, player_master_id: id, name: pm.name, nickname: pm.nickname, images: pm.images });
                                setIsPlayerModalOpen(true);
                              }
                            }}
                            className="font-semibold text-gray-900 dark:text-white hover:underline"
                          >
                            {playerName}
                          </button>
                        )}
                        {sellerName && (
                          <span className="text-muted"> a <span className="font-medium text-gray-700 dark:text-gray-300">{sellerName}</span></span>
                        )}
                      </div>
                      {/* Second row: time + amount */}
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">
                          {formatDate(a.createdAt || a.timestamp)}
                        </span>
                        {a.amount ? (
                          <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                            {formatMoney(a.amount)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Load More */}
      {filtered.length >= limit && allActivity.length > limit && (
        <div className="text-center">
          <Button variant="secondary" onPress={() => setLimit((l) => l + 50)}>
            Cargar más
          </Button>
        </div>
      )}

      <PlayerDetailModal player={selectedPlayer} isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedPlayer(null); }} />
    </div>
  );
}
