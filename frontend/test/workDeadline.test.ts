import { describe, it, expect } from 'vitest';
import {
  deriveDeadlineDays,
  computeProposedDeliveryDays,
  resolveWorkDeadline,
  isCompletedOnTime,
} from '@/lib/cases/workDeadline';

describe('workDeadline helpers', () => {
  const published = new Date('2026-06-01T10:00:00.000Z');
  const desired = new Date('2026-06-10T18:00:00.000Z');

  it('deriveDeadlineDays cuenta días calendario desde un ancla', () => {
    expect(deriveDeadlineDays(desired, published.getTime())).toBe(10);
  });

  it('computeProposedDeliveryDays usa publishedAt como ancla', () => {
    expect(computeProposedDeliveryDays(published, desired)).toBe(10);
  });

  it('resolveWorkDeadline prioriza desiredDeliveryAt', () => {
    const deadline = resolveWorkDeadline({
      desiredDeliveryAt: desired,
      publishedAt: published,
      deadlineDays: 3,
    });
    expect(deadline.toISOString()).toBe(desired.toISOString());
  });

  it('resolveWorkDeadline cae a publishedAt + deadlineDays sin desiredDeliveryAt', () => {
    const deadline = resolveWorkDeadline({
      desiredDeliveryAt: null,
      publishedAt: published,
      deadlineDays: 5,
    });
    expect(deadline.getTime()).toBe(published.getTime() + 5 * 86_400_000);
  });

  it('isCompletedOnTime compara contra desiredDeliveryAt', () => {
    expect(isCompletedOnTime('2026-06-09T12:00:00.000Z', desired, published, null)).toBe(true);
    expect(isCompletedOnTime('2026-06-11T12:00:00.000Z', desired, published, null)).toBe(false);
  });

  it('isCompletedOnTime usa ventana publishedAt + deadlineDays sin desiredDeliveryAt', () => {
    expect(isCompletedOnTime('2026-06-05T12:00:00.000Z', null, published, 5)).toBe(true);
    expect(isCompletedOnTime('2026-06-08T12:00:00.000Z', null, published, 5)).toBe(false);
  });
});
