/**
 * Unit — lib/constants/availabilityFlags.ts (v5.28). Los helpers delegan en
 * getFlag() (lib/featureFlags.ts), que cae a process.env cuando la tabla no
 * responde — se mockea la DB fallando para ejercitar ese fallback y así probar
 * los helpers de forma aislada, igual que en el modelo pre-v5.28.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => Promise.reject(new Error('sin DB en unit test')) }) },
}));
vi.mock('@/lib/db/schema', () => ({ featureFlag: {} }));

import {
  isAvailabilityAdminPanelEnabled,
  isAvailabilityUiTecnicoEnabled,
  isLeagueEngineEnabled,
  isPoolPendienteEnabled,
  isRejectionIndividualEnabled,
} from '@/lib/constants/availabilityFlags';

const FLAG_VARS = [
  'AVAILABILITY_UI_TECNICO_ENABLED',
  'AVAILABILITY_ADMIN_PANEL_ENABLED',
  'REJECTION_INDIVIDUAL_ENABLED',
  'POOL_PENDIENTE_ENABLED',
  'LEAGUE_ENGINE_ENABLED',
] as const;

describe('availabilityFlags', () => {
  let snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    snapshot = Object.fromEntries(FLAG_VARS.map((k) => [k, process.env[k]]));
    for (const k of FLAG_VARS) delete process.env[k];
    (global as any).__featureFlagCache = null;
  });

  afterEach(() => {
    for (const k of FLAG_VARS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it('todos los flags retornan false por default (sin env vars)', async () => {
    expect(await isAvailabilityUiTecnicoEnabled()).toBe(false);
    expect(await isAvailabilityAdminPanelEnabled()).toBe(false);
    expect(await isRejectionIndividualEnabled()).toBe(false);
    expect(await isPoolPendienteEnabled()).toBe(false);
    expect(await isLeagueEngineEnabled()).toBe(false);
  });

  it('cada flag retorna true solo cuando su env var es exactamente "true"', async () => {
    process.env.AVAILABILITY_UI_TECNICO_ENABLED = 'true';
    process.env.AVAILABILITY_ADMIN_PANEL_ENABLED = 'true';
    process.env.REJECTION_INDIVIDUAL_ENABLED = 'true';
    process.env.POOL_PENDIENTE_ENABLED = 'true';
    process.env.LEAGUE_ENGINE_ENABLED = 'true';

    expect(await isAvailabilityUiTecnicoEnabled()).toBe(true);
    expect(await isAvailabilityAdminPanelEnabled()).toBe(true);
    expect(await isRejectionIndividualEnabled()).toBe(true);
    expect(await isPoolPendienteEnabled()).toBe(true);
    expect(await isLeagueEngineEnabled()).toBe(true);
  });

  it('valores truthy distintos a "true" no activan el flag (no acepta "1", "yes", "TRUE")', async () => {
    for (const value of ['1', 'yes', 'TRUE', 'True', 'on']) {
      process.env.POOL_PENDIENTE_ENABLED = value;
      (global as any).__featureFlagCache = null;
      expect(await isPoolPendienteEnabled()).toBe(false);
    }
  });

  it('los flags son independientes entre sí', async () => {
    process.env.POOL_PENDIENTE_ENABLED = 'true';

    expect(await isPoolPendienteEnabled()).toBe(true);
    expect(await isAvailabilityUiTecnicoEnabled()).toBe(false);
    expect(await isAvailabilityAdminPanelEnabled()).toBe(false);
    expect(await isRejectionIndividualEnabled()).toBe(false);
  });
});
