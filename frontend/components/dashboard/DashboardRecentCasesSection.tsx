'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import AdvancedFiltersRow from '@/components/cases/AdvancedFiltersRow';
import MarketplaceCaseCard from '@/components/cases/MarketplaceCaseCard';
import {
  buildInvitationPropForCard,
  mapViewerInvitationForCard,
} from '@/lib/cases/caseListCardHelpers';
import type { CaseListQueryFilters } from '@/lib/cases/caseListFilters';
import { RECENT_CASES_LIMIT } from '@/lib/dashboard/constants';
import type { ServerClockAnchor } from '@/lib/deadlineMs';

type DashboardRecentCasesSectionProps = {
  role: 'dentista' | 'tecnico';
  rawCases: any[];
  featuredFilters: CaseListQueryFilters;
  onFilterChange: (filters: CaseListQueryFilters) => void;
  myBidsMap: Map<string, any>;
  hubUnreadByCase: Record<string, number>;
  listServerClock: ServerClockAnchor | null;
  userProfileId?: string;
  viewAllHref: string;
};

export default function DashboardRecentCasesSection({
  role,
  rawCases,
  featuredFilters,
  onFilterChange,
  myBidsMap,
  hubUnreadByCase,
  listServerClock,
  userProfileId,
  viewAllHref,
}: DashboardRecentCasesSectionProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDentist = role === 'dentista';
  const displayedCases = rawCases.slice(0, RECENT_CASES_LIMIT);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const scrollTo =
      direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
    scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      <motion.div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-2xl serif-font text-white">Casos Recientes</h2>
          <AdvancedFiltersRow
            context="DASHBOARD"
            role={role}
            onFilterChange={onFilterChange}
            initialFilters={featuredFilters}
          />
        </div>
        <motion.div className="flex items-center gap-3">
          <motion.div className="hidden sm:flex items-center gap-2 mr-4">
            <button
              type="button"
              onClick={() => scroll('left')}
              className="w-10 h-10 rounded-full border border-slate-800 flex items-center justify-center text-slate-400 hover:text-teal-400 hover:border-teal-500/30 transition-all bg-slate-900/50"
              aria-label="Desplazar casos a la izquierda"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              className="w-10 h-10 rounded-full border border-slate-800 flex items-center justify-center text-slate-400 hover:text-teal-400 hover:border-teal-500/30 transition-all bg-slate-900/50"
              aria-label="Desplazar casos a la derecha"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
          <Link
            href={viewAllHref}
            className="text-teal-500 hover:text-teal-200 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-400/40 rounded-sm text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:gap-3 transition-all"
          >
            Ver Todo <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </motion.div>

      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-6 pb-6 snap-x snap-mandatory no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth"
      >
        {displayedCases.map((c) => {
          const viewerInv = c.viewerInvitation;
          const myBid =
            !isDentist && userProfileId
              ? mapViewerInvitationForCard(viewerInv, c, userProfileId) ?? myBidsMap.get(c.id)
              : myBidsMap.get(c.id);
          const invitation =
            !isDentist ? buildInvitationPropForCard(viewerInv) : undefined;

          return (
            <motion.div key={c.id} className="min-w-[300px] md:min-w-[380px] snap-start">
              <MarketplaceCaseCard
                c={c}
                isDentist={isDentist}
                hubUchUnread={hubUnreadByCase[c.id] ?? 0}
                myBid={myBid}
                invitation={invitation}
                onSelectCase={(caseObj) => router.push(`/dashboard/cases/${caseObj.id}`)}
                serverClockAnchor={listServerClock}
              />
            </motion.div>
          );
        })}
        {displayedCases.length === 0 && (
          <div className="w-full py-16 text-center bg-slate-900/20 border border-dashed border-slate-800/40 rounded-[2.5rem]">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
              No hay actividad reciente
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
