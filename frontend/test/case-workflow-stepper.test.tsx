import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CaseWorkflowStepper from '@/components/cases/CaseWorkflowStepper';

describe('CaseWorkflowStepper', () => {
  it('variante techRejected: último paso Rechazado y sin subtítulo Entrega aunque haya workDeadline', () => {
    render(
      <CaseWorkflowStepper
        currentStatus="enRevision"
        workDeadline={new Date('2028-05-12T12:00:00.000Z')}
        variant="techRejected"
      />,
    );
    const root = screen.getByTestId('case-workflow-stepper');
    expect(within(root).getAllByText(/^rechazado$/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/entrega:/i)).not.toBeInTheDocument();
  });

  it('variante techRejected: conectores rose usan rojo semitransparente; paso Rechazado círculo sólido', () => {
    const { container } = render(
      <CaseWorkflowStepper
        currentStatus="enRevision"
        variant="techRejected"
      />,
    );
    const connectors = container.querySelectorAll('.h-px.flex-1');
    expect([...connectors].some((el) => el.className.includes('error'))).toBe(true);
    const rechazado = screen.getByText(/^rechazado$/i);
    const terminalCircle = rechazado.parentElement?.querySelector('.rounded-full');
    expect(terminalCircle?.className).toContain('bg-error text-inverse');
  });

  it('variante techRejected: tramo propuesta–diseño usa círculos rose suaves (no sólidos como el terminal)', () => {
    render(
      <CaseWorkflowStepper
        currentStatus="enRevision"
        variant="techRejected"
      />,
    );
    const propuesta = screen.getByText('Propuesta lista');
    const circle = propuesta.parentElement?.querySelector('.rounded-full');
    expect(circle?.className).toMatch(/error-hl/);
    expect(circle?.className).toMatch(/ring-error\/30/);
  });

  it('variante techRejected: expone data-variant para inspección en DevTools', () => {
    render(
      <CaseWorkflowStepper
        currentStatus="enRevision"
        variant="techRejected"
      />,
    );
    expect(screen.getByTestId('case-workflow-stepper')).toHaveAttribute('data-variant', 'techRejected');
  });

  it('variante case: expone data-variant case y muestra fecha de entrega en ejecución', () => {
    render(
      <CaseWorkflowStepper
        currentStatus="enEjecucion"
        workDeadline={new Date('2028-05-12T12:00:00.000Z')}
        variant="case"
      />,
    );
    expect(screen.getByText(/entrega:/i)).toBeInTheDocument();
    expect(screen.getByTestId('case-workflow-stepper')).toHaveAttribute('data-variant', 'case');
  });

  it('aceptadaPendienteInicio con variant case: no muestra paso terminal Rechazado', () => {
    render(
      <CaseWorkflowStepper
        currentStatus="aceptadaPendienteInicio"
        variant="case"
      />,
    );
    expect(screen.getByText('Esperando inicio')).toBeInTheDocument();
    expect(screen.queryByText('Rechazado')).not.toBeInTheDocument();
    expect(screen.getByTestId('case-workflow-stepper')).toHaveAttribute('data-variant', 'case');
  });

  it('aceptadaPendienteInicio: hito actual en Esperando inicio (camelCase no se pierde)', () => {
    render(
      <CaseWorkflowStepper
        currentStatus="aceptadaPendienteInicio"
        variant="case"
      />,
    );
    const esperando = screen.getByText('Esperando inicio');
    const circle = esperando.parentElement?.querySelector('.rounded-full');
    expect(circle?.className).toMatch(/ring-primary/);
    const borrador = screen.getByText('Borrador');
    const borradorCircle = borrador.parentElement?.querySelector('.rounded-full');
    expect(borradorCircle?.className).toContain('bg-primary');
  });

  describe('solo_diseno — estados terminales', () => {
    it('solo diseño rechazado: sin pasos de fabricación, paso Rechazado en rojo', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="rechazado"
          variant="case"
        />,
      );
      expect(screen.queryByText('En fabricación')).not.toBeInTheDocument();
      expect(screen.queryByText('Enviado')).not.toBeInTheDocument();
      const rechazados = screen.getAllByText(/^rechazado$/i);
      expect(rechazados.length).toBeGreaterThanOrEqual(1);
    });

    it('completado: el hito final muestra check teal, no reloj de paso en curso', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="completado"
          variant="case"
        />,
      );
      const label = screen.getByText('Completado');
      const circle = label.parentElement?.querySelector('.rounded-full');
      expect(circle?.className).toContain('bg-primary');
      expect(circle?.querySelector('.lucide-circle-check-big')).toBeTruthy();
      expect(circle?.querySelector('.lucide-clock')).toBeFalsy();
    });
  });
});
