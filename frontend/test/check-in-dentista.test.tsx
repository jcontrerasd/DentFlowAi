/**
 * UI — CheckInDentistaModal (v5.0, Fase 6). Seguir buscando vs Cancelar publicación.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const cancelPendingPoolAction = vi.fn();
vi.mock('@/lib/db/actions/poolQueue', () => ({
  cancelPendingPoolAction: (...a: unknown[]) => cancelPendingPoolAction(...a),
}));
vi.mock('@/components/ui/FocusTrap', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import CheckInDentistaModal from '@/components/cases/CheckInDentistaModal';

describe('CheckInDentistaModal (Fase 6)', () => {
  beforeEach(() => {
    cancelPendingPoolAction.mockReset().mockResolvedValue({ success: true });
  });

  it('"Seguir buscando" cierra sin mutar', () => {
    const onClose = vi.fn();
    render(<CheckInDentistaModal isOpen caseId="c1" onClose={onClose} onCancelled={() => {}} />);
    fireEvent.click(screen.getByTestId('checkin-keep'));
    expect(onClose).toHaveBeenCalled();
    expect(cancelPendingPoolAction).not.toHaveBeenCalled();
  });

  it('"Cancelar publicación" llama la action y onCancelled', async () => {
    const onCancelled = vi.fn();
    render(<CheckInDentistaModal isOpen caseId="c5" onClose={() => {}} onCancelled={onCancelled} />);
    fireEvent.click(screen.getByTestId('checkin-cancel'));
    await waitFor(() => expect(cancelPendingPoolAction).toHaveBeenCalledWith('c5'));
    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
  });
});
