import { describe, it, expect } from 'vitest';
import {
  DESIRED_DELIVERY_EMPTY_LABEL,
  formatDesiredDeliveryCompact,
  formatDesiredDeliveryForSummary,
  getDesiredDeliveryDisplay,
  resolveClonedDesiredDeliveryAt,
  shouldShowDesiredDeliveryInUch,
  shouldShowListPriceToViewer,
} from '@/lib/cases/caseDeliveryPresentation';

const SAMPLE_LOCAL = '2026-06-14T18:30';

describe('caseDeliveryPresentation', () => {
  it('formatDesiredDeliveryCompact produce texto corto', () => {
    const compact = formatDesiredDeliveryCompact(SAMPLE_LOCAL);
    expect(compact).toMatch(/14/);
    expect(compact).toMatch(/18:30/);
    expect(compact).toContain('·');
  });

  it('getDesiredDeliveryDisplay sin valor', () => {
    expect(getDesiredDeliveryDisplay({ desiredDeliveryAt: null })).toEqual({
      full: '',
      compact: '',
      hasValue: false,
    });
  });

  it('getDesiredDeliveryDisplay con valor', () => {
    const d = getDesiredDeliveryDisplay({ desiredDeliveryAt: SAMPLE_LOCAL });
    expect(d.hasValue).toBe(true);
    expect(d.full).toContain('antes de las');
    expect(d.compact.length).toBeGreaterThan(0);
  });

  it('formatDesiredDeliveryForSummary usa fallback unificado', () => {
    expect(formatDesiredDeliveryForSummary(null)).toBe(DESIRED_DELIVERY_EMPTY_LABEL);
    expect(formatDesiredDeliveryForSummary(SAMPLE_LOCAL)).toContain('antes de las');
  });

  it('shouldShowListPriceToViewer oculta precio al técnico', () => {
    expect(shouldShowListPriceToViewer({ role: 'tecnico' })).toBe(false);
    expect(shouldShowListPriceToViewer({ role: 'dentista' })).toBe(true);
    expect(shouldShowListPriceToViewer({ role: 'tecnico', viewingAsAdmin: true })).toBe(true);
  });

  it('shouldShowDesiredDeliveryInUch en fases pre-ejecución sin workDeadline', () => {
    expect(shouldShowDesiredDeliveryInUch('enEvaluacion', null)).toBe(true);
    expect(shouldShowDesiredDeliveryInUch('propuestaLista', null)).toBe(true);
    expect(shouldShowDesiredDeliveryInUch('enEjecucion', null)).toBe(false);
    expect(shouldShowDesiredDeliveryInUch('enEvaluacion', new Date())).toBe(false);
  });

  it('resolveClonedDesiredDeliveryAt usa origen futuro', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const result = resolveClonedDesiredDeliveryAt(future);
    expect(result.getTime()).toBe(future.getTime());
  });

  it('resolveClonedDesiredDeliveryAt usa default si origen pasado', () => {
    const past = new Date('2020-01-01T12:00:00');
    const result = resolveClonedDesiredDeliveryAt(past);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });
});
