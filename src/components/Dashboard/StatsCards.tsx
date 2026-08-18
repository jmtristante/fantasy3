import { Card } from '@heroui/react';
import { Trophy, TrendingUp, Wallet, Star } from 'lucide-react';

function formatMoney(v: number) {
  return new Intl.NumberFormat('es-ES').format(v) + '€';
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <Card>
      <Card.Header className="flex flex-row items-center gap-2 pb-2">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <p className="text-sm text-muted">{label}</p>
      </Card.Header>
      <Card.Content>
        <p className="text-2xl font-bold">{value}</p>
      </Card.Content>
    </Card>
  );
}

interface StatsCardsProps {
  position: number;
  points: number;
  teamValue: number;
  cash: number;
}

export default function StatsCards({ position, points, teamValue, cash }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={Trophy} label="Posición" value={`#${position}`} color="bg-yellow-500" />
      <StatCard icon={Star} label="Puntos" value={String(points)} color="bg-blue-500" />
      <StatCard icon={TrendingUp} label="Valor equipo" value={formatMoney(teamValue)} color="bg-green-500" />
      <StatCard icon={Wallet} label="Cartera" value={formatMoney(cash)} color="bg-purple-500" />
    </div>
  );
}
