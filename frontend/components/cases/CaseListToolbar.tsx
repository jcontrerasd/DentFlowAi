'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Search, Filter, X } from 'lucide-react';
import CaseListFiltersModal from '@/components/cases/CaseListFiltersModal';
import {
  countActiveCaseListFilters,
  caseStatusFilterLabel,
  normalizeSearchQuery,
  techKpiFilterLabel,
  withoutTechListFacetFilters,
  type CaseListQueryFilters,
  type TechListPreset,
} from '@/lib/cases/caseListFilters';
import type { TechKpiId } from '@/lib/dashboard/classifyCaseForDashboardKpi';
import { TECH_INVITATION_STATUS_OPTIONS } from '@/lib/cases/caseListFilters';

const TECH_PRESET_LABELS: Record<TechListPreset, string> = {
  nuevas: 'Nuevas',
  cotizaciones: 'Mis cotizaciones',
  progreso: 'En progreso',
};

type CaseListToolbarProps = {
  role: 'dentista' | 'tecnico';
  filters: CaseListQueryFilters;
  onFiltersChange: (f: CaseListQueryFilters) => void;
  /** Texto inmediato del buscador (desacoplado de URL debounced). */
  searchValue?: string;
  onSearchChange?: (q: string) => void;
  total: number | null;
  loading?: boolean;
  compact?: boolean;
};

export default function CaseListToolbar({
  role,
  filters,
  onFiltersChange,
  searchValue,
  onSearchChange,
  total,
  loading,
  compact = false,
}: CaseListToolbarProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const activeCount = countActiveCaseListFilters(filters);
  const isTech = role === 'tecnico';

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    const activeQ = normalizeSearchQuery(searchValue ?? filters.q);
    if (activeQ.length > 0) {
      chips.push({
        key: 'q',
        label: `Búsqueda: ${activeQ}`,
        clear: () => {
          if (onSearchChange) onSearchChange('');
          else onFiltersChange({ ...filters, q: '' });
        },
      });
    }

    if (filters.priorities?.length) {
      for (const p of filters.priorities) {
        chips.push({
          key: `p-${p}`,
          label: `Prioridad ${p}`,
          clear: () =>
            onFiltersChange({
              ...filters,
              priorities: filters.priorities!.filter((x) => x !== p),
              techPreset: null,
            }),
        });
      }
    }

    if (isTech && filters.techKpiStatuses?.length) {
      for (const kpi of filters.techKpiStatuses) {
        chips.push({
          key: `kpi-${kpi}`,
          label: techKpiFilterLabel(kpi as TechKpiId),
          clear: () =>
            onFiltersChange({
              ...filters,
              techKpiStatuses: filters.techKpiStatuses!.filter((x) => x !== kpi),
              techPreset: null,
            }),
        });
      }
    }

    if (!isTech && filters.caseStatuses?.length) {
      for (const s of filters.caseStatuses) {
        chips.push({
          key: `s-${s}`,
          label: caseStatusFilterLabel(s),
          clear: () =>
            onFiltersChange({
              ...filters,
              caseStatuses: filters.caseStatuses!.filter((x) => x !== s),
              techPreset: null,
            }),
        });
      }
    }

    if (filters.invitationStatuses?.length) {
      for (const s of filters.invitationStatuses) {
        const label = TECH_INVITATION_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
        chips.push({
          key: `i-${s}`,
          label,
          clear: () =>
            onFiltersChange({
              ...filters,
              invitationStatuses: filters.invitationStatuses!.filter((x) => x !== s),
              techPreset: null,
            }),
        });
      }
    }

    if (filters.techPreset) {
      chips.push({
        key: 'preset',
        label: TECH_PRESET_LABELS[filters.techPreset] ?? filters.techPreset,
        clear: () => onFiltersChange(withoutTechListFacetFilters({ ...filters, techPreset: null })),
      });
    }

    if (filters.dateStart || filters.dateEnd) {
      chips.push({
        key: 'dates',
        label: 'Fecha publicación',
        clear: () => onFiltersChange({ ...filters, dateStart: '', dateEnd: '' }),
      });
    }

    if (filters.offerDateStart || filters.offerDateEnd) {
      chips.push({
        key: 'offer',
        label: 'Fecha invitación',
        clear: () => onFiltersChange({ ...filters, offerDateStart: '', offerDateEnd: '' }),
      });
    }

    if (filters.sortOrder === 'old') {
      chips.push({
        key: 'sort',
        label: 'Más antiguos',
        clear: () => onFiltersChange({ ...filters, sortOrder: 'recent' }),
      });
    }

    return chips;
  }, [filters, onFiltersChange, onSearchChange, searchValue]);

  return (
    <div className={`space-y-3 ${compact ? '' : 'w-full'}`}>
      <div className={`flex flex-col md:flex-row gap-3 ${compact ? '' : 'w-full'}`}>
        <div className={`relative ${compact ? 'flex-1 min-w-[140px]' : 'flex-1'}`}>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            placeholder={
              isTech ? 'Buscar por clínica, caso, PAC o ID…' : 'Buscar por paciente, nombre o ID…'
            }
            value={searchValue ?? filters.q ?? ''}
            onChange={(e) => {
              const q = e.target.value;
              if (onSearchChange) onSearchChange(q);
              else onFiltersChange({ ...filters, q });
            }}
            className="w-full bg-slate-900 border border-slate-800/60 rounded-xl pl-11 pr-4 py-3 text-sm text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-600"
            aria-label="Buscar casos"
          />
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl border transition-colors duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40 ${
            activeCount > 0
              ? 'bg-teal-500/10 border-teal-500/50 text-teal-400 hover:bg-teal-500/15'
              : 'bg-slate-900 border-slate-800/60 text-slate-400 hover:bg-white/5 hover:text-white hover:border-white/20'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          {!compact && (
            <span className="text-[10px] font-black uppercase tracking-widest">Filtros avanzados</span>
          )}
          {activeCount > 0 && (
            <span className="min-w-[18px] h-[18px] rounded-full bg-teal-500 text-white text-[9px] font-black flex items-center justify-center px-1">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {(activeChips.length > 0 || (total != null && !compact)) && (
        <div className="flex flex-wrap items-center gap-2">
          {total != null && (
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mr-2" aria-live="polite">
              {loading ? 'Buscando…' : `${total} ${total === 1 ? 'caso' : 'casos'}`}
            </p>
          )}
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-[9px] font-bold uppercase tracking-wide text-slate-300 hover:border-rose-500/40 hover:text-rose-300 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
            >
              {chip.label}
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <CaseListFiltersModal
            role={role}
            currentFilters={filters}
            onClose={() => setModalOpen(false)}
            onApply={(f) => {
              onFiltersChange(f);
              setModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
