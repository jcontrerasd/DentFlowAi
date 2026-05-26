import { describe, expect, it } from 'vitest';
import { statusIcon, statusLabel } from '@/components/ui/StatusBadge';
import {
  getDentistKpiFichaPresentation,
  getTechKpiFichaPresentation,
  TECH_FICHA_STRIPE,
} from '@/lib/cases/caseFichaStatusPresentation';
import { DENTIST_DASHBOARD_METRICS, TECH_DASHBOARD_METRICS } from '@/lib/dashboard/dashboardMetricsConfig';

describe('caseFichaStatusPresentation', () => {
  it('KPI dentista usa label e icono de STATUS_MAP', () => {
    const def = DENTIST_DASHBOARD_METRICS.find((d) => d.id === 'enEvaluacion');
    expect(def?.label).toBe(statusLabel('enEvaluacion'));
    expect(def?.icon).toBe(statusIcon('enEvaluacion'));
    expect(def?.label).toBe('En Evaluación');
  });

  it('KPI técnico pre-adjudicación usa franja de ficha', () => {
    const inv = getTechKpiFichaPresentation('invitacionPendiente');
    expect(inv.label).toBe(TECH_FICHA_STRIPE.solicitudOferta.label);
    expect(inv.icon).toBe(TECH_FICHA_STRIPE.solicitudOferta.icon);

    const cot = TECH_DASHBOARD_METRICS.find((d) => d.id === 'cotizacionEnviada');
    expect(cot?.label).toBe(TECH_FICHA_STRIPE.cotizacionEnviada.label);
    expect(cot?.icon).toBe(TECH_FICHA_STRIPE.cotizacionEnviada.icon);
  });

  it('cerrado dentista mantiene label agregado Cerrados', () => {
    const cerrado = getDentistKpiFichaPresentation('cerrado');
    expect(cerrado.label).toBe('Cerrados');
    expect(cerrado.icon).toBe(statusIcon('cerrado'));
  });
});
