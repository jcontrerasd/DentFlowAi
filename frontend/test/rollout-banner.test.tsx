/**
 * UI — RolloutBanner (v5.0, Fase 7). Gating por `enabled` + dismiss con cookie.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getMyAvailabilityStatusAction = vi.fn();
vi.mock('@/lib/db/actions/availability', () => ({
  getMyAvailabilityStatusAction: (...a: unknown[]) => getMyAvailabilityStatusAction(...a),
}));

import RolloutBanner from '@/components/availability/RolloutBanner';

function clearCookies() {
  for (const c of document.cookie.split('; ')) {
    const name = c.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

describe('RolloutBanner (Fase 7)', () => {
  beforeEach(() => {
    clearCookies();
    getMyAvailabilityStatusAction.mockReset().mockResolvedValue({ success: true, enabled: true });
  });

  it('se muestra cuando enabled y sin cookie', async () => {
    render(<RolloutBanner />);
    await screen.findByTestId('rollout-banner');
  });

  it('no se muestra cuando la action devuelve enabled=false', async () => {
    getMyAvailabilityStatusAction.mockResolvedValue({ success: true, enabled: false });
    render(<RolloutBanner />);
    await waitFor(() => expect(getMyAvailabilityStatusAction).toHaveBeenCalled());
    expect(screen.queryByTestId('rollout-banner')).toBeNull();
  });

  it('descartar setea cookie y oculta el banner', async () => {
    render(<RolloutBanner />);
    await screen.findByTestId('rollout-banner');
    fireEvent.click(screen.getByTestId('rollout-banner-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('rollout-banner')).toBeNull());
    expect(document.cookie).toContain('availability_banner_dismissed=1');
  });

  it('no se muestra si la cookie de descarte ya existe', async () => {
    document.cookie = 'availability_banner_dismissed=1; path=/';
    render(<RolloutBanner />);
    // No debe siquiera consultar la action.
    await waitFor(() => expect(getMyAvailabilityStatusAction).not.toHaveBeenCalled());
    expect(screen.queryByTestId('rollout-banner')).toBeNull();
  });
});
