export const ACTIVITY_TYPES: Record<number, { label: string; icon: string }> = {
  1: { label: 'Compras', icon: 'buy' },
  4: { label: 'Blindajes', icon: 'shield' },
  6: { label: 'Recompensas', icon: 'reward' },
  7: { label: 'Alineación', icon: 'lineup' },
  9: { label: 'Nuevos miembros', icon: 'member' },
  31: { label: 'Fichajes', icon: 'signing' },
  32: { label: 'Cláusulas', icon: 'clause' },
  33: { label: 'Ventas', icon: 'sale' },
};

export const TIME_RANGES = [
  { value: 'all', label: 'Todo' },
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
];

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Reciente' },
  { value: 'amount', label: 'Importe' },
  { value: 'user', label: 'Manager' },
  { value: 'activity', label: 'Tipo' },
];

export function filterByTimeRange(items: any[], range: string): any[] {
  if (range === 'all') return items;
  const now = new Date();
  const start = new Date();
  if (range === 'today') start.setHours(0, 0, 0, 0);
  else if (range === 'week') start.setDate(now.getDate() - 7);
  else if (range === 'month') start.setMonth(now.getMonth() - 1);

  return items.filter((a) => {
    const d = new Date(a.createdAt || a.timestamp);
    return d >= start;
  });
}

export function sortActivity(items: any[], sort: string): any[] {
  const sorted = [...items];
  if (sort === 'amount') sorted.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  else if (sort === 'user') sorted.sort((a, b) => (a.user1Name || '').localeCompare(b.user1Name || ''));
  else if (sort === 'activity') sorted.sort((a, b) => (a.activityTypeId || 0) - (b.activityTypeId || 0));
  // 'recent' is default order from API
  return sorted;
}
