'use client';

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, RefreshCw, Archive, FolderOpen, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { listCasesByOrganization } from '@/lib/db/actions/cases';
import { getHubUnreadCountsForCasesAction } from '@/lib/db/actions/hubRead';
import { useAuth } from '@/context/AuthContext';
import MarketplaceCaseCard from '@/components/cases/MarketplaceCaseCard';
import CreateCaseLinkButton from '@/components/cases/CreateCaseLinkButton';
import CaseListToolbar from '@/components/cases/CaseListToolbar';
import {
  buildInvitationPropForCard,
  mapViewerInvitationForCard,
} from '@/lib/cases/caseListCardHelpers';
import {
  DEFAULT_CASE_LIST_FILTERS,
  hasActiveCaseListFilters,
  prepareCaseListFiltersForQuery,
  toFacetOnlyFilters,
  withoutTechListFacetFilters,
  resolveCaseListViewRole,
  type CaseListQueryFilters,
} from '@/lib/cases/caseListFilters';
import {
  filtersEqual,
  parseCaseListSearchParams,
  serializeCaseListFilters,
  shouldHydrateFiltersFromUrl,
  shouldPushFiltersToUrl,
} from '@/lib/cases/urlCaseListFilters';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { logError } from '@/lib/logger';
import type { ServerClockAnchor } from '@/lib/deadlineMs';

type CasesTab = 'active' | 'archived';

const PAGE_SIZE = 24;

function CasesPageContent() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [hubUnreadByCase, setHubUnreadByCase] = useState<Record<string, number>>({});
  const [listServerClock, setListServerClock] = useState<ServerClockAnchor | null>(null);
  const requestIdRef = useRef(0);

  const role = resolveCaseListViewRole(userProfile?.role);
  const isDentist = role === 'dentista';
  const userId = userProfile?.id ?? '';
  const profileReady = !authLoading && !!userProfile;

  const [filters, setFilters] = useState<CaseListQueryFilters>(DEFAULT_CASE_LIST_FILTERS);
  /** Texto en vivo del buscador; la URL y el fetch usan solo `debouncedQ`. */
  const [qInput, setQInput] = useState('');
  const debouncedQ = useDebouncedValue(qInput, 300);

  const filtersForFetch = useMemo(
    () => prepareCaseListFiltersForQuery(role, { ...filters, q: debouncedQ }),
    [role, filters, debouncedQ],
  );
  const urlQueryKey = useMemo(
    () => serializeCaseListFilters(filtersForFetch),
    [filtersForFetch],
  );
  const listQueryKey = urlQueryKey;

  /** Facetas en React alineadas con prepare (KPI/preset colgados no deben quedar al buscar). */
  useEffect(() => {
    if (!profileReady || role !== 'tecnico') return;
    const prepared = prepareCaseListFiltersForQuery(role, { ...filters, q: debouncedQ });
    const nextFacets = toFacetOnlyFilters(prepared);
    if (!filtersEqual(nextFacets, toFacetOnlyFilters(filters))) {
      setFilters(nextFacets);
    }
  }, [profileReady, role, debouncedQ, filters]);

  const handleFiltersChange = (next: CaseListQueryFilters) => {
    const prepared = prepareCaseListFiltersForQuery(role, next);
    setFilters(toFacetOnlyFilters(prepared));
    setQInput(prepared.q ?? '');
    setPage(1);
  };

  useEffect(() => {
    if (!profileReady) return;
    const fromUrlPrepared = prepareCaseListFiltersForQuery(
      role,
      parseCaseListSearchParams(searchParams),
    );
    if (!urlHydrated) {
      setFilters(toFacetOnlyFilters(fromUrlPrepared));
      setQInput(fromUrlPrepared.q ?? '');
      setUrlHydrated(true);
      return;
    }
    const currentEffective = prepareCaseListFiltersForQuery(role, {
      ...filters,
      q: debouncedQ,
    });
    if (shouldHydrateFiltersFromUrl(fromUrlPrepared, currentEffective)) {
      setFilters(toFacetOnlyFilters(fromUrlPrepared));
      setQInput(fromUrlPrepared.q ?? '');
    }
    // Solo searchParams: el debounce de q no debe re-hidratar desde URL retrasada.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters/debouncedQ leídos al navegar
  }, [searchParams, role, profileReady, urlHydrated]);

  useEffect(() => {
    if (!profileReady || !urlHydrated) return;
    const fromUrlPrepared = prepareCaseListFiltersForQuery(
      role,
      parseCaseListSearchParams(searchParams),
    );
    if (shouldPushFiltersToUrl(fromUrlPrepared, filtersForFetch)) {
      router.replace(`/dashboard/cases${urlQueryKey}`, { scroll: false });
    }
  }, [profileReady, urlHydrated, urlQueryKey, router, searchParams, role, filtersForFetch]);

  const fetchList = useCallback(
    async (opts: {
      pageNum: number;
      append: boolean;
      archived: boolean;
      silent?: boolean;
    }) => {
      if (!userProfile) return;
      const reqId = ++requestIdRef.current;
      if (opts.append) setLoadingMore(true);
      else if (!opts.silent) setFetching(true);

      try {
        const result = await listCasesByOrganization(
          opts.pageNum,
          PAGE_SIZE,
          opts.archived,
          true,
          filtersForFetch,
        );
        if (reqId !== requestIdRef.current) return;

        const list = result?.cases ?? [];
        setCases((prev) => (opts.append ? [...prev, ...list] : list));
        setTotal(result?.total ?? 0);
        setHasMore(result?.hasMore ?? false);
        setPage(opts.pageNum);
        const sn = result?.serverNowMs;
        if (typeof sn === 'number' && Number.isFinite(sn)) {
          setListServerClock({ serverNowMs: sn, clientPerfAtFetch: performance.now() });
        }
        setLastUpdated(new Date());
      } catch (err) {
        logError('Error fetching cases', err);
      } finally {
        if (reqId === requestIdRef.current) {
          setFetching(false);
          setLoadingMore(false);
          setInitialLoading(false);
        }
      }
    },
    [userProfile, filtersForFetch],
  );

  useEffect(() => {
    if (!profileReady || !urlHydrated) return;
    void fetchList({ pageNum: 1, append: false, archived: showArchived });
  }, [profileReady, urlHydrated, showArchived, listQueryKey, fetchList]);

  useEffect(() => {
    const ids = cases.map((c: { id?: string }) => c.id).filter(Boolean) as string[];
    if (!ids.length) {
      setHubUnreadByCase({});
      return;
    }
    void getHubUnreadCountsForCasesAction(ids)
      .then((r) => setHubUnreadByCase(r.byCaseId))
      .catch(() => setHubUnreadByCase({}));
  }, [cases]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && userProfile) {
        void fetchList({ pageNum: 1, append: false, archived: showArchived, silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [userProfile, showArchived, fetchList]);

  const handleLoadMore = () => {
    if (!hasMore || loadingMore || fetching) return;
    void fetchList({ pageNum: page + 1, append: true, archived: showArchived });
  };

  const handleClearFilters = () => {
    setQInput('');
    handleFiltersChange(withoutTechListFacetFilters(DEFAULT_CASE_LIST_FILTERS));
  };

  const showGridOverlay = fetching && cases.length > 0;
  const showInitialSkeleton = initialLoading && cases.length === 0;
  const emptyDueToFilters =
    !fetching && cases.length === 0 && total === 0 && hasActiveCaseListFilters(filtersForFetch);

  return (
    <motion.div className="font-sans flex flex-col h-[calc(100dvh-10rem)] max-h-[calc(100dvh-10rem)] min-h-0 overflow-hidden">
      <div
        className="shrink-0 -mx-10 px-10 pb-4 space-y-4 bg-background border-b border-divider shadow-[0_8px_24px_-12px_rgba(2,6,23,0.6)] z-20"
        aria-label="Filtros de casos"
      >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-4xl serif-font text-foreground mb-2">Casos</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-faint text-sm">
              {isDentist
                ? 'Gestiona y supervisa todos tus tratamientos activos.'
                : 'Invitaciones, cotizaciones y casos en ejecución.'}
            </p>
            {lastUpdated && (
              <motion.div className="flex items-center gap-1.5">
                <span className="text-faint text-xs">
                  {formatDistanceToNow(lastUpdated, { locale: es, addSuffix: true })}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void fetchList({ pageNum: 1, append: false, archived: showArchived, silent: false })
                  }
                  disabled={fetching}
                  aria-label="Actualizar lista de casos"
                  className="p-1 rounded-lg text-faint hover:text-primary hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
                </button>
              </motion.div>
            )}
          </div>
        </div>
        {isDentist && <CreateCaseLinkButton />}
      </div>

        <div className="flex gap-1 bg-surface/60 border border-divider rounded-2xl p-1 w-fit">
          <button
            type="button"
            onClick={() => {
              setShowArchived(false);
              setPage(1);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              !showArchived ? 'bg-primary-hl border border-primary/30 text-foreground' : 'border border-transparent text-faint hover:bg-surface-off hover:border-border hover:text-muted'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" /> Activos
          </button>
          <button
            type="button"
            onClick={() => {
              setShowArchived(true);
              setPage(1);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              showArchived ? 'bg-surface-off border border-divider text-foreground' : 'border border-transparent text-faint hover:bg-surface-off hover:border-border hover:text-muted'
            }`}
          >
            <Archive className="w-3.5 h-3.5" /> Archivados
          </button>
        </div>

        <CaseListToolbar
          role={role}
          filters={filters}
          searchValue={qInput}
          onSearchChange={setQInput}
          onFiltersChange={handleFiltersChange}
          total={fetching && cases.length === 0 ? null : total}
          loading={fetching}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mx-10 px-10 pt-6 pb-6 custom-scrollbar">
      {showInitialSkeleton ? (
        <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-surface/20 rounded-3xl animate-pulse border border-divider/50" />
          ))}
        </motion.div>
      ) : cases.length === 0 && !fetching ? (
        <div className="text-center py-20 bg-surface/20 border border-dashed border-divider rounded-[2.5rem]">
          <AlertCircle className="text-faint w-12 h-12 mx-auto mb-4" />
          <h3 className="text-xl text-foreground font-medium mb-2">No se encontraron casos</h3>
          <p className="text-faint mb-6">
            {emptyDueToFilters
              ? 'Prueba con otros términos o limpia los filtros activos.'
              : showArchived
                ? 'No tienes casos archivados.'
                : 'Aún no hay casos en esta vista.'}
          </p>
          {emptyDueToFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-5 py-2.5 rounded-xl bg-primary text-inverse text-[10px] font-bold uppercase tracking-wider hover:bg-primary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="relative space-y-6">
          {showGridOverlay && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-background/50 backdrop-blur-[2px] min-h-[200px]"
              aria-busy="true"
            >
              <motion.div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface/90 border border-divider text-primary text-[10px] font-bold uppercase tracking-wider">
                <Loader2 className="w-4 h-4 animate-spin" />
                Actualizando…
              </motion.div>
            </div>
          )}
          <div
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${
              showGridOverlay ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            {cases.map((c) => {
              const viewerInv = c.viewerInvitation;
              const myBid = !isDentist
                ? mapViewerInvitationForCard(viewerInv, c, userId)
                : undefined;
              const invitation = !isDentist ? buildInvitationPropForCard(viewerInv) : undefined;
              return (
                <MarketplaceCaseCard
                  key={c.id}
                  c={c}
                  isDentist={isDentist}
                  hubUchUnread={hubUnreadByCase[c.id] ?? 0}
                  serverClockAnchor={listServerClock}
                  myBid={myBid}
                  invitation={invitation}
                  onSelectCase={(caseObj) => router.push(`/dashboard/cases/${caseObj.id}`)}
                />
              );
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-8 py-3 rounded-xl border border-divider bg-surface text-[10px] font-bold uppercase tracking-wider text-foreground hover:border-primary/30 hover:bg-surface-off hover:text-primary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando…
                  </span>
                ) : (
                  'Cargar más'
                )}
              </button>
            </div>
          )}
        </div>
      )}
      </div>
    </motion.div>
  );
}

export default function CasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      }
    >
      <CasesPageContent />
    </Suspense>
  );
}
