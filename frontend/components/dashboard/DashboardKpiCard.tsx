'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { kpiStyleFromStatusKey } from '@/lib/dashboard/kpiStylesFromStatus';

type DashboardKpiCardProps = {
  title: string;
  value: number;
  icon: LucideIcon;
  statusColorKey: string;
  attentionBadge?: boolean;
  delay?: number;
};

export default function DashboardKpiCard({
  title,
  value,
  icon: Icon,
  statusColorKey,
  attentionBadge,
  delay = 0,
}: DashboardKpiCardProps) {
  const style = kpiStyleFromStatusKey(statusColorKey);
  const borderClass = style.border ? `border ${style.border}` : 'border border-divider/30';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className={`relative flex-shrink-0 w-[7.25rem] sm:w-[8.5rem] bg-surface shadow-sm border border-divider p-2.5 rounded-xl ${borderClass} group transition-all duration-150 hover:!bg-primary-hl hover:!border-teal-400/70 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sm snap-start`}
      title={title}
    >
      {attentionBadge && value > 0 && (
        <span className="absolute -top-1 -right-1 z-10 min-w-[16px] h-4 px-1 bg-yellow-500 text-inverse text-[8px] font-black rounded-full flex items-center justify-center animate-bounce shadow-lg">
          {value > 99 ? '99+' : value}
        </span>
      )}
      <motion.div
        className={`w-6 h-6 ${style.bg} ${style.color} rounded-md flex items-center justify-center mb-2`}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden />
      </motion.div>
      <p className="text-faint text-[7px] font-bold uppercase tracking-wider leading-tight line-clamp-2 min-h-[2em]">
        {title}
      </p>
      <p className={`text-lg font-black tabular-nums leading-none mt-0.5 ${style.color}`}>{value}</p>
    </motion.div>
  );
}
