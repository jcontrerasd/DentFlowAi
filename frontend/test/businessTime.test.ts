import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  addBusinessHours,
  addBusinessTime,
  isBusinessDay,
  ymd,
  type BusinessCalendar,
} from '@/lib/businessTime';

const LV_8_20: BusinessCalendar = { startHour: 8, endHour: 20, daysMask: 31, holidays: [] };
const LV_9_18: BusinessCalendar = { startHour: 9, endHour: 18, daysMask: 31, holidays: [] };
const L_SAT_8_20: BusinessCalendar = { startHour: 8, endHour: 20, daysMask: 63, holidays: [] };
// Lunes a Domingo (todos), 24h efectivos => 00..23 no representable con start<end estricto,
// pero usamos 0..23 para "el día entero salvo el último segundo".
const ALL_DAYS: BusinessCalendar = { startHour: 0, endHour: 23, daysMask: 127, holidays: [] };

// 2026-05-25 es Lunes.
const MON = new Date('2026-05-25T10:00:00');
const FRI = new Date('2026-05-29T16:00:00');
const SAT = new Date('2026-05-30T10:00:00');

describe('ymd', () => {
  it('formatea YYYY-MM-DD en zona local', () => {
    expect(ymd(new Date('2026-09-18T10:00:00'))).toBe('2026-09-18');
  });
});

describe('isBusinessDay', () => {
  it('lunes a viernes con mask default', () => {
    expect(isBusinessDay(MON, 31, new Set())).toBe(true);
    expect(isBusinessDay(FRI, 31, new Set())).toBe(true);
    expect(isBusinessDay(SAT, 31, new Set())).toBe(false);
  });

  it('sábado habilitado vía mask 63', () => {
    expect(isBusinessDay(SAT, 63, new Set())).toBe(true);
  });

  it('feriado anula día laborable', () => {
    const holidays = new Set([ymd(MON)]);
    expect(isBusinessDay(MON, 31, holidays)).toBe(false);
  });
});

describe('addBusinessHours', () => {
  it('+3 horas dentro de la misma jornada', () => {
    // Lun 10:00 + 3h, ventana 08-20 → Lun 13:00
    const r = addBusinessHours(MON, 3, LV_8_20);
    expect(r.getHours()).toBe(13);
    expect(r.getDate()).toBe(25);
  });

  it('cruza fin de ventana al día siguiente', () => {
    // Lun 19:00 + 3h, ventana 09-18 → snap a Mar 09:00 + 3h = Mar 12:00
    const start = new Date('2026-05-25T19:00:00');
    const r = addBusinessHours(start, 3, LV_9_18);
    expect(r.getDate()).toBe(26);
    expect(r.getHours()).toBe(12);
  });

  it('cruza fin de semana con default L-V', () => {
    // Vie 16:00 + 6h, ventana 08-20 → 4h Vie (hasta 20:00) + 2h Lun (08→10) = Lun 10:00
    const r = addBusinessHours(FRI, 6, LV_8_20);
    expect(r.getDay()).toBe(1); // Lunes
    expect(r.getHours()).toBe(10);
  });

  it('respeta sábado habilitado', () => {
    // Vie 18:00 + 4h, ventana 08-20, L-S → 2h Vie + 2h Sáb (08→10) = Sáb 10:00
    const start = new Date('2026-05-29T18:00:00');
    const r = addBusinessHours(start, 4, L_SAT_8_20);
    expect(r.getDay()).toBe(6); // Sábado
    expect(r.getHours()).toBe(10);
  });

  it('salta feriado en medio', () => {
    // Lun 25 19:00 + 3h, ventana 09-18, feriado Mar 26 → 0h Lun (fuera ventana, snap a Mié 09:00) + 3h = Mié 12:00
    const start = new Date('2026-05-25T19:00:00');
    const cfg: BusinessCalendar = { ...LV_9_18, holidays: ['2026-05-26'] };
    const r = addBusinessHours(start, 3, cfg);
    expect(r.getDate()).toBe(27); // Miércoles
    expect(r.getHours()).toBe(12);
  });

  it('inicio antes de startHour snap al inicio de jornada', () => {
    // Lun 06:00 + 2h, ventana 08-20 → Lun 10:00
    const start = new Date('2026-05-25T06:00:00');
    const r = addBusinessHours(start, 2, LV_8_20);
    expect(r.getHours()).toBe(10);
    expect(r.getDate()).toBe(25);
  });

  it('inicio en sábado con default L-V se mueve a lunes', () => {
    // Sáb 10:00 + 2h, default L-V 08-20 → Lun 10:00
    const r = addBusinessHours(SAT, 2, LV_8_20);
    expect(r.getDay()).toBe(1);
    expect(r.getHours()).toBe(10);
  });
});

describe('addBusinessDays', () => {
  it('+1 día hábil desde lunes → martes endHour', () => {
    const r = addBusinessDays(MON, 1, LV_8_20);
    expect(r.getDate()).toBe(26);
    expect(r.getHours()).toBe(20);
  });

  it('+3 días hábiles desde viernes saltando fin de semana', () => {
    // Vie 16:00 + 3 días hábiles → Lun, Mar, Mié → Mié 20:00
    const r = addBusinessDays(FRI, 3, LV_8_20);
    expect(r.getDay()).toBe(3); // Miércoles
  });

  it('feriado lunes salta a martes', () => {
    // Vie 29 + 1 día hábil con feriado Lun 1-jun (2026-06-01 es Lunes) → Mar 2-jun
    const cfg: BusinessCalendar = { ...LV_8_20, holidays: ['2026-06-01'] };
    const r = addBusinessDays(FRI, 1, cfg);
    expect(ymd(r)).toBe('2026-06-02');
  });
});

describe('addBusinessTime (combinado días + horas)', () => {
  it('solo días', () => {
    const r = addBusinessTime(MON, { days: 1 }, LV_8_20);
    expect(r.getDate()).toBe(26);
  });

  it('solo horas', () => {
    const r = addBusinessTime(MON, { hours: 2 }, LV_8_20);
    expect(r.getHours()).toBe(12);
  });

  it('mixto: 1 día (=12h jornada) + 2 horas se acumulan como horas laborales', () => {
    // Lun 10:00 + (12+2)=14h. Lun 10→20 = 10h; restan 4h → Mar 08:00 + 4h = Mar 12:00.
    const r = addBusinessTime(MON, { days: 1, hours: 2 }, LV_8_20);
    expect(r.getDate()).toBe(26);
    expect(r.getHours()).toBe(12);
  });
});
