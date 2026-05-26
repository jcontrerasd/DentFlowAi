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

const NEUTRAL = 'bg-surface-off text-muted border border-divider';
const IN_PROGRESS = 'bg-primary-hl text-primary border border-primary/20';
const ATTENTION = 'bg-warning-hl text-warning border border-warning/20';
const SUCCESS = 'bg-jade-hl text-jade border border-jade/20';
const NEGATIVE = 'bg-error-hl text-error border border-error/20';

/**
 * Estilos e iconos de pastilla de estado (ficha, filtros, KPIs del dashboard).
 * Paleta semántica colapsada según design system (neutro/proceso/atención/éxito/negativo).
 */
export const STATUS_MAP: Record<string, StatusConfig> = {
  borrador: { label: 'Borrador', icon: FileText, className: NEUTRAL },
  enEvaluacion: { label: 'En Evaluación', icon: Activity, className: IN_PROGRESS },
  propuestaLista: { label: 'Propuesta Lista', icon: Activity, className: ATTENTION },
  aceptadaPendienteInicio: { label: 'Esperando inicio', icon: CheckCircle2, className: IN_PROGRESS },
  enEjecucion: { label: 'En Ejecución', icon: Activity, className: IN_PROGRESS },
  enRevision: { label: 'En Revisión', icon: Eye, className: ATTENTION },
  cambiosEnProceso: { label: 'Cambios', icon: AlertCircle, className: ATTENTION },
  disenoAprobado: { label: 'Diseño Aprobado', icon: CheckCircle2, className: SUCCESS },
  enFabricacion: { label: 'En Fabricación', icon: Package, className: IN_PROGRESS },
  enviado: { label: 'Enviado', icon: Truck, className: IN_PROGRESS },
  completado: { label: 'Completado', icon: CheckCircle2, className: SUCCESS },
  cerrado: { label: 'Cerrado', icon: X, className: NEUTRAL },
  pausado: { label: 'Pausado', icon: Pause, className: ATTENTION },
  cancelado: { label: 'Cancelado', icon: X, className: NEGATIVE },
  rechazado: { label: 'Rechazado', icon: X, className: NEGATIVE },
};

const FALLBACK_ICON = FileText;

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    className: NEUTRAL,
    icon: FALLBACK_ICON,
  };
  const Icon = config.icon;

  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider',
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
