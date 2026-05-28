'use server';

import { db } from '@/lib/db';
import { fauchardHoliday } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import type { ActionResult } from '@/lib/types/actions';

export type FauchardHolidayRow = {
  id: string;
  holidayDate: string; // YYYY-MM-DD
  label: string;
  createdAt: string;
  createdBy: string | null;
};

/** Listado completo (usado por admin y por cálculo de deadline). */
export async function listHolidaysAction(): Promise<ActionResult<{ holidays: FauchardHolidayRow[] }>> {
  const rows = await db
    .select()
    .from(fauchardHoliday)
    .orderBy(asc(fauchardHoliday.holidayDate));
  return {
    success: true,
    holidays: rows.map((r) => ({
      id: r.id,
      holidayDate: String(r.holidayDate),
      label: r.label,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      createdBy: r.createdBy,
    })),
  };
}

/**
 * Helper interno (no exigir guard admin) usado por startWorkAction para alimentar
 * el cálculo del workDeadline. Retorna solo las fechas en formato YYYY-MM-DD.
 */
export async function listHolidayDatesGlobal(): Promise<string[]> {
  const rows = await db
    .select({ d: fauchardHoliday.holidayDate })
    .from(fauchardHoliday);
  return rows.map((r) => String(r.d));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createHolidayAction(
  holidayDate: string,
  label: string,
): Promise<ActionResult<{ holiday: FauchardHolidayRow }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'Solo admin' };

  const date = (holidayDate ?? '').trim();
  const labelTrim = (label ?? '').trim();
  if (!ISO_DATE.test(date)) return { success: false, error: 'Fecha inválida (YYYY-MM-DD)' };
  if (labelTrim.length < 1 || labelTrim.length > 120) {
    return { success: false, error: 'Nombre del feriado debe tener entre 1 y 120 caracteres' };
  }

  try {
    const [inserted] = await db
      .insert(fauchardHoliday)
      .values({ holidayDate: date, label: labelTrim, createdBy: identity.id })
      .returning();
    return {
      success: true,
      holiday: {
        id: inserted.id,
        holidayDate: String(inserted.holidayDate),
        label: inserted.label,
        createdAt: inserted.createdAt instanceof Date ? inserted.createdAt.toISOString() : String(inserted.createdAt),
        createdBy: inserted.createdBy,
      },
    };
  } catch (e: any) {
    if (String(e?.message || e).toLowerCase().includes('unique')) {
      return { success: false, error: 'Ya existe un feriado con esa fecha' };
    }
    return { success: false, error: String(e) };
  }
}

export async function deleteHolidayAction(id: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'Solo admin' };
  await db.delete(fauchardHoliday).where(eq(fauchardHoliday.id, id));
  return { success: true };
}
