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
import { statusIcon, statusLabel } from '@/components/ui/StatusBadge';
import type { TechKpiId } from '@/lib/dashboard/classifyCaseForDashboardKpi';

/** Textos e iconos de franja inferior en `MarketplaceCaseCard` (técnico / pre-adjudicación). */
export const TECH_FICHA_STRIPE = {
  solicitudOferta: { label: 'Solicitud de oferta', icon: CheckCircle2 },
  cotizacionEnviada: { label: 'Cotización enviada', icon: CheckCircle2 },
  cotizacionEnEvaluacion: { label: 'Cotización enviada · en evaluación', icon: CheckCircle2 },
  ofertaNoSeleccionada: { label: 'Oferta no seleccionada', icon: X },
  invitacionPendiente: { label: 'Invitación pendiente', icon: Activity },
  seleccionadaPendiente: { label: 'Seleccionada (pendiente)', icon: CheckCircle2 },
  confirmada: { label: 'Confirmada', icon: CheckCircle2 },
  esperandoOfertas: { label: 'Esperando ofertas', icon: Activity },
} as const;

/** Franjas con countdown del dentista en ficha (no sustituyen `STATUS_MAP` en KPI agregado). */
export const DENTIST_FICHA_STRIPE = {
  evaluandoCaso: { label: 'Evaluando Caso', icon: Activity },
  elegirOferta: { label: 'Elegir oferta', icon: Activity },
} as const;

export type CaseFichaPresentation = {
  label: string;
  icon: LucideIcon;
  statusColorKey: string;
};

/** Presentación KPI técnico alineada con la ficha (franjas + `StatusBadge`). */
export function getTechKpiFichaPresentation(kpiId: TechKpiId): CaseFichaPresentation {
  switch (kpiId) {
    case 'invitacionPendiente':
      return {
        label: TECH_FICHA_STRIPE.solicitudOferta.label,
        icon: TECH_FICHA_STRIPE.solicitudOferta.icon,
        statusColorKey: 'invitacionPendiente',
      };
    case 'cotizacionEnviada':
      return {
        label: TECH_FICHA_STRIPE.cotizacionEnviada.label,
        icon: TECH_FICHA_STRIPE.cotizacionEnviada.icon,
        statusColorKey: 'enEvaluacion',
      };
    case 'ofertaNoSeleccionada':
      return {
        label: TECH_FICHA_STRIPE.ofertaNoSeleccionada.label,
        icon: TECH_FICHA_STRIPE.ofertaNoSeleccionada.icon,
        statusColorKey: 'rechazado',
      };
    case 'otros':
      return {
        label: 'Otros',
        icon: X,
        statusColorKey: 'cerrado',
      };
    default:
      return {
        label: statusLabel(kpiId),
        icon: statusIcon(kpiId),
        statusColorKey: kpiId,
      };
  }
}

/** Presentación KPI dentista: `STATUS_MAP` (+ excepciones documentadas del plan). */
export function getDentistKpiFichaPresentation(kpiId: string): CaseFichaPresentation {
  if (kpiId === 'cerrado') {
    return {
      label: 'Cerrados',
      icon: statusIcon('cerrado'),
      statusColorKey: 'cerrado',
    };
  }
  if (kpiId === 'otros') {
    return {
      label: 'Otros',
      icon: statusIcon('cerrado'),
      statusColorKey: 'cerrado',
    };
  }
  return {
    label: statusLabel(kpiId),
    icon: statusIcon(kpiId),
    statusColorKey: kpiId,
  };
}
