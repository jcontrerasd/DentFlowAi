/**
 * v4.6 — Cálculo de deadlines respetando calendario laboral configurable.
 * Usado por startWorkAction para computar workDeadline a partir de plazos
 * cotizados en días y/o horas.
 *
 * Reglas:
 * - businessDaysMask: bitmask, bit 0=Lun, 1=Mar, 2=Mié, 3=Jue, 4=Vie, 5=Sáb, 6=Dom.
 * - holidays: lista de fechas YYYY-MM-DD que se saltan igual que un día no laborable.
 * - business hours [startHour, endHour): un slot horario abierto a la izquierda.
 *   Ej: startHour=8, endHour=20 → la jornada cubre 12 h.
 */

export type BusinessCalendar = {
  /** Hora apertura, 0..23 */
  startHour: number;
  /** Hora cierre, 1..23, > startHour */
  endHour: number;
  /** Bitmask de días laborables. Default L-V = 31. */
  daysMask: number;
  /** Feriados en formato YYYY-MM-DD. Se saltan igual que un día no laborable. */
  holidays?: ReadonlySet<string> | readonly string[];
};

function holidaysSet(c: BusinessCalendar): ReadonlySet<string> {
  if (!c.holidays) return new Set();
  return c.holidays instanceof Set ? c.holidays : new Set(c.holidays);
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayBit(d: Date): number {
  // JS getDay(): 0=Dom..6=Sáb. Nuestra mask: bit 0=Lun..6=Dom.
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

export function isBusinessDay(d: Date, mask: number, holidays: ReadonlySet<string>): boolean {
  if (!((mask >> dayBit(d)) & 1)) return false;
  if (holidays.has(ymd(d))) return false;
  return true;
}

function nextBusinessDayStart(d: Date, cfg: BusinessCalendar, holidays: ReadonlySet<string>): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  next.setHours(cfg.startHour, 0, 0, 0);
  while (!isBusinessDay(next, cfg.daysMask, holidays)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function snapToBusinessWindow(d: Date, cfg: BusinessCalendar, holidays: ReadonlySet<string>): Date {
  const cursor = new Date(d);
  if (!isBusinessDay(cursor, cfg.daysMask, holidays)) {
    cursor.setHours(cfg.startHour, 0, 0, 0);
    while (!isBusinessDay(cursor, cfg.daysMask, holidays)) {
      cursor.setDate(cursor.getDate() + 1);
    }
    return cursor;
  }
  if (cursor.getHours() < cfg.startHour) {
    cursor.setHours(cfg.startHour, 0, 0, 0);
    return cursor;
  }
  if (cursor.getHours() >= cfg.endHour) {
    return nextBusinessDayStart(cursor, cfg, holidays);
  }
  return cursor;
}

/** Avanza N horas dentro del horario laboral, saltando segmentos fuera de ventana. */
export function addBusinessHours(start: Date, hours: number, cfg: BusinessCalendar): Date {
  if (hours <= 0) return new Date(start);
  const holidays = holidaysSet(cfg);
  let remainingMinutes = Math.round(hours * 60);
  let cursor = snapToBusinessWindow(new Date(start), cfg, holidays);

  while (remainingMinutes > 0) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(cfg.endHour, 0, 0, 0);
    const availableMinutes = Math.max(0, Math.floor((dayEnd.getTime() - cursor.getTime()) / 60000));

    if (remainingMinutes <= availableMinutes) {
      return new Date(cursor.getTime() + remainingMinutes * 60000);
    }
    remainingMinutes -= availableMinutes;
    cursor = nextBusinessDayStart(cursor, cfg, holidays);
  }
  return cursor;
}

/** Avanza N días hábiles. La hora resultante se fija en endHour del día final. */
export function addBusinessDays(start: Date, days: number, cfg: BusinessCalendar): Date {
  if (days <= 0) return new Date(start);
  const holidays = holidaysSet(cfg);
  const result = new Date(start);
  result.setHours(cfg.endHour, 0, 0, 0);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result, cfg.daysMask, holidays)) added++;
  }
  return result;
}

/**
 * Suma plazo mixto (días + horas). Para slots compuestos (ej. split integral con
 * diseño en horas y fabricación en días) el caller debe agregar TODAS las horas
 * en `hours` y TODOS los días en `days` antes de invocar. Primero se aplican los
 * días (que dejan el cursor en endHour del último día); luego las horas que
 * automáticamente saltan al siguiente día laboral.
 */
export function addBusinessTime(
  start: Date,
  turnaround: { days?: number; hours?: number },
  cfg: BusinessCalendar
): Date {
  let cursor = new Date(start);
  const days = turnaround.days ?? 0;
  const hours = turnaround.hours ?? 0;
  if (days > 0) cursor = addBusinessDays(cursor, days, cfg);
  if (hours > 0) cursor = addBusinessHours(cursor, hours, cfg);
  return cursor;
}

/** Default L-V, 08:00–20:00, sin feriados. Útil como fallback. */
export const DEFAULT_BUSINESS_CALENDAR: BusinessCalendar = {
  startHour: 8,
  endHour: 20,
  daysMask: 31,
  holidays: [],
};
