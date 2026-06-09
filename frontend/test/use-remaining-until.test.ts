/**
 * Unit — contrato de clamp de `useRemainingMsUntil` (auditoría H2).
 * El countdown de revisión del UCH detecta "vencido" como `remaining <= 0`; este
 * test fija la semántica de la que depende: deadline pasado ⇒ 0 (no negativo),
 * futuro ⇒ > 0, null/inválido ⇒ -1.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRemainingMsUntil } from '@/lib/hooks/useRemainingUntil';

describe('useRemainingMsUntil — clamp (H2)', () => {
  it('deadline pasado → 0 (clamp, no negativo)', () => {
    const { result } = renderHook(() => useRemainingMsUntil(Date.now() - 60_000, null));
    expect(result.current).toBe(0);
  });

  it('deadline futuro → positivo', () => {
    const { result } = renderHook(() => useRemainingMsUntil(Date.now() + 60_000, null));
    expect(result.current).toBeGreaterThan(0);
  });

  it('deadline null → -1', () => {
    const { result } = renderHook(() => useRemainingMsUntil(null, null));
    expect(result.current).toBe(-1);
  });
});
