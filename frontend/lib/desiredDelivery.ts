import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';

const LOCAL_FMT = "yyyy-MM-dd'T'HH:mm";

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Valor por defecto: hoy + 3 días a las 12:00. */
export function defaultDesiredDeliveryLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(12, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00`;
}

export function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseLocalDatetime(value: string): Date | null {
  if (!value) return null;
  try {
    const d = parse(value, LOCAL_FMT, new Date());
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
}

export function splitLocalDatetime(value: string): { date: string; hour: string; minute: string } {
  const d = parseLocalDatetime(value);
  if (!d) {
    const def = defaultDesiredDeliveryLocal();
    const parsed = parseLocalDatetime(def)!;
    return {
      date: format(parsed, 'yyyy-MM-dd'),
      hour: format(parsed, 'HH'),
      minute: format(parsed, 'mm'),
    };
  }
  return {
    date: format(d, 'yyyy-MM-dd'),
    hour: format(d, 'HH'),
    minute: format(d, 'mm'),
  };
}

/** Hora mínima (HH:mm) cuando la fecha seleccionada es hoy. */
export function minTimeForDate(date: string, minLeadMinutes = 30): string | undefined {
  if (date !== todayDateString()) return undefined;
  const now = new Date();
  now.setMinutes(now.getMinutes() + minLeadMinutes);
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Resumen legible desde Date o ISO (ficha de caso en solo lectura). */
export function formatDesiredDeliverySummaryFromDate(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return '';
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  const local = `${format(d, 'yyyy-MM-dd')}T${format(d, 'HH')}:${format(d, 'mm')}`;
  return formatDesiredDeliverySummary(local);
}

/** Convierte ISO/Date a valor local `yyyy-MM-ddTHH:mm` para el picker. */
export function toLocalDatetimeValue(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return '';
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  return joinLocalDatetime(
    format(d, 'yyyy-MM-dd'),
    format(d, 'HH'),
    format(d, 'mm'),
  );
}

export function joinLocalDatetime(date: string, hour: string, minute: string): string {
  return `${date}T${hour}:${minute}`;
}

export function isDesiredDeliveryValid(value: string, minLeadMinutes = 30): boolean {
  const d = parseLocalDatetime(value);
  if (!d) return false;
  return d.getTime() > Date.now() + minLeadMinutes * 60_000;
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Etiqueta corta para el botón de fecha. Ej: "Sábado 14 de Junio de 2026" */
export function formatDesiredDeliveryDateLabel(value: string): string {
  const d = parseLocalDatetime(value);
  if (!d) return '';
  const weekday = capitalizeWord(format(d, 'EEEE', { locale: es }));
  const day = format(d, 'd', { locale: es });
  const month = capitalizeWord(format(d, 'MMMM', { locale: es }));
  const year = format(d, 'yyyy', { locale: es });
  return `${weekday} ${day} de ${month} de ${year}`;
}
/** Ej: "Sábado 14 de Junio de 2026 antes de las 18:30" */
export function formatDesiredDeliverySummary(value: string): string {
  const label = formatDesiredDeliveryDateLabel(value);
  if (!label) return '';
  const d = parseLocalDatetime(value);
  if (!d) return '';
  const time = format(d, 'HH:mm', { locale: es });
  return `${label} antes de las ${time}`;
}
