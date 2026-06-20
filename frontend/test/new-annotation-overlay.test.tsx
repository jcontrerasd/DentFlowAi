import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NewAnnotationOverlay from '@/components/cases/NewAnnotationOverlay';

const baseProps = {
  value: '',
  onChange: () => {},
  onCancel: () => {},
  onSave: () => {},
};

describe('NewAnnotationOverlay', () => {
  it('usa el copy del contexto de entrega', () => {
    render(<NewAnnotationOverlay {...baseProps} context="deliveryAdjustment" />);
    expect(screen.getByPlaceholderText('Describe el ajuste necesario…')).toBeInTheDocument();
  });

  it('usa el copy del contexto de creación de caso', () => {
    render(<NewAnnotationOverlay {...baseProps} context="caseCreation" />);
    expect(screen.getByPlaceholderText('Tu observación aquí…')).toBeInTheDocument();
  });

  it('enfoca el textarea al montar (sin pinchar la caja)', async () => {
    render(<NewAnnotationOverlay {...baseProps} context="caseCreation" />);
    const textarea = screen.getByPlaceholderText('Tu observación aquí…');
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('Guardar deshabilitado con texto vacío y habilitado con texto', () => {
    const { rerender } = render(<NewAnnotationOverlay {...baseProps} context="caseCreation" value="" />);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    rerender(<NewAnnotationOverlay {...baseProps} context="caseCreation" value="ajustar borde" />);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  it('Escape llama onCancel', () => {
    const onCancel = vi.fn();
    render(<NewAnnotationOverlay {...baseProps} context="caseCreation" onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByPlaceholderText('Tu observación aquí…'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('Cmd/Ctrl+Enter guarda cuando hay texto', () => {
    const onSave = vi.fn();
    render(<NewAnnotationOverlay {...baseProps} context="deliveryAdjustment" value="texto" onSave={onSave} />);
    fireEvent.keyDown(screen.getByPlaceholderText('Describe el ajuste necesario…'), { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledOnce();
  });
});
