import React from 'react';
import { ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, AlertTriangle, Minus } from 'lucide-react';

function normaliza(str: string | null | undefined) {
  return (str ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

interface TrendBadgeProps {
  tendencia?: number | null;
  aceleracionEstado?: string | null;
  className?: string;
}

export default function TrendBadge({ tendencia, aceleracionEstado, className = '' }: TrendBadgeProps) {
  const v = tendencia ?? 0;
  const sube = v > 0;
  const baja = v < 0;
  const verde = v >= 0;
  const norm = normaliza(aceleracionEstado);

  let Icon = Minus;
  let title = 'Sin movimiento';

  if (!norm) {
    if (sube) { Icon = ArrowUp; title = 'Sube'; }
    else if (baja) { Icon = ArrowDown; title = 'Baja'; }
  } else {
    const mucho = norm.includes('mucho');
    if (norm.startsWith('desacelera')) {
      Icon = sube ? (mucho ? ChevronsDown : ArrowDown) : baja ? (mucho ? ChevronsUp : ArrowUp) : Minus;
      title = sube ? 'Sube (desacelera)' : baja ? 'Baja (desacelera)' : 'Sin movimiento';
    } else if (norm.startsWith('acelera')) {
      Icon = sube ? (mucho ? ChevronsUp : ArrowUp) : baja ? (mucho ? ChevronsDown : ArrowDown) : Minus;
      title = sube ? 'Sube (acelera)' : baja ? 'Baja (acelera)' : 'Sin movimiento';
    } else if (norm.startsWith('inflexion')) {
      Icon = AlertTriangle;
      title = 'Inflexión';
    }
  }

  const bg = verde
    ? 'bg-green-600/90 text-white'
    : baja
    ? 'bg-red-600/90 text-white'
    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400';

  return (
    <span
      className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] leading-none shadow ${bg} ${className}`}
      title={aceleracionEstado || title}
    >
      <Icon className="w-3 h-3" />
    </span>
  );
}
