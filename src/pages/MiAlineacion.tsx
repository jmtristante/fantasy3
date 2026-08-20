import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Swords, Save, RotateCcw, ChevronDown } from 'lucide-react';
import { fantasyAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';
import toast from 'react-hot-toast';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  return [];
}

const POS_LABELS: Record<number, string> = { 1: 'PO', 2: 'DF', 3: 'MC', 4: 'DL' };
const POS_COLORS: Record<number, string> = {
  1: 'bg-yellow-500', 2: 'bg-blue-500', 3: 'bg-green-500', 4: 'bg-red-500',
};

interface LineupSlot {
  playerTeamId: number;
  playerMaster: any;
  [key: string]: any;
}

interface LineupState {
  goalkeeper: LineupSlot | null;
  defender: LineupSlot[];
  midfield: LineupSlot[];
  striker: LineupSlot[];
}

const EMPTY_LINEUP: LineupState = { goalkeeper: null, defender: [], midfield: [], striker: [] };

function getFormationRequirements(formation: string): { defenders: number; midfielders: number; strikers: number } | null {
  const parts = formation.split(',').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return { defenders: parts[0], midfielders: parts[1], strikers: parts[2] };
}

export default function MiAlineacion() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [lineup, setLineup] = useState<LineupState>(EMPTY_LINEUP);
  const [originalLineup, setOriginalLineup] = useState<LineupState>(EMPTY_LINEUP);
  const [selectedFormation, setSelectedFormation] = useState('');
  const [originalFormation, setOriginalFormation] = useState('');
  const [showFormationDropdown, setShowFormationDropdown] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ position: string; index?: number } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: standings } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId!),
    enabled: !!leagueId,
    staleTime: 60_000,
  });

  const userTeamId = useMemo(() => {
    if (!standings || !user) return null;
    const teams = extractArray(standings);
    const found = teams.find((t: any) => {
      const uid = t.userId || t.team?.manager?.id || t.team?.userId;
      return uid && user.id && String(uid) === String(user.id);
    });
    return found ? String(found.id || found.team?.id) : null;
  }, [standings, user]);

  const { data: currentLineupData, isLoading: loadingLineup } = useQuery({
    queryKey: ['currentLineup', userTeamId],
    queryFn: () => fantasyAPI.getCurrentLineup(userTeamId!),
    enabled: !!userTeamId,
    staleTime: 0,
  });

  const { data: formationsData } = useQuery({
    queryKey: ['freeFormations'],
    queryFn: () => fantasyAPI.getFreeFormations(),
    staleTime: 60 * 60 * 1000,
  });

  const { data: allPlayersData } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 300_000,
  });

  const allPlayers = useMemo(() => extractArray(allPlayersData), [allPlayersData]);

  const formations = useMemo(() => {
    const raw = extractArray(formationsData);
    return raw.map((f: any) => (typeof f === 'string' ? f : f.formation || f.id || String(f))).filter(Boolean);
  }, [formationsData]);

  useEffect(() => {
    if (!currentLineupData) return;
    const data = currentLineupData?.data ? currentLineupData.data : currentLineupData;
    const f = data?.formation;
    if (!f) return;

    const newLineup: LineupState = {
      goalkeeper: f.goalkeeper?.[0] || null,
      defender: f.defender || [],
      midfield: f.midfield || [],
      striker: f.striker || [],
    };
    setLineup(newLineup);
    setOriginalLineup(JSON.parse(JSON.stringify(newLineup)));

    const tf = f.tacticalFormation;
    if (Array.isArray(tf)) {
      const s = tf.join(',');
      setSelectedFormation(s);
      setOriginalFormation(s);
    } else if (typeof tf === 'string') {
      setSelectedFormation(tf);
      setOriginalFormation(tf);
    }
  }, [currentLineupData]);

  const handleFormationChange = (newFormation: string) => {
    setSelectedFormation(newFormation);
    setShowFormationDropdown(false);
    const req = getFormationRequirements(newFormation);
    if (!req) return;
    setLineup(prev => ({
      goalkeeper: prev.goalkeeper,
      defender: prev.defender.slice(0, req.defenders),
      midfield: prev.midfield.slice(0, req.midfielders),
      striker: prev.striker.slice(0, req.strikers),
    }));
  };

  const handlePlayerSelect = (player: any, position: string) => {
    const ptId = player.playerTeamId || player.id;
    const isInLineup =
      lineup.goalkeeper?.playerTeamId === ptId ||
      lineup.defender.some(p => p?.playerTeamId === ptId) ||
      lineup.midfield.some(p => p?.playerTeamId === ptId) ||
      lineup.striker.some(p => p?.playerTeamId === ptId);

    if (isInLineup) {
      toast.error('Este jugador ya está en la alineación');
      return;
    }

    setLineup(prev => {
      const next = { ...prev };
      if (position === 'goalkeeper') {
        next.goalkeeper = player;
      } else if (position === 'defender' && selectedSlot?.index !== undefined) {
        next.defender = [...prev.defender];
        next.defender[selectedSlot.index] = player;
      } else if (position === 'midfield' && selectedSlot?.index !== undefined) {
        next.midfield = [...prev.midfield];
        next.midfield[selectedSlot.index] = player;
      } else if (position === 'striker' && selectedSlot?.index !== undefined) {
        next.striker = [...prev.striker];
        next.striker[selectedSlot.index] = player;
      }
      return next;
    });
    setSelectedSlot(null);
  };

  const handlePlayerRemove = (position: string, index?: number) => {
    setLineup(prev => {
      const next = { ...prev };
      if (position === 'goalkeeper') {
        next.goalkeeper = null;
      } else if (position === 'defender' && index !== undefined) {
        next.defender = [...prev.defender];
        next.defender[index] = null as any;
      } else if (position === 'midfield' && index !== undefined) {
        next.midfield = [...prev.midfield];
        next.midfield[index] = null as any;
      } else if (position === 'striker' && index !== undefined) {
        next.striker = [...prev.striker];
        next.striker[index] = null as any;
      }
      return next;
    });
  };

  const hasChanges = useMemo(() => {
    return JSON.stringify(lineup) !== JSON.stringify(originalLineup) || selectedFormation !== originalFormation;
  }, [lineup, originalLineup, selectedFormation, originalFormation]);

  const handleSave = async () => {
    if (!selectedFormation || !userTeamId) {
      toast.error('Selecciona una formación válida');
      return;
    }
    setSaving(true);
    try {
      const formationArray = selectedFormation.split(',').map(Number);
      const lineupData = {
        goalkeeper: lineup.goalkeeper ? (lineup.goalkeeper.playerTeamId || lineup.goalkeeper.id) : null,
        defender: lineup.defender.filter(Boolean).map(p => p.playerTeamId || p.id),
        midfield: lineup.midfield.filter(Boolean).map(p => p.playerTeamId || p.id),
        striker: lineup.striker.filter(Boolean).map(p => p.playerTeamId || p.id),
        tactical_formation: formationArray,
      };
      await fantasyAPI.updateLineup(userTeamId, lineupData);
      toast.success('¡Alineación guardada!');
      queryClient.invalidateQueries({ queryKey: ['currentLineup', userTeamId] });
      setOriginalLineup(JSON.parse(JSON.stringify(lineup)));
      setOriginalFormation(selectedFormation);
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    setLineup(JSON.parse(JSON.stringify(originalLineup)));
    setSelectedFormation(originalFormation);
  };

  const req = getFormationRequirements(selectedFormation);
  const playersByPosition = useMemo(() => {
    const groups: Record<number, any[]> = { 1: [], 2: [], 3: [], 4: [] };
    allPlayers.forEach((p: any) => {
      const pos = p.positionId || p.position;
      if (pos && groups[pos]) groups[pos].push(p);
    });
    return groups;
  }, [allPlayers]);

  const renderSlot = (player: any | null, position: string, index?: number) => {
    const pm = player?.playerMaster || player;
    const img = pm?.images?.transparent?.['128x128'] || pm?.images?.transparent?.['64x64'];
    const name = pm?.nickname || pm?.name;
    const isEmpty = !player;

    return (
      <button
        key={index ?? position}
        onClick={() => {
          if (isEmpty) {
            setSelectedSlot({ position, index });
          } else {
            setSelectedPlayer({
              id: pm.id, player_master_id: pm.id, name: pm.name,
              nickname: pm.nickname, images: pm.images,
            });
            setIsPlayerModalOpen(true);
          }
        }}
        className={`relative flex flex-col items-center gap-1 group ${isEmpty ? 'opacity-60' : ''}`}
      >
        <div className="relative">
          {img ? (
            <img
              src={img}
              alt=""
              className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/60 shadow-lg group-hover:scale-110 transition-transform"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-dashed border-white/40 flex items-center justify-center">
              <span className="text-lg text-white/50">+</span>
            </div>
          )}
          {!isEmpty && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePlayerRemove(position, index); }}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          )}
        </div>
        <span className="text-[10px] font-semibold text-white drop-shadow text-center leading-tight max-w-[72px] truncate">
          {name || 'Vacío'}
        </span>
      </button>
    );
  };

  if (loadingLineup) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Mi Alineación</h1>
          </div>
          <div className="flex gap-2">
            {hasChanges && (
              <button onClick={handleRevert} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800">
                <RotateCcw className="w-3.5 h-3.5" /> Revertir
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* Formation selector */}
        <div className="relative">
          <button
            onClick={() => setShowFormationDropdown(!showFormationDropdown)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white w-full"
          >
            <span className="text-gray-500 dark:text-gray-400 text-xs">Formación:</span>
            <span className="font-semibold">{selectedFormation || '—'}</span>
            <ChevronDown className="w-4 h-4 ml-auto text-gray-400" />
          </button>
          {showFormationDropdown && (
            <div className="absolute z-20 top-full mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {formations.map((f: string) => (
                <button
                  key={f}
                  onClick={() => handleFormationChange(f)}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedFormation === f ? 'bg-indigo-50 dark:bg-indigo-900/20 font-semibold text-indigo-700 dark:text-indigo-400' : ''
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pitch */}
      <div className="bg-gradient-to-b from-green-700 to-green-900 rounded-xl p-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-white rounded-full" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-b-0 border-white rounded-b-none" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-t-0 border-white rounded-t-none" />
        </div>

        <div className="relative space-y-6 py-4">
          {/* Strikers */}
          <div className="flex justify-center gap-4">
            {Array.from({ length: req?.strikers || 0 }).map((_, i) => (
              <div key={`striker-${i}`}>
                {renderSlot(lineup.striker[i] || null, 'striker', i)}
              </div>
            ))}
          </div>
          {/* Midfielders */}
          <div className="flex justify-center gap-4">
            {Array.from({ length: req?.midfielders || 0 }).map((_, i) => (
              <div key={`midfield-${i}`}>
                {renderSlot(lineup.midfield[i] || null, 'midfield', i)}
              </div>
            ))}
          </div>
          {/* Defenders */}
          <div className="flex justify-center gap-4">
            {Array.from({ length: req?.defenders || 0 }).map((_, i) => (
              <div key={`defender-${i}`}>
                {renderSlot(lineup.defender[i] || null, 'defender', i)}
              </div>
            ))}
          </div>
          {/* Goalkeeper */}
          <div className="flex justify-center">
            {renderSlot(lineup.goalkeeper || null, 'goalkeeper')}
          </div>
        </div>
      </div>

      {/* Player selection modal */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setSelectedSlot(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl w-full max-w-lg max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Seleccionar {POS_LABELS[selectedSlot.position === 'goalkeeper' ? 1 : selectedSlot.position === 'defender' ? 2 : selectedSlot.position === 'midfield' ? 3 : 4]}
              </span>
              <button onClick={() => setSelectedSlot(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-2 space-y-1">
              {(playersByPosition[selectedSlot.position === 'goalkeeper' ? 1 : selectedSlot.position === 'defender' ? 2 : selectedSlot.position === 'midfield' ? 3 : 4] || []).map((p: any) => {
                const ptId = p.playerTeamId || p.id;
                const pm = p.playerMaster || p;
                const img = pm.images?.transparent?.['64x64'] || pm.images?.transparent?.['128x128'];
                const isInLineup =
                  lineup.goalkeeper?.playerTeamId === ptId ||
                  lineup.defender.some(x => x?.playerTeamId === ptId) ||
                  lineup.midfield.some(x => x?.playerTeamId === ptId) ||
                  lineup.striker.some(x => x?.playerTeamId === ptId);
                return (
                  <button
                    key={ptId}
                    disabled={isInLineup}
                    onClick={() => handlePlayerSelect(p, selectedSlot.position)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isInLineup ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <img src={img} alt="" className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <span className="text-xs font-medium text-gray-900 dark:text-white flex-1 text-left">
                      {pm.nickname || pm.name}
                    </span>
                    {isInLineup && <span className="text-[9px] text-gray-400">en campo</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <PlayerDetailModal
        player={selectedPlayer}
        isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedPlayer(null); }}
      />
    </div>
  );
}
