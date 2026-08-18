import { Card } from '@heroui/react';
import { ShoppingCart, Shield, TrendingUp, Euro, UserPlus } from 'lucide-react';

const ACTIVITY_ICONS: Record<number, any> = {
  1: ShoppingCart,
  31: ShoppingCart,
  32: Shield,
  33: TrendingUp,
  6: Euro,
  9: UserPlus,
};

const ACTIVITY_VERBS: Record<number, string> = {
  1: 'compró',
  31: 'fichó',
  32: 'clausuló',
  33: 'vendió',
  6: 'ganó',
  9: 'se unió a la liga',
};

function formatMoney(v: number) {
  return new Intl.NumberFormat('es-ES').format(v) + '€';
}

function resolvePlayerName(item: any, players: Map<string, any>): string {
  // 1. Embedded player object
  if (item.playerMaster && typeof item.playerMaster === 'object') {
    return item.playerMaster.nickname || item.playerMaster.name || '';
  }
  if (item.player && typeof item.player === 'object') {
    return item.player.nickname || item.player.name || '';
  }
  // 2. playerName string
  if (item.playerName) return item.playerName;
  // 3. Lookup by playerMasterId
  const id = item.playerMasterId ?? item.playerId;
  if (id != null) {
    const p = players.get(String(id));
    if (p) return p.nickname || p.name || '';
  }
  return '';
}

interface RecentActivityProps {
  data: any[];
  managers: Map<string, string>;
  players: Map<string, any>;
}

export default function RecentActivity({ data, managers, players }: RecentActivityProps) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Actividad reciente</Card.Title>
      </Card.Header>
      <Card.Content>
        {data.length === 0 ? (
          <p className="text-muted text-sm">Sin actividad reciente</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.slice(0, 15).map((a: any, i: number) => {
              const Icon = ACTIVITY_ICONS[a.activityTypeId] || ShoppingCart;
              const verb = ACTIVITY_VERBS[a.activityTypeId] || 'realizó una acción';
              const userName = a.user1Name || managers.get(String(a.user1Id)) || 'Alguien';
              const playerName = resolvePlayerName(a, players);
              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="p-1.5 rounded-full bg-default-100">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{userName}</span>{' '}
                    <span className="text-muted">{verb}</span>{' '}
                    {playerName && <span className="font-medium">{playerName}</span>}
                    {a.amount ? <span className="text-muted"> por {formatMoney(a.amount)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
