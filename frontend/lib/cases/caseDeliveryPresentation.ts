import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  defaultDesiredDeliveryLocal,
  formatDesiredDeliverySummaryFromDate,
} from '@/lib/desiredDelivery';
import { validateDesiredDeliveryAt } from '@/lib/pricing/resolveListPrice';

export const DESIRED_DELIVERY_EMPTY_LABEL = 'Sin fecha de entrega definida';

export type DesiredDeliveryDisplay = {
  full: string;
  compact: string;
  hasValue: boolean;
};

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Versión corta para tarjetas y UCH. Ej: "Sáb 14 jun · 18:30" */
export function formatDesiredDeliveryCompact(dateValue: string | Date | null | undefined): string {
  const d = toDate(dateValue);
  if (!d) return '';
  const weekday = capitalizeWord(format(d, 'EEE', { locale: es }));
  const day = format(d, 'd', { locale: es });
  const month = format(d, 'MMM', { locale: es });
  const time = format(d, 'HH:mm', { locale: es });
  return `${weekday} ${day} ${month} · ${time}`;
}

export function getDesiredDeliveryDisplay(
  caseRow: { desiredDeliveryAt?: string | Date | null } | null | undefined,
): DesiredDeliveryDisplay {
  const raw = caseRow?.desiredDeliveryAt;
  const d = toDate(raw);
  if (!d) {
    return { full: '', compact: '', hasValue: false };
  }
  return {
    full: formatDesiredDeliverySummaryFromDate(d),
    compact: formatDesiredDeliveryCompact(d),
    hasValue: true,
  };
}

export function formatDesiredDeliveryForSummary(
  dateValue: string | Date | null | undefined,
): string {
  const full = formatDesiredDeliverySummaryFromDate(dateValue);
  return full || DESIRED_DELIVERY_EMPTY_LABEL;
}

export function shouldShowListPriceToViewer(input: {
  role?: string | null;
  viewingAsAdmin?: boolean;
}): boolean {
  if (input.viewingAsAdmin) return true;
  return input.role !== 'tecnico';
}

const UCH_DESIRED_DELIVERY_STATUSES = new Set([
  'borrador',
  'enEvaluacion',
  'propuestaLista',
  'aceptadaPendienteInicio',
  'publicado',
]);

/** Ocultar en UCH cuando ya hay plazo pactado (workDeadline). */
export function shouldShowDesiredDeliveryInUch(
  caseStatus: string | null | undefined,
  workDeadline: string | Date | null | undefined,
): boolean {
  if (workDeadline) return false;
  const status = String(caseStatus ?? '');
  return UCH_DESIRED_DELIVERY_STATUSES.has(status);
}

/** Fecha de entrega para un clon: origen si sigue futura, si no default (+3d 12:00). */
export function resolveClonedDesiredDeliveryAt(
  source: string | Date | null | undefined,
): Date {
  const fromSource = validateDesiredDeliveryAt(source);
  if (fromSource) return fromSource;
  const fallback = validateDesiredDeliveryAt(defaultDesiredDeliveryLocal());
  if (fallback) return fallback;
  throw new Error('No se pudo resolver fecha de entrega para el clon');
}
