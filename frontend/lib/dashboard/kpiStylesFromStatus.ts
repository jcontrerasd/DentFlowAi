import { STATUS_MAP } from '@/components/ui/StatusBadge';

export type KpiStyle = { color: string; bg: string; border?: string };

const INVITACION_PENDIENTE_STYLE: KpiStyle = {
  color: 'text-teal-400',
  bg: 'bg-teal-500/10',
  border: 'border-teal-500/30',
};

const TOTAL_STYLE: KpiStyle = {
  color: 'text-slate-300',
  bg: 'bg-slate-700/40',
  border: 'border-slate-600/50',
};

/** Extrae text-* y primera bg-* del className de STATUS_MAP. */
function stylesFromStatusMapClass(className: string): KpiStyle {
  const textMatch = className.match(/\btext-[\w.-]+/);
  const bgMatch = className.match(/\bbg-[\w./%-]+/);
  const borderMatch = className.match(/\bborder-[\w./%-]+/);
  return {
    color: textMatch?.[0] ?? 'text-slate-400',
    bg: bgMatch?.[0] ?? 'bg-slate-700/40',
    border: borderMatch?.[0],
  };
}

export function kpiStyleFromStatusKey(statusColorKey: string): KpiStyle {
  if (statusColorKey === 'total') {
    return TOTAL_STYLE;
  }
  if (statusColorKey === 'invitacionPendiente') {
    return INVITACION_PENDIENTE_STYLE;
  }
  const config = STATUS_MAP[statusColorKey];
  if (!config) {
    return stylesFromStatusMapClass(
      'bg-slate-700/60 text-slate-400 border-slate-600/50',
    );
  }
  return stylesFromStatusMapClass(config.className);
}
