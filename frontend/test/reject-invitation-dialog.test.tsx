/**
 * UI — UchRejectInvitationDialog (v5.0, Fase 5).
 * Verifica que el selector se pobla desde el catálogo y que "Otro" exige comentario.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const listActiveCatalogOptionsAction = vi.fn();
const rejectInvitationIndividualAction = vi.fn();

vi.mock('@/lib/db/actions/catalogs', () => ({
  listActiveCatalogOptionsAction: (...args: unknown[]) => listActiveCatalogOptionsAction(...args),
}));
vi.mock('@/lib/db/actions/rejection', () => ({
  rejectInvitationIndividualAction: (...args: unknown[]) => rejectInvitationIndividualAction(...args),
}));
vi.mock('@/components/ui/FocusTrap', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import UchRejectInvitationDialog from '@/components/cases/uch/UchRejectInvitationDialog';

const OPTIONS = [
  { id: 'r1', code: 'rej_001', label: 'Sin capacidad ahora', sortOrder: 1, isActive: true },
  { id: 'r7', code: 'rej_007', label: 'Otro', sortOrder: 7, isActive: true },
];

describe('UchRejectInvitationDialog (Fase 5)', () => {
  beforeEach(() => {
    listActiveCatalogOptionsAction.mockReset().mockResolvedValue(OPTIONS);
    rejectInvitationIndividualAction.mockReset().mockResolvedValue({ success: true, replacementSent: true });
  });

  it('pobla el selector desde invitation_rejection_reason', async () => {
    render(
      <UchRejectInvitationDialog isOpen invitationId="inv-1" onClose={() => {}} onRejected={() => {}} />,
    );
    await waitFor(() => expect(listActiveCatalogOptionsAction).toHaveBeenCalledWith('invitation_rejection_reason'));
    await screen.findByText('Sin capacidad ahora');
    expect(screen.getByText('Otro')).toBeTruthy();
  });

  it('motivo "Otro" exige comentario antes de habilitar el botón', async () => {
    render(
      <UchRejectInvitationDialog isOpen invitationId="inv-1" onClose={() => {}} onRejected={() => {}} />,
    );
    await screen.findByText('Otro');
    fireEvent.change(screen.getByTestId('uch-reject-reason-select'), { target: { value: 'r7' } });
    expect((screen.getByTestId('uch-reject-confirm') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('uch-reject-comment'), { target: { value: 'Detalle' } });
    await waitFor(() =>
      expect((screen.getByTestId('uch-reject-confirm') as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('confirma rechazo con motivo simple y propaga replacementSent', async () => {
    const onRejected = vi.fn();
    render(
      <UchRejectInvitationDialog isOpen invitationId="inv-9" onClose={() => {}} onRejected={onRejected} />,
    );
    await screen.findByText('Sin capacidad ahora');
    fireEvent.change(screen.getByTestId('uch-reject-reason-select'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByTestId('uch-reject-confirm'));
    await waitFor(() =>
      expect(rejectInvitationIndividualAction).toHaveBeenCalledWith('inv-9', 'r1', undefined),
    );
    await waitFor(() => expect(onRejected).toHaveBeenCalledWith(true));
  });
});
