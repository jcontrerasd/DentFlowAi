import { describe, expect, it } from 'vitest';
import { normalizeForGuard } from '@/lib/contactGuard/normalize';

describe('normalizeForGuard', () => {
  it('lowercases', () => {
    expect(normalizeForGuard('HOLA')).toBe('hola');
  });

  it('reemplaza "arroba" por @', () => {
    expect(normalizeForGuard('juan arroba mail.com')).toContain('@');
  });

  it('reemplaza " punto " por .', () => {
    expect(normalizeForGuard('juan@mail punto com')).toContain('.');
  });

  it('colapsa separadores en secuencias de dígitos', () => {
    expect(normalizeForGuard('+56 9 1234 5678')).toContain('+56912345678');
    expect(normalizeForGuard('9-1234-5678')).toContain('912345678');
  });

  it('mapea homoglifos cirílicos a latín', () => {
    // 'а' es cirílico (U+0430)
    expect(normalizeForGuard('whаtsapp')).toContain('whatsapp');
  });

  it('aplica leet básico solo entre letras', () => {
    expect(normalizeForGuard('wh4tsapp')).toContain('whatsapp');
    expect(normalizeForGuard('te1egram')).toContain('telegram');
    // No debe romper teléfonos
    expect(normalizeForGuard('12345678')).toContain('12345678');
  });

  it('devuelve string vacío para input falsy', () => {
    expect(normalizeForGuard('')).toBe('');
  });
});
