'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import DashboardKpiCard from '@/components/dashboard/DashboardKpiCard';
import {
  getDashboardMetricDefsForRole,
  TOTAL_METRIC_DEF,
  type DashboardMetricDef,
} from '@/lib/dashboard/dashboardMetricsConfig';

type DashboardKpiStripProps = {
  role: 'dentista' | 'tecnico';
  metrics: Record<string, number>;
  totalCases: number;
  onMetricClick?: (metricId: string) => void;
};

export default function DashboardKpiStrip({
  role,
  metrics,
  totalCases,
  onMetricClick,
}: DashboardKpiStripProps) {
  const defs = getDashboardMetricDefsForRole(role);

  const visibleDefs = defs.filter((d) => {
    if (d.id === 'otros' || d.id === 'pausado') {
      return (metrics[d.id] ?? 0) > 0;
    }
    return true;
  });

  const wrapClick = (metricId: string, child: ReactNode) => {
    const shellClass = 'snap-start shrink-0';
    if (!onMetricClick) {
      return (
        <motion.div key={metricId} className={shellClass}>
          {child}
        </motion.div>
      );
    }
    return (
      <button
        key={metricId}
        type="button"
        onClick={() => onMetricClick(metricId)}
        className={`${shellClass} text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50`}
      >
        {child}
      </button>
    );
  };

  return (
    <motion.div
      className="flex gap-2 overflow-x-auto overflow-y-visible pt-2 pb-2 snap-x snap-mandatory no-scrollbar -mx-1 px-1"
      role="region"
      aria-label="Indicadores de casos"
    >
      {wrapClick(
        'total',
        <DashboardKpiCard
          title={TOTAL_METRIC_DEF.label}
          value={totalCases}
          icon={TOTAL_METRIC_DEF.icon}
          statusColorKey={TOTAL_METRIC_DEF.statusColorKey}
          delay={0}
        />,
      )}
      {visibleDefs.map((def: DashboardMetricDef, i) =>
        wrapClick(
          def.id,
          <DashboardKpiCard
            title={def.label}
            value={metrics[def.id] ?? 0}
            icon={def.icon}
            statusColorKey={def.statusColorKey}
            attentionBadge={def.attentionBadge}
            delay={0.02 * (i + 1)}
          />,
        ),
      )}
    </motion.div>
  );
}
