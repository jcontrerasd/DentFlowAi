/**
 * UI — ResponseStatusStepper (v5.0, Fase 4). Pure component, sin DB.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResponseStatusStepper from '@/components/availability/ResponseStatusStepper';

describe('ResponseStatusStepper', () => {
  it('siempre muestra los 3 nodos', () => {
    render(<ResponseStatusStepper level={0} count={0} nextExitDate={null} />);
    expect(screen.getByText('Nivel 1')).toBeTruthy();
    expect(screen.getByText('Nivel 2')).toBeTruthy();
    expect(screen.getByText('Nivel 3')).toBeTruthy();
  });

  it('nivel 0 muestra mensaje limpio sin próxima salida', () => {
    render(<ResponseStatusStepper level={0} count={0} nextExitDate={null} />);
    expect(screen.getByText(/Sin no-respuestas/i)).toBeTruthy();
    expect(screen.queryByText(/Próxima salida/i)).toBeNull();
  });

  it('nivel 2 muestra el conteo y la próxima salida de ventana', () => {
    const exit = new Date(Date.now() + 4 * 86_400_000);
    render(<ResponseStatusStepper level={2} count={2} nextExitDate={exit} />);
    // "Nivel 2" aparece en el header y en el nodo del stepper.
    expect(screen.getAllByText('Nivel 2').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Próxima salida de ventana/i)).toBeTruthy();
  });
});
