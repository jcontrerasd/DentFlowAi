import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isAvailabilityAdminPanelEnabled,
  isAvailabilityEnabled,
  isAvailabilityUiTecnicoEnabled,
  isLeagueEngineEnabled,
  isPoolPendienteEnabled,
  isRejectionIndividualEnabled,
} from '@/lib/constants/availabilityFlags';

const FLAG_VARS = [
  'AVAILABILITY_MODEL_ENABLED',
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
  });

  afterEach(() => {
    for (const k of FLAG_VARS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it('todos los flags retornan false por default (sin env vars)', () => {
    expect(isAvailabilityEnabled()).toBe(false);
    expect(isAvailabilityUiTecnicoEnabled()).toBe(false);
    expect(isAvailabilityAdminPanelEnabled()).toBe(false);
    expect(isRejectionIndividualEnabled()).toBe(false);
    expect(isPoolPendienteEnabled()).toBe(false);
    expect(isLeagueEngineEnabled()).toBe(false);
  });

  it('cada flag retorna true solo cuando su env var es exactamente "true"', () => {
    process.env.AVAILABILITY_MODEL_ENABLED = 'true';
    process.env.AVAILABILITY_UI_TECNICO_ENABLED = 'true';
    process.env.AVAILABILITY_ADMIN_PANEL_ENABLED = 'true';
    process.env.REJECTION_INDIVIDUAL_ENABLED = 'true';
    process.env.POOL_PENDIENTE_ENABLED = 'true';
    process.env.LEAGUE_ENGINE_ENABLED = 'true';

    expect(isAvailabilityEnabled()).toBe(true);
    expect(isAvailabilityUiTecnicoEnabled()).toBe(true);
    expect(isAvailabilityAdminPanelEnabled()).toBe(true);
    expect(isRejectionIndividualEnabled()).toBe(true);
    expect(isPoolPendienteEnabled()).toBe(true);
    expect(isLeagueEngineEnabled()).toBe(true);
  });

  it('valores truthy distintos a "true" no activan el flag (no acepta "1", "yes", "TRUE")', () => {
    for (const value of ['1', 'yes', 'TRUE', 'True', 'on']) {
      process.env.AVAILABILITY_MODEL_ENABLED = value;
      expect(isAvailabilityEnabled()).toBe(false);
    }
  });

  it('los flags son independientes entre sí', () => {
    process.env.AVAILABILITY_MODEL_ENABLED = 'true';

    expect(isAvailabilityEnabled()).toBe(true);
    expect(isAvailabilityUiTecnicoEnabled()).toBe(false);
    expect(isAvailabilityAdminPanelEnabled()).toBe(false);
    expect(isRejectionIndividualEnabled()).toBe(false);
    expect(isPoolPendienteEnabled()).toBe(false);
  });
});
