import { describe, it, expect } from 'vitest';
import { getDentistCardZone, getTechnicianCardCta } from '@/lib/cases/dentistCardPresentation';

describe('getDentistCardZone', () => {
  it('borrador: neutro con CTA "Continuar edición" y conteo de archivos', () => {
    const z = getDentistCardZone({ status: 'borrador', material: 'Zirconio', fileCount: 3 });
    expect(z.primary).toBe('Borrador');
    expect(z.ctaLabel).toBe('Continuar edición');
    expect(z.ctaVariant).toBe('neutral');
    expect(z.secondary).toContain('Zirconio');
    expect(z.secondary).toContain('3 archivos');
  });

  it('enEvaluacion sin ofertas → "Aún sin ofertas"', () => {
    const z = getDentistCardZone({ status: 'enEvaluacion', bids: [] });
    expect(z.primary).toBe('Evaluando');
    expect(z.secondary).toBe('Aún sin ofertas');
    expect(z.ctaLabel).toBe('Ver caso');
  });

  it('enEvaluacion solo cuenta bids pending (no revela invitados)', () => {
    const z = getDentistCardZone({
      status: 'enEvaluacion',
      bids: [
        { status: 'pending' },
        { status: 'pending' },
        { status: 'pending' },
        { status: 'quoted' },
        { status: 'withdrawn' },
        { status: 'expired' },
      ],
    });
    expect(z.secondary).toBe('3 ofertas recibidas');
  });

  it('enEvaluacion con 1 oferta singulariza', () => {
    const z = getDentistCardZone({ status: 'enEvaluacion', bids: [{ status: 'pending' }] });
    expect(z.secondary).toBe('1 oferta recibida');
  });

  it('propuestaLista usa CTA primario "Elegir oferta"', () => {
    const z = getDentistCardZone({ status: 'propuestaLista' });
    expect(z.ctaVariant).toBe('primary');
    expect(z.ctaLabel).toBe('Elegir oferta');
    expect(z.primary).toMatch(/Ofertas listas/i);
  });

  it('enEjecucion: formato "Material · entrega est. DD MMM"', () => {
    const z = getDentistCardZone({
      status: 'enEjecucion',
      material: 'PMMA',
      workDeadline: new Date('2026-06-12T10:00:00Z'),
    });
    expect(z.ctaLabel).toBe('Ver progreso');
    expect(z.secondary).toContain('PMMA');
    expect(z.secondary).toMatch(/entrega est\./);
  });

  it('completado: "entregado DD MMM"', () => {
    const z = getDentistCardZone({
      status: 'completado',
      material: 'Cerámica',
      completedAt: new Date('2026-06-14T10:00:00Z'),
    });
    expect(z.primary).toBe('Completado');
    expect(z.ctaLabel).toBe('Ver detalle');
    expect(z.secondary).toMatch(/entregado/);
  });

  it('rechazado / cerrado / cancelado usan CTA "Ver detalle" neutro', () => {
    for (const status of ['rechazado', 'cerrado', 'cancelado']) {
      const z = getDentistCardZone({ status });
      expect(z.ctaLabel, status).toBe('Ver detalle');
      expect(z.ctaVariant, status).toBe('neutral');
    }
  });

  it('cubre todos los estados de status sin caer al default', () => {
    const STATES = [
      'borrador',
      'enEvaluacion',
      'propuestaLista',
      'aceptadaPendienteInicio',
      'enEjecucion',
      'enRevision',
      'cambiosEnProceso',
      'disenoAprobado',
      'enFabricacion',
      'enviado',
      'completado',
      'cerrado',
      'pausado',
      'cancelado',
      'rechazado',
    ];
    for (const s of STATES) {
      const z = getDentistCardZone({ status: s });
      expect(z.primary, s).toBeTruthy();
      expect(z.ctaLabel, s).toBeTruthy();
    }
  });
});

describe('getTechnicianCardCta', () => {
  it('pending → "Cotizar"', () => {
    expect(getTechnicianCardCta({ invitationStatus: 'pending', caseStatus: 'enEvaluacion' })).toBe(
      'Cotizar',
    );
  });

  it('quoted en evaluación → "Ver caso"', () => {
    expect(getTechnicianCardCta({ invitationStatus: 'quoted', caseStatus: 'enEvaluacion' })).toBe(
      'Ver caso',
    );
  });

  it('caso terminal → "Ver detalle"', () => {
    expect(getTechnicianCardCta({ invitationStatus: 'accepted', caseStatus: 'completado' })).toBe(
      'Ver detalle',
    );
    expect(getTechnicianCardCta({ invitationStatus: 'rejected', caseStatus: 'cerrado' })).toBe(
      'Ver detalle',
    );
  });
});
