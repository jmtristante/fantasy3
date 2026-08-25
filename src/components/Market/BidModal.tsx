import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/react';
import { X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { fantasyAPI } from '../../services/api';

interface BidModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
  isModifying: boolean;
  currentBid: number;
  onAfterBid: () => void;
}

function formatMoney(v: number) {
  return new Intl.NumberFormat('es-ES').format(v) + '€';
}

export default function BidModal({ isOpen, onClose, item, isModifying, currentBid, onAfterBid }: BidModalProps) {
  const leagueId = useAuthStore((s) => s.leagueId);
  const player = item?.playerMaster || {};
  const minBid = Math.max(player.marketValue || 0, item?.salePrice || 0);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmount(isModifying ? String(currentBid) : String(minBid));
      setError('');
    }
  }, [isOpen, isModifying, currentBid, minBid]);

  if (!isOpen) return null;

  const bidAmount = Number(amount.replace(/\D/g, '')) || 0;
  const isBelowMin = bidAmount < minBid;

  const handleSubmit = async () => {
    if (!item || !leagueId || bidAmount <= 0) return;
    setLoading(true);
    setError('');
    try {
      if (isModifying) {
        await fantasyAPI.modifyBid(leagueId, item.id, item.bid?.id || item.bidId || '', bidAmount);
      } else {
        await fantasyAPI.makeBid(leagueId, item.id, bidAmount);
      }
      onAfterBid();
      onClose();
    } catch (e: any) {
      // 400 might mean bid already exists or is valid
      if (e.message?.includes('pending bid')) {
        onAfterBid();
        onClose();
      } else {
        setError(e.message || 'Error al pujar');
      }
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {isModifying ? 'Modificar puja' : 'Nueva puja'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Player info */}
          <div className="flex items-center gap-3">
            {player.images?.transparent?.['256x256'] && (
              <img src={player.images.transparent['256x256']} alt="" className="w-10 h-10 rounded-full object-cover" />
            )}
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{player.nickname || player.name}</p>
              <p className="text-xs text-gray-500">{player.team?.name || ''}</p>
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
              <p className="text-gray-500">Precio venta</p>
              <p className="font-semibold text-gray-900 dark:text-white">{formatMoney(item?.salePrice || 0)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
              <p className="text-gray-500">Valor mercado</p>
              <p className="font-semibold text-gray-900 dark:text-white">{formatMoney(player.marketValue || 0)}</p>
            </div>
          </div>

          {/* Bid input */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isModifying ? 'Nueva cantidad' : 'Tu puja'}
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, '');
                setAmount(raw);
              }}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-right text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {isBelowMin && bidAmount > 0 && (
              <p className="text-xs text-red-500 mt-1">Mínimo: {formatMoney(minBid)}</p>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <Button variant="secondary" onPress={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            variant="primary"
            onPress={handleSubmit}
            isPending={loading}
            isDisabled={bidAmount <= 0 || isBelowMin}
            className="flex-1"
          >
            {isModifying ? 'Modificar' : 'Pujar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
