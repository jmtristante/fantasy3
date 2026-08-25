import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Swords, Save, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { fantasyAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import PlayerDetailModal from '../components/Common/PlayerDetailModal';
import { usePreciosActuales } from '../contexts/PreciosActualesContext';
import toast from 'react-hot-toast';

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  return [];
}

const POS_CONFIG: Record<number, { label: string; color: string; headerColor: string }> = {
  1: { label: 'Porteros', color: 'bg-yellow-500', headerColor: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800' },
  2: { label: 'Defensas', color: 'bg-blue-500', headerColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  3: { label: 'Centrocampistas', color: 'bg-green-500', headerColor: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' },
  4: { label: 'Delanteros', color: 'bg-red-500', headerColor: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' },
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

function getFormationRequirements(formation: string) {
  const parts = formation.split(',').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return { defenders: parts[0], midfielders: parts[1], strikers: parts[2] };
}

function isPlayerInLineup(lineup: LineupState, ptId: number): boolean {
  return (
    lineup.goalkeeper?.playerTeamId === ptId ||
    lineup.defender.some(p => p?.playerTeamId === ptId) ||
    lineup.midfield.some(p => p?.playerTeamId === ptId) ||
    lineup.striker.some(p => p?.playerTeamId === ptId)
  );
}

export default function MiAlineacion() {
  const leagueId = useAuthStore((s) => s.leagueId);
  const laligaUser = useAuthStore((s) => s.laligaUser);
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
  const [expandedPositions, setExpandedPositions] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true });
  const { scrapingPlayers, mapeo } = usePreciosActuales();

  const { data: standings } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId!),
    enabled: !!leagueId,
    staleTime: 60_000,
  });

  const userTeamId = useMemo(() => {
    if (!standings || !laligaUser) return null;
    const teams = extractArray(standings);
    const found = teams.find((t: any) => {
      const uid = t.userId || t.team?.manager?.id || t.team?.userId;
      return uid && laligaUser.userId && String(uid) === String(laligaUser.userId);
    });
    return found ? String(found.id || found.team?.id) : null;
  }, [standings, laligaUser]);

  const { data: currentWeekData, isLoading: loadingWeek } = useQuery({
    queryKey: ['currentWeek'],
    queryFn: () => fantasyAPI.getCurrentWeek(),
  });
  const currentWeek = currentWeekData?.weekNumber ?? currentWeekData?.data?.weekNumber ?? 1;

  const { data: nextWeekCalendar } = useQuery({
    queryKey: ['matchday', currentWeek + 1],
    queryFn: () => fantasyAPI.getMatchday(currentWeek + 1),
    staleTime: 60_000,
  });

  const { data: teamsMasterData } = useQuery({
    queryKey: ['teamsMaster'],
    queryFn: () => fantasyAPI.getTeamsMaster(),
    staleTime: 5 * 60_000,
  });

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    extractArray(teamsMasterData).forEach((t: any) => {
      map.set(String(t.id), t.shortName || t.name);
    });
    return map;
  }, [teamsMasterData]);

  const teamBadgeMap = useMemo(() => {
    const map = new Map<string, string>();
    extractArray(teamsMasterData).forEach((t: any) => {
      if (t.badgeColor) map.set(String(t.id), t.badgeColor);
    });
    return map;
  }, [teamsMasterData]);

  const nextOpponents = useMemo(() => {
    const matches = extractArray(nextWeekCalendar);
    const nameMap = new Map<string, string>();
    const idMap = new Map<string, string>();
    matches.forEach((m: any) => {
      const localId = String(m.local?.id || m.localId);
      const visitorId = String(m.visitor?.id || m.visitorId);
      nameMap.set(localId, teamNameMap.get(visitorId) || '?');
      nameMap.set(visitorId, teamNameMap.get(localId) || '?');
      idMap.set(localId, visitorId);
      idMap.set(visitorId, localId);
    });
    return { names: nameMap, ids: idMap };
  }, [nextWeekCalendar, teamNameMap]);

  const { data: allPlayersData } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 300_000,
  });

  const playerTeamMap = useMemo(() => {
    const map = new Map<string, string>();
    extractArray(allPlayersData).forEach((p: any) => {
      const teamId = String(p.teamId || p.team?.id || '');
      if (teamId) map.set(String(p.id), teamId);
    });
    return map;
  }, [allPlayersData]);

  const { data: currentLineupData, isLoading: loadingLineup } = useQuery({
    queryKey: ['currentLineup', userTeamId],
    queryFn: () => fantasyAPI.getCurrentLineup(userTeamId!),
    enabled: !!userTeamId,
    staleTime: 0,
  });

  const { data: teamData } = useQuery({
    queryKey: ['teamData', leagueId, userTeamId],
    queryFn: () => fantasyAPI.getTeamData(leagueId!, userTeamId!),
    enabled: !!leagueId && !!userTeamId,
  });

  const { data: formationsData } = useQuery({
    queryKey: ['freeFormations'],
    queryFn: () => fantasyAPI.getFreeFormations(),
    staleTime: 60 * 60 * 1000,
  });

  const teamPlayers = useMemo(() => {
    if (!teamData) return [];
    const data = teamData?.data || teamData;
    return data?.players || [];
  }, [teamData]);

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
    if (isPlayerInLineup(lineup, ptId)) {
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
      if (position === 'goalkeeper') next.goalkeeper = null;
      else if (position === 'defender' && index !== undefined) { next.defender = [...prev.defender]; next.defender[index] = null as any; }
      else if (position === 'midfield' && index !== undefined) { next.midfield = [...prev.midfield]; next.midfield[index] = null as any; }
      else if (position === 'striker' && index !== undefined) { next.striker = [...prev.striker]; next.striker[index] = null as any; }
      return next;
    });
  };

  const hasChanges = useMemo(() => {
    return JSON.stringify(lineup) !== JSON.stringify(originalLineup) || selectedFormation !== originalFormation;
  }, [lineup, originalLineup, selectedFormation, originalFormation]);

  const handleSave = async () => {
    if (!selectedFormation || !userTeamId) { toast.error('Selecciona una formación válida'); return; }
    setSaving(true);
    try {
      const lineupData = {
        goalkeeper: lineup.goalkeeper ? (lineup.goalkeeper.playerTeamId || lineup.goalkeeper.id) : null,
        defender: lineup.defender.filter(Boolean).map(p => p.playerTeamId || p.id),
        midfield: lineup.midfield.filter(Boolean).map(p => p.playerTeamId || p.id),
        striker: lineup.striker.filter(Boolean).map(p => p.playerTeamId || p.id),
        tactical_formation: selectedFormation.split(',').map(Number),
      };
      await fantasyAPI.updateLineup(userTeamId, lineupData);
      toast.success('¡Alineación guardada!');
      queryClient.invalidateQueries({ queryKey: ['currentLineup', userTeamId] });
      setOriginalLineup(JSON.parse(JSON.stringify(lineup)));
      setOriginalFormation(selectedFormation);
    } catch (e: any) { toast.error(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleRevert = () => {
    setLineup(JSON.parse(JSON.stringify(originalLineup)));
    setSelectedFormation(originalFormation);
  };

  const req = getFormationRequirements(selectedFormation);

  const togglePosition = (posId: number) => {
    setExpandedPositions(prev => ({ ...prev, [posId]: !prev[posId] }));
  };

  const renderSlot = (player: any | null, position: string, index?: number) => {
    const pm = player?.playerMaster || player;
    const img = pm?.images?.transparent?.['256x256'] || pm?.images?.transparent?.['128x128'] || pm?.images?.transparent?.['64x64'] || pm?.image;
    const name = pm?.nickname || pm?.name;
    const isEmpty = !player;
    const playerTeamId = playerTeamMap.get(String(pm?.id)) || '';
    const badge = teamBadgeMap.get(playerTeamId);

    return (
      <div
        key={index ?? position}
        className={`relative flex flex-col items-center gap-1 group ${isEmpty ? 'opacity-60' : ''}`}
      >
        <div
          className="relative cursor-pointer"
          onClick={() => {
            if (isEmpty) setSelectedSlot({ position, index });
            else {
              setSelectedPlayer({ id: pm.id, player_master_id: pm.id, name: pm.name, nickname: pm.nickname, images: pm.images });
              setIsPlayerModalOpen(true);
            }
          }}
        >
          {img ? (
            <img src={img} alt="" className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/60 shadow-lg group-hover:scale-110 transition-transform"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-dashed border-white/40 flex items-center justify-center">
              <span className="text-lg text-white/50">+</span>
            </div>
          )}
          {!isEmpty && badge && (
            <img src={badge} alt="" className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white shadow object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          {!isEmpty && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePlayerRemove(position, index); }}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >✕</button>
          )}
        </div>
        <span className="text-[10px] font-semibold text-white drop-shadow text-center leading-tight max-w-[72px] truncate">
          {name || 'Vacío'}
        </span>
      </div>
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
            <button onClick={handleSave} disabled={!hasChanges || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setShowFormationDropdown(!showFormationDropdown)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white w-full">
            <span className="text-gray-500 dark:text-gray-400 text-xs">Formación:</span>
            <span className="font-semibold">{selectedFormation || '—'}</span>
            <ChevronDown className="w-4 h-4 ml-auto text-gray-400" />
          </button>
          {showFormationDropdown && (
            <div className="absolute z-20 top-full mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {formations.map((f: string) => (
                <button key={f} onClick={() => handleFormationChange(f)}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 ${selectedFormation === f ? 'bg-indigo-50 dark:bg-indigo-900/20 font-semibold text-indigo-700 dark:text-indigo-400' : ''}`}>
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
          <div className="flex justify-center gap-4">
            {Array.from({ length: req?.strikers || 0 }).map((_, i) => renderSlot(lineup.striker[i] || null, 'striker', i))}
          </div>
          <div className="flex justify-center gap-4">
            {Array.from({ length: req?.midfielders || 0 }).map((_, i) => renderSlot(lineup.midfield[i] || null, 'midfield', i))}
          </div>
          <div className="flex justify-center gap-4">
            {Array.from({ length: req?.defenders || 0 }).map((_, i) => renderSlot(lineup.defender[i] || null, 'defender', i))}
          </div>
          <div className="flex justify-center">
            {renderSlot(lineup.goalkeeper || null, 'goalkeeper')}
          </div>
        </div>
      </div>

      {/* Player bench by position */}
      <div className="space-y-3">
        {[4, 3, 2, 1].map((posId) => {
          const cfg = POS_CONFIG[posId];
          const players = teamPlayers.filter((pt: any) => pt.playerMaster?.positionId === posId);
          const inLineupCount = players.filter((pt: any) => isPlayerInLineup(lineup, pt.playerTeamId || pt.id)).length;
          const expanded = expandedPositions[posId];
          return (
            <div key={posId} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button onClick={() => togglePosition(posId)}
                className={`w-full px-3 py-2 flex items-center gap-2 ${cfg.headerColor}`}>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.color} text-white`}>{posId === 1 ? 'PO' : posId === 2 ? 'DF' : posId === 3 ? 'MC' : 'DL'}</span>
                <span className="text-xs font-semibold">{cfg.label}</span>
                <span className="text-[10px] opacity-70 ml-1">{inLineupCount}/{players.length}</span>
                <span className="ml-auto">{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
              </button>
              {expanded && (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {players.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-gray-400">Sin jugadores</div>
                  ) : players.map((pt: any) => {
                    const pm = pt.playerMaster;
                    if (!pm) return null;
                    const ptId = pt.playerTeamId || pt.id;
                    const inLineup = isPlayerInLineup(lineup, ptId);
                    const img = pm?.images?.transparent?.['256x256'] || pm?.images?.transparent?.['128x128'] || pm?.images?.transparent?.['64x64'] || pm?.image;
                    const jugadorId = mapeo.get(Number(pm.id));
                    const probabilidad = jugadorId != null ? scrapingPlayers.get(jugadorId)?.probabilidad ?? null : null;
                    const teamId = playerTeamMap.get(String(pm.id)) || String(pm.teamId || pt.teamId || pt.team?.id || '');
                    const nextOppName = nextOpponents.names.get(teamId);
                    const nextOppId = nextOpponents.ids.get(teamId);
                    const nextOppBadge = nextOppId ? teamBadgeMap.get(nextOppId) : null;
                    return (
                      <button key={ptId}
                        onClick={() => {
                          if (inLineup) return;
                          const posMap: Record<number, string> = { 1: 'goalkeeper', 2: 'defender', 3: 'midfield', 4: 'striker' };
                          const posName = posMap[posId];
                          const req2 = getFormationRequirements(selectedFormation);
                          if (!req2) return;
                          const count = posId === 1 ? 1 : posId === 2 ? req2.defenders : posId === 3 ? req2.midfielders : req2.strikers;
                          const arr = posId === 1 ? [] : posId === 2 ? lineup.defender : posId === 3 ? lineup.midfield : lineup.striker;
                          const emptyIdx = arr.findIndex((s: any, i: number) => i < count && !s);
                          setSelectedSlot({ position: posName, index: emptyIdx >= 0 ? emptyIdx : undefined });
                          handlePlayerSelect(pt, posName);
                        }}
                        disabled={inLineup}
                        className={`w-full flex items-center gap-3 px-3 py-2 transition-colors ${inLineup ? 'bg-indigo-50 dark:bg-indigo-900/10 opacity-60' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                        <img src={img} alt="" className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-xs font-medium text-gray-900 dark:text-white truncate">{pm.nickname || pm.name}</div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500">
                            {probabilidad != null && <span className={`font-semibold ${probabilidad >= 80 ? 'text-green-600 dark:text-green-400' : probabilidad >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500'}`}>{probabilidad}%</span>}
                            {nextOppName && (
                              <span className="flex items-center gap-1">
                                {nextOppBadge && <img src={nextOppBadge} alt="" className="w-3 h-3 rounded-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                                vs {nextOppName}
                              </span>
                            )}
                          </div>
                        </div>
                        {inLineup && <span className="text-[9px] font-semibold bg-indigo-500 text-white px-1.5 py-0.5 rounded">En campo</span>}
                        {!inLineup && <span className="text-[10px] text-gray-400">{pm.points || 0} pts</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Player selection modal */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setSelectedSlot(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl w-full max-w-lg max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Seleccionar {POS_CONFIG[selectedSlot.position === 'goalkeeper' ? 1 : selectedSlot.position === 'defender' ? 2 : selectedSlot.position === 'midfield' ? 3 : 4].label}
              </span>
              <button onClick={() => setSelectedSlot(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-2 space-y-1">
              {teamPlayers
                .filter((pt: any) => {
                  const posId = selectedSlot.position === 'goalkeeper' ? 1 : selectedSlot.position === 'defender' ? 2 : selectedSlot.position === 'midfield' ? 3 : 4;
                  return pt.playerMaster?.positionId === posId;
                })
                .map((pt: any) => {
                  const ptId = pt.playerTeamId || pt.id;
                  const pm = pt.playerMaster;
                  const img = pm?.images?.transparent?.['256x256'] || pm?.images?.transparent?.['128x128'] || pm?.images?.transparent?.['64x64'] || pm?.image;
                  const inLineup = isPlayerInLineup(lineup, ptId);
                  return (
                    <button key={ptId} disabled={inLineup}
                      onClick={() => handlePlayerSelect(pt, selectedSlot.position)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${inLineup ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <img src={img} alt="" className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                      <span className="text-xs font-medium text-gray-900 dark:text-white flex-1 text-left">{pm?.nickname || pm?.name}</span>
                      {inLineup && <span className="text-[9px] text-gray-400">en campo</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <PlayerDetailModal player={selectedPlayer} isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedPlayer(null); }} />
    </div>
  );
}
