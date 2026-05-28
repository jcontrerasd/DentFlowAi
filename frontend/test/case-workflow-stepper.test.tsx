import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CaseWorkflowStepper from '@/components/cases/CaseWorkflowStepper';

describe('CaseWorkflowStepper', () => {
  it('variante techRejected: último paso Rechazado y sin subtítulo Entrega aunque haya workDeadline', () => {
    render(
      <CaseWorkflowStepper
        currentStatus="enRevision"
        serviceType="diseno"
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
        serviceType="diseno"
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
        serviceType="diseno"
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
        serviceType="diseno"
        variant="techRejected"
      />,
    );
    expect(screen.getByTestId('case-workflow-stepper')).toHaveAttribute('data-variant', 'techRejected');
  });

  it('variante case: expone data-variant case', () => {
    render(
      <CaseWorkflowStepper
        currentStatus="enEjecucion"
        serviceType="diseno"
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
        serviceType="solo_diseno"
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
        serviceType="solo_fabricacion"
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

  // ─── Fase 2 — Integral rechazado: fabricación en rosa ──────────────────────
  describe('integral rechazado (variante case)', () => {
    it('pinta pasos de fabricación en rosa cuando integral termina en rechazado', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="rechazado"
          serviceType="integral"
          variant="case"
        />,
      );
      const enFabricacion = screen.getByText('En fabricación');
      const enviado = screen.getByText('Enviado');
      const fabCircle = enFabricacion.parentElement?.querySelector('.rounded-full');
      const envCircle = enviado.parentElement?.querySelector('.rounded-full');
      expect(fabCircle?.className).toMatch(/error-hl/);
      expect(envCircle?.className).toMatch(/error-hl/);
    });

    it('último paso "Rechazado" se renderiza con XCircle y fondo rojo', () => {
      const { container } = render(
        <CaseWorkflowStepper
          currentStatus="rechazado"
          serviceType="integral"
          variant="case"
        />,
      );
      const rechazado = screen.getAllByText(/^rechazado$/i).at(-1);
      const circle = rechazado?.parentElement?.querySelector('.rounded-full');
      expect(circle?.className).toContain('bg-error text-inverse');
      // Verifica presencia de algún conector rosa entre la banda terminal
      const connectors = container.querySelectorAll('.h-px.flex-1');
      expect([...connectors].some((el) => el.className.includes('error'))).toBe(true);
    });

    it('solo diseño rechazado mantiene comportamiento previo (sin fabricación visible)', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="rechazado"
          serviceType="diseno"
          variant="case"
        />,
      );
      expect(screen.queryByText('En fabricación')).not.toBeInTheDocument();
      expect(screen.queryByText('Enviado')).not.toBeInTheDocument();
    });

    it('integral completado mantiene comportamiento previo (sin rosa)', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="completado"
          serviceType="integral"
          variant="case"
        />,
      );
      const enFabricacion = screen.getByText('En fabricación');
      const circle = enFabricacion.parentElement?.querySelector('.rounded-full');
      expect(circle?.className).not.toMatch(/error-hl/);
    });

    it('completado: el hito final muestra check teal, no reloj de paso en curso', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="completado"
          serviceType="solo_diseno"
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

  // ─── Fase 3.4 — solo_fabricacion: stepper salta diseño ────────────────────
  describe('solo_fabricacion (variante case)', () => {
    it('solo_fabricacion + techRejected: sin pasos de diseño; banda rosa desde comparativa hasta envío', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="propuestaLista"
          serviceType="solo_fabricacion"
          variant="techRejected"
        />,
      );
      expect(screen.queryByText('En ejecución')).not.toBeInTheDocument();
      expect(screen.queryByText('En revisión')).not.toBeInTheDocument();
      expect(screen.queryByText('Diseño aprobado')).not.toBeInTheDocument();
      const propuesta = screen.getByText('Propuesta lista');
      const circle = propuesta.parentElement?.querySelector('.rounded-full');
      expect(circle?.className).toMatch(/error-hl/);
    });

    it('solo_fabricacion + techRejected: fabricación y enviado en rosa (banda de pérdida)', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="propuestaLista"
          serviceType="solo_fabricacion"
          variant="techRejected"
        />,
      );
      const fab = screen.getByText('En fabricación');
      const env = screen.getByText('Enviado');
      expect(fab.parentElement?.querySelector('.rounded-full')?.className).toMatch(/error-hl/);
      expect(env.parentElement?.querySelector('.rounded-full')?.className).toMatch(/error-hl/);
    });

    it('omite los pasos En ejecución / En revisión / Diseño aprobado', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="enFabricacion"
          serviceType="solo_fabricacion"
          variant="case"
        />,
      );
      expect(screen.queryByText('En ejecución')).not.toBeInTheDocument();
      expect(screen.queryByText('En revisión')).not.toBeInTheDocument();
      expect(screen.queryByText('Diseño aprobado')).not.toBeInTheDocument();
      expect(screen.getByText('En fabricación')).toBeInTheDocument();
      expect(screen.getByText('Enviado')).toBeInTheDocument();
      expect(screen.getByText('Completado')).toBeInTheDocument();
    });

    it('rechazado en solo_fabricacion pinta fabricación en rosa', () => {
      render(
        <CaseWorkflowStepper
          currentStatus="rechazado"
          serviceType="solo_fabricacion"
          variant="case"
        />,
      );
      const enFabricacion = screen.getByText('En fabricación');
      const enviado = screen.getByText('Enviado');
      expect(enFabricacion.parentElement?.querySelector('.rounded-full')?.className).toMatch(/error-hl/);
      expect(enviado.parentElement?.querySelector('.rounded-full')?.className).toMatch(/error-hl/);
    });
  });
});
