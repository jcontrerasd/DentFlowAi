import type { LucideIcon } from 'lucide-react';
import { Activity, AlertCircle, CheckCircle2, Circle, Clock, Package, Truck, XCircle } from 'lucide-react';
import { statusLabel } from '@/components/ui/StatusBadge';

export type DentistCardZone = {
  icon: LucideIcon;
  iconClass: string;
  primary: string;
  secondary: string | null;
  ctaLabel: string;
  ctaVariant: 'primary' | 'neutral';
};

type Bid = { status?: string | null } | null | undefined;

type DentistCardInput = {
  status: string;
  bids?: Array<Bid> | null;
  workDeadline?: string | Date | null;
  completedAt?: string | Date | null;
  material?: string | null;
  fileCount?: number;
};

function formatShortDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

function countPendingOffers(bids: DentistCardInput['bids']): number {
  if (!Array.isArray(bids)) return 0;
  return bids.filter((b) => b?.status === 'pending').length;
}

function joinSecondary(parts: Array<string | null | undefined>): string | null {
  const clean = parts.filter((p): p is string => Boolean(p && p.trim()));
  return clean.length ? clean.join(' · ') : null;
}

export function getDentistCardZone(input: DentistCardInput): DentistCardZone {
  const { status, material } = input;

  switch (status) {
    case 'borrador': {
      const fileBit = input.fileCount && input.fileCount > 0 ? `${input.fileCount} archivos` : null;
      return {
        icon: Circle,
        iconClass: 'text-faint',
        primary: 'Borrador',
        secondary: joinSecondary([material, fileBit]),
        ctaLabel: 'Continuar edición',
        ctaVariant: 'neutral',
      };
    }
    case 'enEvaluacion': {
      const n = countPendingOffers(input.bids);
      const offers = n > 0 ? `${n} ${n === 1 ? 'oferta recibida' : 'ofertas recibidas'}` : 'Aún sin ofertas';
      return {
        icon: Clock,
        iconClass: 'text-warning',
        primary: 'Evaluando',
        secondary: offers,
        ctaLabel: 'Ver caso',
        ctaVariant: 'neutral',
      };
    }
    case 'propuestaLista':
      return {
        icon: AlertCircle,
        iconClass: 'text-warning',
        primary: 'Ofertas listas para elegir',
        secondary: 'Plazo para decidir',
        ctaLabel: 'Elegir oferta',
        ctaVariant: 'primary',
      };
    case 'aceptadaPendienteInicio':
      return {
        icon: CheckCircle2,
        iconClass: 'text-primary',
        primary: 'Esperando inicio',
        secondary: joinSecondary([material, formatShortDate(input.workDeadline) && `entrega est. ${formatShortDate(input.workDeadline)}`]),
        ctaLabel: 'Ver caso',
        ctaVariant: 'neutral',
      };
    case 'enEjecucion':
    case 'enRevision':
    case 'cambiosEnProceso':
    case 'disenoAprobado':
      return {
        icon: status === 'enRevision' || status === 'cambiosEnProceso' ? AlertCircle : Activity,
        iconClass: status === 'enRevision' || status === 'cambiosEnProceso' ? 'text-warning' : 'text-primary',
        primary: statusLabel(status),
        secondary: joinSecondary([material, formatShortDate(input.workDeadline) && `entrega est. ${formatShortDate(input.workDeadline)}`]),
        ctaLabel: 'Ver progreso',
        ctaVariant: 'neutral',
      };
    case 'enFabricacion':
      return {
        icon: Package,
        iconClass: 'text-primary',
        primary: statusLabel(status),
        secondary: joinSecondary([material, formatShortDate(input.workDeadline) && `entrega est. ${formatShortDate(input.workDeadline)}`]),
        ctaLabel: 'Ver progreso',
        ctaVariant: 'neutral',
      };
    case 'enviado':
      return {
        icon: Truck,
        iconClass: 'text-primary',
        primary: statusLabel(status),
        secondary: joinSecondary([material, formatShortDate(input.workDeadline) && `entrega est. ${formatShortDate(input.workDeadline)}`]),
        ctaLabel: 'Ver progreso',
        ctaVariant: 'neutral',
      };
    case 'completado': {
      const delivered = formatShortDate(input.completedAt);
      return {
        icon: CheckCircle2,
        iconClass: 'text-jade',
        primary: 'Completado',
        secondary: joinSecondary([material, delivered ? `entregado ${delivered}` : null]),
        ctaLabel: 'Ver detalle',
        ctaVariant: 'neutral',
      };
    }
    case 'rechazado':
    case 'cancelado':
      return {
        icon: XCircle,
        iconClass: 'text-error',
        primary: statusLabel(status),
        secondary: joinSecondary([material]),
        ctaLabel: 'Ver detalle',
        ctaVariant: 'neutral',
      };
    case 'cerrado':
      return {
        icon: XCircle,
        iconClass: 'text-muted',
        primary: 'Cerrado',
        secondary: joinSecondary([material]),
        ctaLabel: 'Ver detalle',
        ctaVariant: 'neutral',
      };
    case 'pausado':
      return {
        icon: Clock,
        iconClass: 'text-warning',
        primary: 'Pausado',
        secondary: joinSecondary([material]),
        ctaLabel: 'Ver caso',
        ctaVariant: 'neutral',
      };
    default:
      return {
        icon: Activity,
        iconClass: 'text-muted',
        primary: statusLabel(status),
        secondary: joinSecondary([material]),
        ctaLabel: 'Ver caso',
        ctaVariant: 'neutral',
      };
  }
}

type TechnicianCtaInput = {
  invitationStatus?: string | null;
  caseStatus: string;
};

export function getTechnicianCardCta(input: TechnicianCtaInput): string {
  const TERMINAL = new Set(['completado', 'rechazado', 'cerrado', 'cancelado']);
  if (TERMINAL.has(input.caseStatus)) return 'Ver detalle';
  if (input.invitationStatus === 'pending') return 'Cotizar';
  return 'Ver caso';
}
