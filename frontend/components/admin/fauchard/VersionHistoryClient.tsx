'use client';

import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Layers, User, CheckCircle2, RotateCcw, Clock, TrendingUp, XCircle, Calendar,
  Search, SlidersHorizontal, X, ArrowUpNarrowWide, ArrowDownWideNarrow, Plus, Trash2,
} from 'lucide-react';
import type { ConfigVersionMeta, ConfigVersionKpis, FauchardConfigRow } from '@/lib/db/actions/fauchard';
import { getConfigVersionKpisAction, getConfigVersionFullAction } from '@/lib/db/actions/fauchard';
import { KEY_LABELS, formatFauchardValue } from '@/lib/constants/fauchardLabels';
import ActivateVersionModal from './ActivateVersionModal';

const METADATA_KEYS = new Set([
  'id', 'version', 'isActive', 'updatedBy', 'createdAt', 'updatedAt', 'changeReason',
  'nInvited', 'tProposalHours', 'qMinSelection', 'platformFee', 'nFloor',
]);

interface Props {
  versions: ConfigVersionMeta[];
  activeConfig: FauchardConfigRow & { updatedByName?: string | null; updatedAt?: Date | string };
  initialKpisCache?: Record<string, ConfigVersionKpis>;
  isSystemAdmin: boolean;
}

function pct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function extractRestoredFromVersion(reason: string | null): number | null {
  if (!reason) return null;
  const m = reason.match(/^Restauración de V(\d+):/);
  return m ? parseInt(m[1], 10) : null;
}

export default function VersionHistoryClient({ versions, activeConfig, initialKpisCache = {}, isSystemAdmin }: Props) {
  const activeVersion = versions.find((v) => v.isActive);

  const [selectedId, setSelectedId] = useState<string>(activeVersion?.id ?? versions[0]?.id ?? '');
  const [kpisCache, setKpisCache] = useState<Record<string, ConfigVersionKpis>>(initialKpisCache);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedFullRow, setSelectedFullRow] = useState<FauchardConfigRow | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);

  // Filtros de la lista izquierda
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  type KpiSortKey = 'technicianResponseRate' | 'technicianAcceptanceRate' | 'failedCasesCount' | 'avgResponseMinutes';
  type SortLevel = { key: KpiSortKey | 'version' | 'createdAt'; dir: 'asc' | 'desc' };
  const [sortLevels, setSortLevels] = useState<SortLevel[]>([]);

  const SORT_OPTIONS: { value: SortLevel['key']; label: string }[] = [
    { value: 'version', label: 'Número de versión' },
    { value: 'createdAt', label: 'Fecha de creación' },
    { value: 'technicianResponseRate', label: 'Tasa respuesta técnico' },
    { value: 'technicianAcceptanceRate', label: 'Tasa aceptación' },
    { value: 'failedCasesCount', label: 'Casos sin asignación' },
    { value: 'avgResponseMinutes', label: 'T. medio respuesta' },
  ];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);


  const filteredVersions = [...versions]
    .filter((v) => {
      if (search) {
        const q = search.replace(/^v/i, '');
        if (!String(v.version).includes(q)) return false;
      }
      if (dateFrom) {
        if (new Date(v.createdAt) < new Date(dateFrom + 'T00:00:00')) return false;
      }
      if (dateTo) {
        if (new Date(v.createdAt) > new Date(dateTo + 'T23:59:59')) return false;
      }
      return true;
    })
    .sort((a, b) => {
      for (const level of sortLevels) {
        let va: number | null = null;
        let vb: number | null = null;
        if (level.key === 'version') {
          va = a.version; vb = b.version;
        } else if (level.key === 'createdAt') {
          va = new Date(a.createdAt).getTime(); vb = new Date(b.createdAt).getTime();
        } else {
          const kpiKey = level.key as KpiSortKey;
          const ka = kpisCache[a.id];
          const kb = kpisCache[b.id];
          va = ka ? (ka[kpiKey] ?? null) : null;
          vb = kb ? (kb[kpiKey] ?? null) : null;
        }
        if (va === null && vb === null) continue;
        if (va === null) return 1;
        if (vb === null) return -1;
        const diff = level.dir === 'asc' ? va - vb : vb - va;
        if (diff !== 0) return diff;
      }
      return 0;
    });

  const hasDateFilter = dateFrom || dateTo;
  const hasActiveFilters = hasDateFilter || sortLevels.length > 0;

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;
  const isSelectedActive = selectedVersion?.isActive ?? false;

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    setSelectedFullRow(null);
    const version = versions.find((v) => v.id === id);
    if (!version || version.isActive) return;

    // Si ya tenemos los datos en caché, solo cargar el full row si falta
    const alreadyCached = !!kpisCache[id];
    if (!alreadyCached) setLoadingId(id);

    const promises: [Promise<{ success: boolean; kpis?: ConfigVersionKpis }>, Promise<{ success: boolean; config?: FauchardConfigRow }>] = [
      alreadyCached ? Promise.resolve({ success: true, kpis: kpisCache[id] }) : getConfigVersionKpisAction(id),
      getConfigVersionFullAction(id),
    ];
    const [kpisRes, fullRes] = await Promise.all(promises);
    if (kpisRes.success && kpisRes.kpis) {
      setKpisCache((prev) => ({ ...prev, [id]: kpisRes.kpis! }));
    }
    if (fullRes.success && fullRes.config) setSelectedFullRow(fullRes.config);
    setLoadingId(null);
  };

  const handleRestoreClick = async () => {
    if (!selectedFullRow) {
      setLoadingRestore(true);
      const res = await getConfigVersionFullAction(selectedId);
      setLoadingRestore(false);
      if (res.success && res.config) setSelectedFullRow(res.config);
    }
    setShowModal(true);
  };

  // Parámetros a mostrar en ParamsGrid según la versión seleccionada
  const paramsConfig: (FauchardConfigRow & Record<string, unknown>) | null = isSelectedActive
    ? (activeConfig as unknown as FauchardConfigRow & Record<string, unknown>)
    : selectedFullRow
      ? (selectedFullRow as unknown as FauchardConfigRow & Record<string, unknown>)
      : null;

  const KPI_CHIP_DEFS = [
    {
      tooltip: 'Tasa respuesta técnico — técnicos que respondieron (aceptaron o rechazaron) su asignación',
      color: 'text-primary bg-primary-hl border-primary/20',
      icon: <Clock className="w-2.5 h-2.5" />,
      getValue: (k: ConfigVersionKpis) => pct(k.technicianResponseRate),
      alertFn: (_k: ConfigVersionKpis) => false,
    },
    {
      tooltip: 'Tasa aceptación — de los que respondieron, cuántos aceptaron el trabajo',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      icon: <TrendingUp className="w-2.5 h-2.5" />,
      getValue: (k: ConfigVersionKpis) => pct(k.technicianAcceptanceRate),
      alertFn: (_k: ConfigVersionKpis) => false,
    },
    {
      tooltip: 'Casos sin asignación — casos que no pudieron asignarse a ningún técnico',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      alertColor: 'text-error bg-error-hl border-error/30',
      icon: <XCircle className="w-2.5 h-2.5" />,
      getValue: (k: ConfigVersionKpis) => String(k.failedCasesCount),
      alertFn: (k: ConfigVersionKpis) => k.failedCasesCount > 0,
    },
    {
      tooltip: 'Tiempo medio respuesta — minutos promedio entre recibir asignación y responder',
      color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
      icon: <Calendar className="w-2.5 h-2.5" />,
      getValue: (k: ConfigVersionKpis) => k.avgResponseMinutes !== null ? `${Math.round(k.avgResponseMinutes)}m` : '—',
      alertFn: (_k: ConfigVersionKpis) => false,
    },
  ] as const;

  const kpiChips = (v: ConfigVersionMeta) => {
    const cached = kpisCache[v.id] ?? null;
    const isLoading = loadingId === v.id;
    return (
      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 flex-wrap mt-1.5 pt-1.5 border-t border-divider/40">
        {KPI_CHIP_DEFS.map((def, i) => {
          const isAlert = cached ? def.alertFn(cached) : false;
          const colorClass = isAlert
            ? (def as { alertColor?: string }).alertColor ?? def.color
            : def.color;
          return (
            <span
              key={i}
              title={def.tooltip}
              className={`flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-md border ${colorClass}`}
            >
              {isLoading ? (
                <span className="inline-block w-5 h-1.5 bg-surface rounded animate-pulse" />
              ) : (
                <>{def.icon}{cached ? def.getValue(cached) : '—'}</>
              )}
            </span>
          );
        })}
      </div>
    );
  };

  const selectedKpis = isSelectedActive ? null : (kpisCache[selectedId] ?? null);
  const selectedKpisLoading = loadingId === selectedId;

  const kpiHeaderCards = [
    {
      label: 'Tasa respuesta técnico',
      value: selectedKpis ? pct(selectedKpis.technicianResponseRate) : null,
      icon: <Clock className="w-3.5 h-3.5" />,
      iconColor: 'text-primary',
      cardColor: 'bg-primary-hl border-primary/20',
      valueColor: 'text-primary',
    },
    {
      label: 'Tasa aceptación',
      value: selectedKpis ? pct(selectedKpis.technicianAcceptanceRate) : null,
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      iconColor: 'text-emerald-400',
      cardColor: 'bg-emerald-500/10 border-emerald-500/20',
      valueColor: 'text-emerald-400',
    },
    {
      label: 'Sin asignación',
      value: selectedKpis ? String(selectedKpis.failedCasesCount) : null,
      icon: <XCircle className="w-3.5 h-3.5" />,
      iconColor: selectedKpis && selectedKpis.failedCasesCount > 0 ? 'text-error' : 'text-amber-400',
      cardColor: selectedKpis && selectedKpis.failedCasesCount > 0 ? 'bg-error-hl border-error/30' : 'bg-amber-500/10 border-amber-500/20',
      valueColor: selectedKpis && selectedKpis.failedCasesCount > 0 ? 'text-error' : 'text-amber-400',
      alert: selectedKpis ? selectedKpis.failedCasesCount > 0 : false,
    },
    {
      label: 'T. medio respuesta',
      value: selectedKpis
        ? (selectedKpis.avgResponseMinutes !== null ? `${Math.round(selectedKpis.avgResponseMinutes)}m` : '—')
        : null,
      icon: <Calendar className="w-3.5 h-3.5" />,
      iconColor: 'text-violet-400',
      cardColor: 'bg-violet-500/10 border-violet-500/20',
      valueColor: 'text-violet-400',
    },
  ];

  return (
    <>
      <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-divider min-h-[500px]">

        {/* ── Columna izquierda: lista de versiones ─────────────────── */}
        <aside className="lg:w-72 xl:w-80 shrink-0 flex flex-col">

          {/* Cabecera con filtros */}
          <div className="p-3 border-b border-divider space-y-2">
            {/* Título + botón filtro */}
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted flex-1">Versiones del motor</span>
              <div className="relative" ref={filterPanelRef}>
                <button
                  onClick={() => setShowFilterPanel((s) => !s)}
                  title="Filtrar y ordenar"
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-bold transition-colors ${
                    hasActiveFilters
                      ? 'bg-primary-hl border-primary/30 text-primary'
                      : 'bg-surface-2 border-divider text-muted hover:text-foreground'
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  {hasActiveFilters && (
                    <span className="text-[8px] font-black">
                      {sortLevels.length + (hasDateFilter ? 1 : 0)}
                    </span>
                  )}
                </button>

                {/* Popover de filtros y ordenamiento */}
                {showFilterPanel && (
                  <div className="absolute top-full right-0 mt-1 z-50 w-72 bg-surface border border-divider rounded-2xl shadow-2xl p-4 space-y-4">

                    {/* Sección: Fecha */}
                    <div className="space-y-2">
                      <p className="text-[8px] font-black uppercase tracking-wider text-muted">Rango de fecha</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[8px] font-bold uppercase tracking-wider text-faint block mb-1">Desde</label>
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full text-[10px] px-2 py-1.5 rounded-xl bg-surface-2 border border-divider text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] font-bold uppercase tracking-wider text-faint block mb-1">Hasta</label>
                          <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full text-[10px] px-2 py-1.5 rounded-xl bg-surface-2 border border-divider text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          />
                        </div>
                      </div>
                      {hasDateFilter && (
                        <button
                          onClick={() => { setDateFrom(''); setDateTo(''); }}
                          className="text-[8px] text-muted hover:text-error transition-colors"
                        >
                          Limpiar fechas
                        </button>
                      )}
                    </div>

                    {/* Separador */}
                    <div className="border-t border-divider" />

                    {/* Sección: Ordenamiento */}
                    <div className="space-y-2">
                      <p className="text-[8px] font-black uppercase tracking-wider text-muted">Ordenar por</p>
                      {sortLevels.map((level, i) => {
                        const usedKeys = sortLevels.map((l, li) => li !== i ? l.key : null).filter(Boolean);
                        return (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="text-[8px] font-black text-faint w-4 text-center shrink-0">{i + 1}</span>
                            <select
                              value={level.key}
                              onChange={(e) => setSortLevels((prev) => prev.map((l, li) => li === i ? { ...l, key: e.target.value as SortLevel['key'] } : l))}
                              className="flex-1 text-[9px] px-2 py-1 rounded-lg bg-surface-2 border border-divider text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 min-w-0"
                            >
                              {SORT_OPTIONS.filter((o) => !usedKeys.includes(o.value)).map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => setSortLevels((prev) => prev.map((l, li) => li === i ? { ...l, dir: l.dir === 'asc' ? 'desc' : 'asc' } : l))}
                              title={level.dir === 'asc' ? 'Ascendente' : 'Descendente'}
                              className="shrink-0 p-1 rounded-lg bg-surface-2 border border-divider text-muted hover:text-foreground transition-colors"
                            >
                              {level.dir === 'asc'
                                ? <ArrowUpNarrowWide className="w-3 h-3" />
                                : <ArrowDownWideNarrow className="w-3 h-3" />
                              }
                            </button>
                            <button
                              onClick={() => setSortLevels((prev) => prev.filter((_, li) => li !== i))}
                              className="shrink-0 p-1 rounded-lg text-muted hover:text-error transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                      {sortLevels.length < SORT_OPTIONS.length && (
                        <button
                          onClick={() => {
                            const usedKeys = sortLevels.map((l) => l.key);
                            const next = SORT_OPTIONS.find((o) => !usedKeys.includes(o.value));
                            if (next) setSortLevels((prev) => [...prev, { key: next.value, dir: 'desc' }]);
                          }}
                          className="flex items-center gap-1.5 text-[9px] font-bold text-primary hover:text-primary/80 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Añadir criterio
                        </button>
                      )}
                      {sortLevels.length > 0 && (
                        <button
                          onClick={() => setSortLevels([])}
                          className="text-[8px] text-muted hover:text-error transition-colors"
                        >
                          Limpiar orden
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Búsqueda por versión */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar V38, V40…"
                className="w-full pl-7 pr-3 py-1.5 text-[10px] rounded-xl bg-surface-2 border border-divider text-foreground placeholder:text-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {filteredVersions.length !== versions.length && (
              <p className="text-[8px] text-muted text-center">
                {filteredVersions.length} de {versions.length} versiones
              </p>
            )}
          </div>

          {/* Lista scrollable */}
          <div className="overflow-y-auto flex-1 max-h-[60vh] p-2 space-y-1">
            {filteredVersions.map((v) => {
              const isSelected = v.id === selectedId;
              const restoredFrom = extractRestoredFromVersion(v.changeReason);
              const searchQ = search.replace(/^v/i, '');
              const highlightVersion = search && String(v.version).includes(searchQ);

              return (
                <button
                  key={v.id}
                  onClick={() => handleSelect(v.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40 ${
                    isSelected
                      ? 'bg-primary-hl border-primary/40 ring-1 ring-primary/20'
                      : 'border-transparent hover:bg-white/[0.04]'
                  } ${highlightVersion ? 'ring-1 ring-primary/30' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded-lg ${
                        v.isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : highlightVersion
                            ? 'bg-primary-hl text-primary border border-primary/20'
                            : 'bg-surface-2 text-muted border border-divider'
                      }`}>
                        V{v.version}
                      </span>
                      {restoredFrom !== null && (
                        <span className="flex items-center gap-0.5 text-[8px] font-bold text-primary bg-primary-hl border border-primary/20 px-1.5 py-0.5 rounded-lg">
                          <RotateCcw className="w-2.5 h-2.5" />
                          V{restoredFrom}
                        </span>
                      )}
                    </div>
                    {v.isActive && (
                      <span className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Activa
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-faint">
                    {format(new Date(v.createdAt), 'dd MMM yyyy, HH:mm', { locale: es })}
                  </p>
                  {v.updatedByName && (
                    <p className="text-[9px] text-faint flex items-center gap-1 mt-0.5">
                      <User className="w-2.5 h-2.5" />
                      {v.updatedByName}
                    </p>
                  )}
                  {v.changeReason && (
                    <p className="text-[9px] text-faint/70 mt-0.5 line-clamp-2">
                      {v.changeReason}
                    </p>
                  )}
                  {!v.isActive && kpiChips(v)}
                </button>
              );
            })}
            {filteredVersions.length === 0 && (
              <p className="text-xs text-faint italic px-2 py-4 text-center">Sin versiones para los filtros aplicados.</p>
            )}
          </div>
        </aside>

        {/* ── Panel derecho ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">

          {!selectedVersion && (
            <p className="p-6 text-faint text-sm italic">Selecciona una versión para ver sus detalles.</p>
          )}

          {selectedVersion && (
            <>
              {/* Cabecera sticky con KPIs */}
              <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur-md border-b border-divider px-5 py-3">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    {isSelectedActive
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      : null
                    }
                    <div>
                      <p className="text-sm font-black text-foreground uppercase tracking-tight">
                        V{selectedVersion.version}
                        {isSelectedActive && <span className="ml-2 text-emerald-400 text-[10px] font-bold normal-case">Versión activa</span>}
                      </p>
                      <p className="text-[10px] text-faint">
                        {format(new Date(selectedVersion.createdAt), 'dd MMM yyyy, HH:mm', { locale: es })}
                        {selectedVersion.updatedByName ? ` · ${selectedVersion.updatedByName}` : ''}
                      </p>
                    </div>
                  </div>
                  {!isSelectedActive && isSystemAdmin && (
                    <button
                      onClick={handleRestoreClick}
                      disabled={loadingRestore}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-hl border border-primary/20 text-primary text-xs font-bold uppercase tracking-tight transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {loadingRestore ? 'Cargando…' : 'Restaurar versión'}
                    </button>
                  )}
                </div>

                {/* 4 KPI cards en la cabecera */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {kpiHeaderCards.map((card, i) => (
                    <div key={card.label} title={KPI_CHIP_DEFS[i].tooltip} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${card.cardColor}`}>
                      <div className={`shrink-0 ${card.iconColor}`}>
                        {card.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[7px] font-bold uppercase tracking-wider text-faint truncate">{card.label}</p>
                        {selectedKpisLoading && !isSelectedActive ? (
                          <div className="h-4 w-10 bg-surface-2 rounded animate-pulse mt-0.5" />
                        ) : (
                          <p className={`text-sm font-black leading-tight ${card.valueColor}`}>
                            {isSelectedActive ? <span className="text-faint text-xs font-normal">activa</span> : (card.value ?? '—')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cuerpo scrollable: grilla de parámetros */}
              <div className="flex-1 overflow-y-auto p-5">
                {selectedVersion.changeReason && (
                  <p className="text-[10px] text-muted italic mb-4 pb-4 border-b border-divider/50">
                    {selectedVersion.changeReason}
                  </p>
                )}

                {paramsConfig ? (
                  <ParamsGrid config={paramsConfig} />
                ) : (
                  selectedKpisLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[...Array(12)].map((_, i) => (
                        <div key={i} className="h-9 bg-surface/40 border border-divider rounded-xl animate-pulse" />
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showModal && selectedVersion && (
        <ActivateVersionModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          sourceVersion={selectedVersion}
          sourceFullRow={selectedFullRow!}
          activeConfig={activeConfig}
          nextVersion={activeConfig.version + 1}
          kpisSource={selectedKpis}
        />
      )}
    </>
  );
}

function ParamsGrid({ config }: { config: FauchardConfigRow & Record<string, unknown> }) {
  const rows = Object.entries(config)
    .filter(([k]) => !METADATA_KEYS.has(k) && KEY_LABELS[k])
    .map(([k, v]) => ({ key: k, label: KEY_LABELS[k], value: formatFauchardValue(k, v) }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {rows.map((r) => (
        <div key={r.key} className="flex justify-between items-center px-3 py-2 bg-surface/40 border border-divider rounded-xl">
          <span className="text-[10px] text-muted">{r.label}</span>
          <span className="text-xs font-mono font-bold text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
