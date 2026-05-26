'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CreditCard,
  DollarSign,
  Timer,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  DEFAULT_CASE_LIST_FILTERS,
  filtersFromDashboardMetricId,
  prepareCaseListFiltersForQuery,
  type CaseListQueryFilters,
} from '@/lib/cases/caseListFilters';
import { serializeCaseListFilters } from '@/lib/cases/urlCaseListFilters';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import CreateCaseLinkButton from '@/components/cases/CreateCaseLinkButton';
import DashboardKpiStrip from '@/components/dashboard/DashboardKpiStrip';
import DashboardRecentCasesSection from '@/components/dashboard/DashboardRecentCasesSection';
import { listCasesByOrganization } from '@/lib/db/actions/cases';
import { getDashboardMetricsAction } from '@/lib/db/actions/dashboard';
import { getHubUnreadCountsForCasesAction } from '@/lib/db/actions/hubRead';
import { getMySkillsAction, toggleAvailabilityAction } from '@/lib/db/actions/skills';
import { getMyInvitationsAction } from '@/lib/db/actions/invitations';
import { RECENT_CASES_LIMIT } from '@/lib/dashboard/constants';
import { subscribeDashboardMetricsRefresh } from '@/lib/dashboard/dashboardRefresh';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logError } from '@/lib/logger';
import type { ServerClockAnchor } from '@/lib/deadlineMs';

export default function DashboardHome() {
  const { userProfile } = useAuth();
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [totalCases, setTotalCases] = useState(0);
  const [metricsRole, setMetricsRole] = useState<'dentista' | 'tecnico'>('dentista');
  const [rawCases, setRawCases] = useState<any[]>([]);
  const [myBidsMap, setMyBidsMap] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [techHasSkills, setTechHasSkills] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspendedUntil, setSuspendedUntil] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingBidId, setDeletingBidId] = useState<string | null>(null);
  const [hubUnreadByCase, setHubUnreadByCase] = useState<Record<string, number>>({});
  const [listServerClock, setListServerClock] = useState<ServerClockAnchor | null>(null);

  const [featuredFilters, setFeaturedFilters] =
    useState<CaseListQueryFilters>(DEFAULT_CASE_LIST_FILTERS);
  const debouncedFeaturedQ = useDebouncedValue(featuredFilters.q ?? '', 300);
  const dashboardRole: 'dentista' | 'tecnico' =
    userProfile?.role === 'tecnico'
      ? 'tecnico'
      : userProfile?.role === 'dentista'
        ? 'dentista'
        : metricsRole;

  const featuredFiltersForFetch = useMemo(
    () =>
      prepareCaseListFiltersForQuery(dashboardRole, {
        ...featuredFilters,
        q: debouncedFeaturedQ,
      }),
    [featuredFilters, debouncedFeaturedQ, dashboardRole],
  );
  const featuredQueryKey = serializeCaseListFilters(featuredFiltersForFetch);
  const dashboardInitialLoadDone = useRef(false);

  const fetchDashboardData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userProfile) return;
    if (!opts?.silent) setLoading(true);
    try {
      const [metricsResult, casesResult] = await Promise.all([
        getDashboardMetricsAction(),
        listCasesByOrganization(1, RECENT_CASES_LIMIT, false, true, featuredFiltersForFetch),
      ]);

      if (metricsResult) {
        setMetrics(metricsResult.metrics);
        setTotalCases(metricsResult.totalCases);
        setMetricsRole(metricsResult.role);
      }

      const casesArray = casesResult?.cases ?? [];
      setRawCases(casesArray);
      const sn = casesResult?.serverNowMs as number | undefined;
      if (typeof sn === 'number' && Number.isFinite(sn)) {
        setListServerClock({ serverNowMs: sn, clientPerfAtFetch: performance.now() });
      } else {
        setListServerClock(null);
      }

      if (userProfile.role === 'tecnico') {
        const [skillsCheck, invitations] = await Promise.all([
          getMySkillsAction(),
          getMyInvitationsAction(),
        ]);

        const invitationsArr = (invitations as any[]) || [];
        const hasSkills = (skillsCheck as any[]).some(
          (s: any) => (s.designLevel ?? 0) > 0 || (s.fabricationLevel ?? 0) > 0,
        );
        setTechHasSkills(hasSkills);

        const bidsMap = new Map<string, any>();
        invitationsArr.forEach((inv: any) => {
          bidsMap.set(inv.caseId, inv);
        });
        setMyBidsMap(bidsMap);

        const now = new Date();
        if (userProfile.suspendedUntil && new Date(userProfile.suspendedUntil) > now) {
          setIsSuspended(true);
          setSuspendedUntil(userProfile.suspendedUntil);
        } else {
          setIsSuspended(false);
          setSuspendedUntil(null);
        }
      }
    } catch (err) {
      logError('Error fetching dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, [userProfile, featuredQueryKey]);

  useEffect(() => {
    if (!userProfile) return;
    const silent = dashboardInitialLoadDone.current;
    dashboardInitialLoadDone.current = true;
    void fetchDashboardData({ silent });
  }, [userProfile, featuredQueryKey, fetchDashboardData]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && userProfile) {
        void fetchDashboardData({ silent: true });
      }
    };
    const onFocus = () => {
      if (userProfile) void fetchDashboardData({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [userProfile, fetchDashboardData]);

  useEffect(() => {
    return subscribeDashboardMetricsRefresh(() => {
      void fetchDashboardData({ silent: true });
    });
  }, [fetchDashboardData]);

  useEffect(() => {
    const ids = rawCases.map((c: any) => c.id).filter(Boolean);
    if (!ids.length) {
      setHubUnreadByCase({});
      return;
    }
    void getHubUnreadCountsForCasesAction(ids)
      .then((r) => setHubUnreadByCase(r.byCaseId))
      .catch(() => setHubUnreadByCase({}));
  }, [rawCases]);

  const isDentist = userProfile?.role === 'dentista';
  const isAdmin = userProfile?.role === 'admin';

  const router = useRouter();
  const handleKpiClick = useCallback(
    (metricId: string) => {
      const filters = filtersFromDashboardMetricId(dashboardRole, metricId);
      router.push(`/dashboard/cases${serializeCaseListFilters(filters)}`);
    },
    [dashboardRole, router],
  );

  const viewAllHref = useMemo(
    () => `/dashboard/cases${serializeCaseListFilters(featuredFiltersForFetch)}`,
    [featuredFiltersForFetch],
  );

  if (loading) {
    return (
      <motion.div
        className="flex items-center justify-center h-[60vh]"
      >
        <div className="w-12 h-12 border-4 border-primary/20 border-t-teal-500 rounded-full animate-spin" />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-5 font-sans pb-8"
    >
      <motion.div
        className="flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-4xl serif-font text-foreground mb-2">Dashboard</h1>
        </motion.div>
        {isDentist && <CreateCaseLinkButton />}
      </motion.div>

      {!isDentist && !isAdmin && !techHasSkills && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 bg-warning-hl border border-warning/20 rounded-2xl px-5 py-4"
        >
          <div className="w-9 h-9 rounded-xl bg-warning-hl border border-warning/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertCircle className="w-5 h-5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-warning mb-0.5">
              Tu perfil técnico está incompleto
            </p>
            <p className="text-[11px] text-faint">
              Declara tus habilidades para comenzar a recibir invitaciones de trabajo del sistema.
            </p>
          </div>
          <Link
            href="/dashboard/profile"
            className="flex-shrink-0 px-4 py-2 bg-warning-hl border border-warning/20 text-warning text-[10px] font-bold uppercase tracking-wider rounded-xl hover:bg-warning-hl transition-colors"
          >
            Completar perfil
          </Link>
        </motion.div>
      )}

      {!isDentist && !isAdmin && isSuspended && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 bg-error-hl border border-error/30/25 rounded-2xl px-5 py-6"
        >
          <div className="w-10 h-10 rounded-xl bg-error/20 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-error" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-error uppercase tracking-tight mb-1">
              Cuenta Temporalmente Pausada
            </p>
            <p className="text-xs text-muted leading-relaxed max-w-2xl">
              Tu cuenta ha sido pausada hasta el{' '}
              <b>{new Date(suspendedUntil!).toLocaleDateString()}</b> porque no respondiste 3
              invitaciones consecutivas. Para volver a recibir casos, debes reactivar tu
              disponibilidad manualmente.
            </p>
            <div className="mt-4 flex gap-4">
              <button
                type="button"
                onClick={async () => {
                  setSubmitting(true);
                  const res = await toggleAvailabilityAction();
                  if (res.success) {
                    setIsSuspended(false);
                    window.location.reload();
                  }
                  setSubmitting(false);
                }}
                disabled={submitting}
                className="px-6 py-2 bg-error text-inverse text-[10px] font-bold uppercase tracking-wider rounded-xl hover:bg-red-400 transition-colors shadow-lg shadow-sm"
              >
                {submitting ? 'Reactivando...' : 'Reactivar mi cuenta ahora'}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {!isAdmin && (
        <DashboardKpiStrip
          role={dashboardRole}
          metrics={metrics}
          totalCases={totalCases}
          onMetricClick={handleKpiClick}
        />
      )}

      <DashboardRecentCasesSection
        role={isDentist ? 'dentista' : 'tecnico'}
        rawCases={rawCases}
        featuredFilters={featuredFilters}
        onFilterChange={(f) =>
          setFeaturedFilters(prepareCaseListFiltersForQuery(dashboardRole, f))
        }
        myBidsMap={myBidsMap}
        hubUnreadByCase={hubUnreadByCase}
        listServerClock={listServerClock}
        userProfileId={userProfile?.id}
        viewAllHref={viewAllHref}
      />

      <section className="space-y-4 pt-3 border-t border-divider">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl serif-font text-foreground flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-primary" /> Información Financiera
          </h2>
          <Link
            href="/dashboard/finance"
            className="text-faint text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 hover:text-foreground transition-all"
          >
            Ver Reportes <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface/40 border border-divider p-6 rounded-[1.5rem] flex items-center justify-between group hover:border-primary/30 transition-all">
            <div>
              <p className="text-faint text-[10px] font-bold uppercase tracking-wider mb-1">
                Saldo Disponible
              </p>
              <h3 className="text-2xl text-foreground font-black">$0 CLP</h3>
            </div>
            <motion.div
              className="w-12 h-12 bg-jade-hl rounded-xl flex items-center justify-center"
            >
              <DollarSign className="text-jade w-6 h-6" />
            </motion.div>
          </div>
          <motion.div
            className="bg-surface/40 border border-divider p-6 rounded-[1.5rem] flex items-center justify-between group hover:border-primary/30 transition-all"
          >
            <div>
              <p className="text-faint text-[10px] font-bold uppercase tracking-wider mb-1">
                Ingresos este Mes
              </p>
              <h3 className="text-2xl text-foreground font-black">$0 CLP</h3>
            </div>
            <div className="w-12 h-12 bg-primary-hl rounded-xl flex items-center justify-center">
              <Timer className="text-primary w-6 h-6" />
            </div>
          </motion.div>
          <div className="bg-surface/40 border border-divider p-6 rounded-[1.5rem] flex items-center justify-between group hover:border-primary/30 transition-all">
            <div>
              <p className="text-faint text-[10px] font-bold uppercase tracking-wider mb-1">
                Pagos Pendientes
              </p>
              <h3 className="text-2xl text-foreground font-black">0</h3>
            </div>
            <div className="w-12 h-12 bg-warning-hl rounded-xl flex items-center justify-center">
              <Clock className="text-warning w-6 h-6" />
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
