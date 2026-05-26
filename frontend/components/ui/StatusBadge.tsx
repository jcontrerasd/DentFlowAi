import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  Package,
  Pause,
  Truck,
  X,
} from 'lucide-react';

interface StatusConfig {
  label: string;
  className: string;
  icon: LucideIcon;
}

/**
 * Estilos e iconos de pastilla de estado (ficha, filtros, KPIs del dashboard).
 * Iconos alineados con `MarketplaceCaseCard` (franjas Activity/CheckCircle2) y estados estándar.
 */
export const STATUS_MAP: Record<string, StatusConfig> = {
  borrador: { label: 'Borrador', icon: FileText, className: 'bg-slate-700/60 text-slate-300 border-slate-600/50' },
  enEvaluacion: { label: 'En Evaluación', icon: Activity, className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  propuestaLista: { label: 'Propuesta Lista', icon: Activity, className: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  aceptadaPendienteInicio: {
    label: 'Esperando inicio',
    icon: CheckCircle2,
    className: 'bg-teal-500/15 text-teal-300 border-teal-500/35',
  },
  enEjecucion: { label: 'En Ejecución', icon: Activity, className: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  enRevision: { label: 'En Revisión', icon: Eye, className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  cambiosEnProceso: { label: 'Cambios', icon: AlertCircle, className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  disenoAprobado: { label: 'Diseño Aprobado', icon: CheckCircle2, className: 'bg-teal-500/20 text-teal-300 border-teal-500/40' },
  enFabricacion: { label: 'En Fabricación', icon: Package, className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  enviado: { label: 'Enviado', icon: Truck, className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  completado: { label: 'Completado', icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  cerrado: { label: 'Cerrado', icon: X, className: 'bg-slate-600/60 text-slate-400 border-slate-500/50' },
  pausado: { label: 'Pausado', icon: Pause, className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  cancelado: { label: 'Cancelado', icon: X, className: 'bg-red-500/15 text-red-300 border-red-500/30' },
  rechazado: { label: 'Rechazado', icon: X, className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

const FALLBACK_ICON = FileText;

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    className: 'bg-slate-700/60 text-slate-400 border-slate-600/50',
    icon: FALLBACK_ICON,
  };
  const Icon = config.icon;

  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border',
        config.className,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon className="w-3 h-3 flex-shrink-0" aria-hidden />
      {config.label}
    </span>
  );
}

export function statusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

export function statusIcon(status: string): LucideIcon {
  return STATUS_MAP[status]?.icon ?? FALLBACK_ICON;
}
