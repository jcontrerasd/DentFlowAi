import { describe, expect, it } from 'vitest';
import { detectPhones, ALL_SUPPORTED_COUNTRY_CODES } from '@/lib/contactGuard/phonePatterns';
import { normalizeForGuard } from '@/lib/contactGuard/normalize';

/** Helper: normaliza como lo hace el motor antes de detectar. */
const det = (raw: string, countries: string[]) => detectPhones(normalizeForGuard(raw), countries);

describe('detectPhones — country-aware', () => {
  it('detecta móvil CL local (9 + 8 dígitos)', () => {
    expect(det('mi numero 9 8765 4321', ['CL']).length).toBeGreaterThan(0);
  });

  it('detecta móvil CL con código de país sin +', () => {
    expect(det('56 9 8765 4321', ['CL']).length).toBeGreaterThan(0);
  });

  it('detecta formato internacional con + (cualquier país)', () => {
    expect(det('+56 9 1234 5678', []).length).toBeGreaterThan(0);
    expect(det('+1 415 555 1234', []).length).toBeGreaterThan(0);
  });

  it('detecta móvil CO (3XX + 7 dígitos)', () => {
    expect(det('3001234567', ['CO']).length).toBeGreaterThan(0);
  });

  it('detecta móvil BR (DDD + 9 + 8 dígitos)', () => {
    expect(det('11987654321', ['BR']).length).toBeGreaterThan(0);
  });

  it('NO detecta el móvil CL si el país involucrado no es CL', () => {
    // 987654321 sólo calza el patrón local CL/PE/EC; con AR involucrado no debe disparar.
    expect(det('987654321', ['AR']).length).toBe(0);
  });

  it('NO detecta una fecha colapsada (12052024)', () => {
    expect(det('entrega 12-05-2024', ALL_SUPPORTED_COUNTRY_CODES).length).toBe(0);
  });

  it('NO detecta un precio CLP (15000000)', () => {
    expect(det('presupuesto $15.000.000', ALL_SUPPORTED_COUNTRY_CODES).length).toBe(0);
  });

  it('NO detecta un código de seguimiento de 12 dígitos (corrida larga)', () => {
    // 123456789012 no calza ningún patrón anclado (bordes no-dígito) ni siquiera con todos los países.
    expect(det('123456789012', ALL_SUPPORTED_COUNTRY_CODES).length).toBe(0);
  });

  it('fusiona el solapamiento intl + local en una sola violación', () => {
    const r = det('+56912345678', ['CL']);
    expect(r.length).toBe(1);
  });

  it('texto vacío no produce matches', () => {
    expect(detectPhones('', ['CL']).length).toBe(0);
  });
});
