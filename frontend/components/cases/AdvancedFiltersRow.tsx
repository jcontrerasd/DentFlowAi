'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import CaseListToolbar from '@/components/cases/CaseListToolbar';
import CaseListFiltersModal from '@/components/cases/CaseListFiltersModal';
import { Filter } from 'lucide-react';
import {
  countActiveCaseListFilters,
  DEFAULT_CASE_LIST_FILTERS,
  expandTechPreset,
  normalizeFiltersForRole,
  type CaseListQueryFilters,
} from '@/lib/cases/caseListFilters';
import { serializeCaseListFilters } from '@/lib/cases/urlCaseListFilters';

/** @deprecated Use CaseListQueryFilters — alias para compatibilidad. */
export type FilterOptions = CaseListQueryFilters;

export type FilterContext = 'DASHBOARD' | 'MARKETPLACE' | 'MY_CASES' | 'MY_BIDS';

interface AdvancedFiltersRowProps {
  context: FilterContext;
  role: 'dentista' | 'tecnico';
  onFilterChange: (filters: CaseListQueryFilters) => void;
  initialFilters?: Partial<CaseListQueryFilters>;
}

export default function AdvancedFiltersRow({
  context,
  role,
  onFilterChange,
  initialFilters,
}: AdvancedFiltersRowProps) {
  const storageKey = `df_filters_${context.toLowerCase()}_${role}`;
  const [filters, setFilters] = useState<CaseListQueryFilters>(DEFAULT_CASE_LIST_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    let merged = { ...DEFAULT_CASE_LIST_FILTERS, ...initialFilters };
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as CaseListQueryFilters;
        merged = { ...DEFAULT_CASE_LIST_FILTERS, ...parsed, ...initialFilters };
      } catch {
        /* ignore */
      }
    }
    merged = normalizeFiltersForRole(role, expandTechPreset(merged));
    setFilters(merged);
    const parentKey = serializeCaseListFilters({
      ...DEFAULT_CASE_LIST_FILTERS,
      ...initialFilters,
    });
    const mergedKey = serializeCaseListFilters(merged);
    if (mergedKey !== parentKey) {
      onFilterChange(merged);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydrate once
  }, []);

  const persist = (next: CaseListQueryFilters) => {
    const normalized = normalizeFiltersForRole(role, expandTechPreset(next));
    setFilters(normalized);
    onFilterChange(normalized);
    if (hydrated) {
      localStorage.setItem(storageKey, JSON.stringify(normalized));
    }
  };

  if (context === 'MY_CASES') {
    return null;
  }

  if (context === 'DASHBOARD') {
    const activeCount = countActiveCaseListFilters(filters);
    return (
      <>
        <div className="inline-flex items-center gap-2">
          <input
            type="search"
            placeholder={role === 'dentista' ? 'Buscar…' : 'Buscar…'}
            value={filters.q ?? ''}
            onChange={(e) => persist({ ...filters, q: e.target.value })}
            className="w-[120px] sm:w-[160px] bg-surface border border-divider rounded-lg px-3 py-1.5 text-[11px] text-foreground outline-none focus:border-primary/30 placeholder:text-faint"
            aria-label="Buscar en casos recientes"
          />
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={`relative w-8 h-8 rounded-full border flex items-center justify-center transition-all ${
              activeCount > 0
                ? 'bg-primary-hl border-primary/30 text-primary'
                : 'bg-surface border-divider text-faint hover:text-foreground'
            }`}
            aria-label="Filtros del carrusel"
          >
            <Filter className="w-3.5 h-3.5" />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full text-[7px] font-black text-inverse flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
        </div>
        <AnimatePresence>
          {modalOpen && (
            <CaseListFiltersModal
              role={role}
              currentFilters={filters}
              onClose={() => setModalOpen(false)}
              onApply={(f) => {
                persist(f);
                setModalOpen(false);
              }}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <CaseListToolbar
      role={role}
      filters={filters}
      onFiltersChange={persist}
      total={null}
      compact={context === 'MARKETPLACE'}
    />
  );
}
