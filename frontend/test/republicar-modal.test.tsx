/**
 * UI — RepublicarModal (v5.0, Fase 6). Doble confirmación + republicarCaseAction.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const republicarCaseAction = vi.fn();
vi.mock('@/lib/db/actions/cases', () => ({
  republicarCaseAction: (...a: unknown[]) => republicarCaseAction(...a),
}));
vi.mock('@/components/ui/FocusTrap', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import RepublicarModal from '@/components/cases/RepublicarModal';

describe('RepublicarModal (Fase 6)', () => {
  beforeEach(() => {
    republicarCaseAction.mockReset().mockResolvedValue({ success: true });
  });

  it('el botón queda deshabilitado hasta marcar el checkbox de entendimiento', async () => {
    render(<RepublicarModal isOpen caseId="c1" onClose={() => {}} onDone={() => {}} />);
    expect((screen.getByTestId('republicar-confirm') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('republicar-understood'));
    await waitFor(() =>
      expect((screen.getByTestId('republicar-confirm') as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('confirma → llama republicarCaseAction y onDone', async () => {
    const onDone = vi.fn();
    render(<RepublicarModal isOpen caseId="c9" onClose={() => {}} onDone={onDone} />);
    fireEvent.click(screen.getByTestId('republicar-understood'));
    fireEvent.click(screen.getByTestId('republicar-confirm'));
    await waitFor(() => expect(republicarCaseAction).toHaveBeenCalledWith('c9'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('error del server se muestra y no llama onDone', async () => {
    republicarCaseAction.mockResolvedValue({ success: false, error: 'Solo se puede republicar un caso sin cotizaciones' });
    const onDone = vi.fn();
    render(<RepublicarModal isOpen caseId="c2" onClose={() => {}} onDone={onDone} />);
    fireEvent.click(screen.getByTestId('republicar-understood'));
    fireEvent.click(screen.getByTestId('republicar-confirm'));
    await screen.findByText(/sin cotizaciones/i);
    expect(onDone).not.toHaveBeenCalled();
  });
});
