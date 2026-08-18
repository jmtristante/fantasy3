import { Card } from '@heroui/react';
import { useAuthStore } from '../../stores/authStore';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  if (res?.data?.elements && Array.isArray(res.data.elements)) return res.data.elements;
  return [];
}

export default function LeagueStandings({ data }: { data: any }) {
  const standings = extractArray(data);
  const laligaUser = useAuthStore((s) => s.laligaUser);

  return (
    <Card>
      <Card.Header>
        <Card.Title>Clasificación</Card.Title>
      </Card.Header>
      <Card.Content>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider">
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Manager</th>
                <th className="text-right p-2">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s: any, i: number) => {
                const pos = s.position || i + 1;
                const name = s.manager || s.team?.manager?.managerName || s.name || '?';
                const uid = String(s.userId || s.team?.userId || s.team?.manager?.id || '');
                const isMe = laligaUser?.userId && uid === laligaUser.userId;
                return (
                  <tr key={uid || i} className={`border-b border-divider ${isMe ? 'bg-primary-50' : ''}`}>
                    <td className={`p-2 ${pos <= 3 ? 'font-bold text-warning' : ''}`}>{pos}</td>
                    <td className={`p-2 ${isMe ? 'font-semibold' : ''}`}>{name}</td>
                    <td className="p-2 text-right">{s.points || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card.Content>
    </Card>
  );
}
