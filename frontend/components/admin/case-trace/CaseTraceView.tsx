'use client';

import type { CaseTraceData } from '@/lib/db/actions/caseTrace';
import { statusLabel } from '@/components/ui/StatusBadge';
import { formatUchQuoteClp } from '@/lib/uchQuoteDisplay';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { CheckCircle2, XCircle, Clock, Repeat2, ArrowRight, Wallet, Users } from 'lucide-react';

/** Estados internos (solo admin/sistema) — no tienen label en StatusBadge porque nunca se muestran al usuario final. */
const INTERNAL_STATUS_LABELS: Record<string, string> = {
  caso_recibido: 'Caso recibido',
  clasificando: 'Clasificando',
  seleccionandoTecnicos: 'Seleccionando técnicos',
  asignacionPendiente: 'Asignación pendiente',
  pendiente_pool: 'En cola (sin elegibles)',
  evaluandoOfertas: 'Evaluando ofertas',
  propuestaGenerada: 'Propuesta generada',
  propuestaPresentada: 'Propuesta presentada',
  aceptadaConfigurando: 'Aceptada, configurando',
  enEjecucionDiseno: 'En ejecución (diseño)',
  enRevisionCalidad: 'En revisión de calidad',
  certificadoCalidad: 'Certificado por calidad',
  enRevisionDiseno: 'En revisión (diseño)',
  cambiosSolicitados: 'Cambios solicitados',
  sin_asignacion_fallo: 'Falló — sin asignación',
  sin_cotizaciones_fallo: 'Falló — sin cotizaciones',
  propuestaExpirada: 'Propuesta expirada',
  rechazadaPorDentista: 'Rechazada por el dentista',
};

function internalStatusLabel(internalStatus: string): string {
  return INTERNAL_STATUS_LABELS[internalStatus] ?? internalStatus;
}

const ASSIGNMENT_STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  accepted: { label: 'Aceptada', icon: CheckCircle2, className: 'text-success border-success/30 bg-success-hl' },
  rejected: { label: 'Rechazada', icon: XCircle, className: 'text-error border-error/30 bg-error-hl' },
  pending: { label: 'Pendiente', icon: Clock, className: 'text-warning border-warning/30 bg-warning-hl' },
  expired: { label: 'Expirada', icon: Clock, className: 'text-faint border-divider bg-surface/60' },
};

/** Color de acento por rol del actor — mismo mapping conceptual validado en el mockup (indigo/teal/amber/gris). */
const ACTOR_ACCENT: Record<string, string> = {
  dentista: 'text-indigo-300',
  tecnico: 'text-teal-300',
  calidad: 'text-amber-300',
};

function actorAccentClass(role: string | null): string {
  return (role && ACTOR_ACCENT[role]) || 'text-muted';
}

function actorLabel(role: string | null): string {
  if (role === 'dentista') return 'Dentista';
  if (role === 'tecnico') return 'Técnico';
  if (role === 'calidad') return 'Calidad';
  if (role === 'admin') return 'Admin';
  return 'Fauchard / Sistema';
}

/** Títulos legibles para las acciones de la etapa de Calidad — el resto cae al fallback (`prettifyAction`). */
const ACTION_LABELS: Record<string, string> = {
  [CASE_EVENTS.ASIGNACION_CALIDAD]: 'Asignado a Calidad',
  // Sin "solicitada": versiones antiguas del código transferían el caso de inmediato (sin
  // paso de aceptación) bajo esta misma acción — ver Cadena de Calidad para el estado real.
  [CASE_EVENTS.CASO_DERIVADO_CALIDAD]: 'Derivación',
  [CASE_EVENTS.DERIVACION_CALIDAD_ACEPTADA]: 'Derivación aceptada',
  [CASE_EVENTS.DERIVACION_CALIDAD_RECHAZADA]: 'Derivación rechazada',
  [CASE_EVENTS.CALIDAD_CERTIFICADA]: 'Certificado por Calidad',
  [CASE_EVENTS.REVISION_ENVIADA_CALIDAD]: 'Entrega enviada a Calidad',
  [CASE_EVENTS.REVISION_SOLICITADA_CALIDAD]: 'Ajustes solicitados por Calidad',
  [CASE_EVENTS.CALIFICACION_ENVIADA_CALIDAD]: 'Calificación de Calidad',
};

function prettifyAction(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function actionTitle(action: string): string {
  return ACTION_LABELS[action] ?? prettifyAction(action);
}

/**
 * Construye la oración completa (nombres + motivo + comentario) para eventos de Calidad,
 * leyendo todo desde `payload` — reemplaza el `content` crudo en vez de duplicarlo, porque
 * ese texto histórico ya trae la misma información en prosa (sin nombres resueltos).
 */
function qualityReviewerContext(event: TraceEvent, names: Record<string, string>): string | null {
  const payload = (event.payload as Record<string, unknown> | null) ?? null;
  if (!payload) return null;
  const nameOf = (id: unknown) => (typeof id === 'string' ? names[id] ?? 'revisor desconocido' : null);
  const comment = typeof payload.comment === 'string' && payload.comment ? payload.comment : null;
  const reasonLabel = typeof payload.reasonLabel === 'string' && payload.reasonLabel ? payload.reasonLabel : null;

  if (event.action === CASE_EVENTS.ASIGNACION_CALIDAD) {
    const assigned = nameOf(payload.calidadUserId);
    return assigned ? `Revisor asignado: ${assigned}.` : null;
  }
  if (event.action === CASE_EVENTS.CASO_DERIVADO_CALIDAD) {
    const from = event.actorName ?? nameOf(payload.fromCalidadId);
    const to = nameOf(payload.toCalidadId);
    if (!from || !to) return null;
    return `De ${from} a ${to}.${comment ? ` «${comment}»` : ''}`;
  }
  if (event.action === CASE_EVENTS.DERIVACION_CALIDAD_ACEPTADA) {
    const from = nameOf(payload.fromCalidadId);
    const to = event.actorName ?? nameOf(payload.toCalidadId);
    return from && to ? `De ${from} a ${to} — aceptada.` : null;
  }
  if (event.action === CASE_EVENTS.DERIVACION_CALIDAD_RECHAZADA) {
    // fromCalidadId = quien rechaza (actor); toCalidadId = quien ofreció el caso (origen) — mismo orden "De X a Y" que las demás.
    const requester = nameOf(payload.toCalidadId);
    const rejector = event.actorName ?? nameOf(payload.fromCalidadId);
    if (!requester || !rejector) return null;
    return `De ${requester} a ${rejector} — rechazada.${reasonLabel ? ` Motivo: ${reasonLabel}.` : ''}${comment ? ` «${comment}»` : ''}`;
  }
  return null;
}

/** Acciones cuyo `content` crudo queda 100% cubierto por `qualityReviewerContext` — ocultarlo evita mostrar la misma info dos veces. */
const QUALITY_CONTEXT_ACTIONS = new Set<string>([
  CASE_EVENTS.ASIGNACION_CALIDAD,
  CASE_EVENTS.CASO_DERIVADO_CALIDAD,
  CASE_EVENTS.DERIVACION_CALIDAD_ACEPTADA,
  CASE_EVENTS.DERIVACION_CALIDAD_RECHAZADA,
]);

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} m`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} m`;
}

export default function CaseTraceView({ trace }: { trace: CaseTraceData }) {
  return (
    <div className="flex flex-col gap-8">
      <CaseSummary trace={trace} />
      <FinancialPanel trace={trace} />
      <PhaseMap trace={trace} />
      <AssignmentChain trace={trace} />
      <QualityChain trace={trace} />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <EventsTimeline trace={trace} />
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <ParticipantsPanel trace={trace} />
          <FauchardConfigPanel config={trace.fauchardConfig} />
        </aside>
      </div>
    </div>
  );
}

/* ── 1 · Resumen + KPIs ── */

function CaseSummary({ trace }: { trace: CaseTraceData }) {
  const events = trace.events;
  const first = events[0];
  const last = events[events.length - 1];
  const totalMs = first && last ? new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime() : null;

  const technicianCount = new Set(trace.assignments.map((a) => a.technicianId).filter(Boolean)).size;
  const deliveries = events.filter(
    (e) => e.action === CASE_EVENTS.REVISION_ENVIADA_CALIDAD || e.action === CASE_EVENTS.REVISION_ENVIADA,
  ).length;
  const reviewCycles = events.filter(
    (e) => e.action === CASE_EVENTS.REVISION_SOLICITADA_CALIDAD || e.action === CASE_EVENTS.REVISION_SOLICITADA,
  ).length;
  const ratingEvent = [...events].reverse().find((e) => e.action === CASE_EVENTS.CALIFICACION_ENVIADA);
  const rating = ratingEvent && typeof ratingEvent.payload === 'object' && ratingEvent.payload !== null
    ? (ratingEvent.payload as Record<string, unknown>).rating
    : undefined;

  const kpis: { value: string; label: string }[] = [
    { value: totalMs !== null ? formatDuration(totalMs) : '—', label: 'Publicado → último evento' },
    { value: String(technicianCount), label: 'Técnicos contactados' },
    { value: String(deliveries), label: 'Entregas del técnico' },
    { value: String(reviewCycles), label: 'Ciclos de revisión' },
  ];
  if (typeof rating === 'number') {
    kpis.push({ value: `${rating}/5`, label: 'Calificación final' });
  }

  return (
    <section className="p-6 rounded-2xl bg-surface/40 border border-divider flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-black text-foreground uppercase tracking-tighter">
            {trace.case.caseNumber ?? trace.case.id}
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-surface-2 border border-divider text-muted">
            {statusLabel(trace.case.status)}
            {trace.case.internalStatus ? ` · ${internalStatusLabel(trace.case.internalStatus)}` : ''}
          </span>
        </div>
        <p className="text-sm text-faint">
          Dentista: <span className="text-foreground font-medium">{trace.case.doctorName ?? 'Sin nombre'}</span>
          {trace.case.doctorEmail && <span className="text-faint"> ({trace.case.doctorEmail})</span>}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="p-3 rounded-xl bg-surface-2 border border-divider flex flex-col gap-0.5">
            <span className="text-lg font-extrabold text-foreground tabular-nums tracking-tight">{kpi.value}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-faint">{kpi.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 1b · Mirada financiera ── */

function FinancialPanel({ trace }: { trace: CaseTraceData }) {
  const { listPriceSale, listPriceCost, listPriceFeePercent } = trace.case;

  if (!listPriceSale || !listPriceCost || !listPriceFeePercent) {
    return (
      <section className="p-6 rounded-2xl bg-surface/40 border border-divider flex items-center gap-3">
        <Wallet className="w-4 h-4 text-faint" />
        <p className="text-sm text-faint">Sin snapshot de precio — caso previo a este esquema o nunca publicado.</p>
      </section>
    );
  }

  const sale = Number(listPriceSale);
  const cost = Number(listPriceCost);
  const feePercent = Number(listPriceFeePercent);

  const accepted = trace.assignments.find((a) => a.status === 'accepted');
  const latest = trace.assignments[trace.assignments.length - 1];
  const paidAssignment = accepted ?? latest;
  // compensation se deriva de listPriceCost al momento de asignar (assignment.ts:912) — siempre son iguales en el flujo v2.
  const paid = paidAssignment?.compensation ?? cost;

  const grossMargin = sale > 0 ? (sale - paid) / sale : 0;
  const paidPercent = sale > 0 ? Math.max(0, Math.min(100, (paid / sale) * 100)) : 0;
  const marginPercent = 100 - paidPercent;

  return (
    <section className="p-6 rounded-2xl bg-surface/40 border border-divider flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Mirada financiera
        </h3>
        <span className="text-[10px] text-faint">
          congelado al publicar ({new Date(trace.case.createdAt).toLocaleDateString('es-CL')})
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-surface-2 border border-divider flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Cobrado al dentista</span>
          <span className="text-lg font-black text-indigo-300">{formatUchQuoteClp(sale)}</span>
          <span className="text-[10px] text-faint">Precio de catálogo congelado</span>
        </div>
        <div className="p-4 rounded-xl bg-surface-2 border border-divider flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Pagado al técnico</span>
          <span className="text-lg font-black text-teal-300">{formatUchQuoteClp(paid)}</span>
          <span className="text-[10px] text-faint">Compensación acordada al asignar</span>
        </div>
        <div className="p-4 rounded-xl bg-surface-2 border border-divider flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Margen bruto DentFlowAI</span>
          <span className="text-lg font-black text-amber-300">{formatUchQuoteClp(sale - paid)}</span>
          <span className="text-[10px] text-faint">{(grossMargin * 100).toFixed(1)}% del cobro (margen bruto)</span>
        </div>
      </div>

      <p className="text-xs text-faint leading-relaxed">
        Estos montos quedan congelados en el caso al publicarlo — si la regla de catálogo cambia después, los casos ya
        publicados conservan sus valores vigentes en su momento.
      </p>

      <div className="p-3 rounded-xl bg-surface-2 border border-divider flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Regla de catálogo aplicada</span>
        <span className="font-bold text-amber-300">Markup {(feePercent * 100).toFixed(0)}% sobre costo</span>
        <span className="text-faint basis-full text-[11px] leading-relaxed">
          — así se configura el fee; equivale a {(grossMargin * 100).toFixed(1)}% de margen bruto sobre el cobro (no
          son el mismo número por definición: uno divide por costo, el otro por venta).
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-faint">
          Reparto del cobro total ({formatUchQuoteClp(sale)}) según margen bruto
        </span>
        <div
          className="flex h-2.5 rounded-full overflow-hidden bg-surface-2"
          role="img"
          aria-label="Reparto del cobro total entre técnico y DentFlowAI"
        >
          <div className="h-full bg-teal-400/70" style={{ width: `${paidPercent}%` }} />
          <div className="h-full bg-amber-400/70" style={{ width: `${marginPercent}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-faint">
          <span><b className="text-foreground">{paidPercent.toFixed(0)}%</b> del cobro → técnico</span>
          <span><b className="text-foreground">{marginPercent.toFixed(0)}%</b> del cobro → margen bruto DentFlowAI</span>
        </div>
      </div>
    </section>
  );
}

/* ── 2 · Mapa de fases ── */

type PhaseKey = 'borrador' | 'evaluacion' | 'ejecucion' | 'revision' | 'cierre';

const PHASE_META: Record<PhaseKey, { label: string; barClass: string }> = {
  borrador: { label: 'Borrador', barClass: 'bg-slate-500' },
  evaluacion: { label: 'Evaluación', barClass: 'bg-indigo-400' },
  ejecucion: { label: 'Ejecución + Calidad', barClass: 'bg-teal-400' },
  revision: { label: 'Revisión dentista', barClass: 'bg-amber-400' },
  cierre: { label: 'Cierre', barClass: 'bg-success' },
};

function findEventTime(events: CaseTraceData['events'], action: string, fromEnd = false): number | null {
  const list = fromEnd ? [...events].reverse() : events;
  const found = list.find((e) => e.action === action);
  return found ? new Date(found.createdAt).getTime() : null;
}

interface PhaseSegment {
  key: PhaseKey;
  start: number;
  end: number;
  duration: number;
}

/** Fronteras de fase derivadas de hitos reales del event log (no inferencia de contenido). Compartido por el mapa de fases y el agrupamiento de la timeline. */
function computePhaseSegments(trace: CaseTraceData): PhaseSegment[] {
  const events = trace.events;
  if (events.length === 0) return [];

  const t0 = new Date(trace.case.createdAt).getTime();
  const tPublished = findEventTime(events, CASE_EVENTS.CASO_PUBLICADO) ?? t0;
  const tAccepted = findEventTime(events, CASE_EVENTS.ASIGNACION_ACEPTADA, true) ?? tPublished;
  const tSentToDentist = findEventTime(events, CASE_EVENTS.REVISION_ENVIADA, true) ?? tAccepted;
  const tApproved = findEventTime(events, CASE_EVENTS.TRABAJO_APROBADO) ?? tSentToDentist;
  const tEnd = new Date(events[events.length - 1].createdAt).getTime();

  const bounds: [PhaseKey, number, number][] = [
    ['borrador', t0, tPublished],
    ['evaluacion', tPublished, tAccepted],
    ['ejecucion', tAccepted, tSentToDentist],
    ['revision', tSentToDentist, tApproved],
    ['cierre', tApproved, tEnd],
  ];

  return bounds
    .map(([key, start, end]) => ({ key, duration: Math.max(0, end - start), start, end }))
    .filter((s) => s.duration > 0 || s.key === 'cierre');
}

function phaseKeyForTimestamp(ts: number, segments: PhaseSegment[]): PhaseKey {
  let match: PhaseKey = segments[0]?.key ?? 'evaluacion';
  for (const s of segments) {
    if (ts >= s.start) match = s.key;
  }
  return match;
}

function PhaseMap({ trace }: { trace: CaseTraceData }) {
  const segments = computePhaseSegments(trace);
  if (segments.length === 0) {
    return null;
  }

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0) || 1;

  return (
    <section className="p-6 rounded-2xl bg-surface/40 border border-divider flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Mapa de fases</h3>
        <span className="text-[11px] text-faint">tiempo real en cada etapa</span>
      </div>
      <div className="flex h-8 rounded-lg overflow-hidden gap-1">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${PHASE_META[s.key].barClass} flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-background`}
            style={{ flex: `${Math.max(s.duration / totalDuration, 0.04)} 1 0%` }}
            title={PHASE_META[s.key].label}
          >
            {formatDuration(s.duration)}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((s) => (
          <div key={s.key} className="flex flex-col gap-0.5 text-[11px]">
            <span className="font-bold text-foreground">{PHASE_META[s.key].label}</span>
            <span className="text-faint tabular-nums">
              {new Date(s.start).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              {' – '}
              {new Date(s.end).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 3 · Cadena de asignación ── */

function AssignmentChain({ trace }: { trace: CaseTraceData }) {
  if (trace.assignments.length === 0) return null;

  return (
    <section className="p-6 rounded-2xl bg-surface/40 border border-divider flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Cadena de asignación</h3>
        <span className="text-[11px] text-faint">ranking Fauchard · config anclada</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div className="flex flex-col items-center gap-1 shrink-0 mr-1">
          <div className="w-8 h-8 rounded-xl bg-indigo-400/15 border border-indigo-400/35 flex items-center justify-center text-indigo-300 font-black text-sm">
            F
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-faint">Publicado</span>
        </div>
        {trace.assignments.map((a, idx) => {
          const meta = ASSIGNMENT_STATUS_META[a.status] ?? ASSIGNMENT_STATUS_META.pending;
          const borderClass =
            a.status === 'accepted'
              ? 'border-success/40'
              : a.status === 'rejected'
                ? 'border-error/35'
                : 'border-divider';
          return (
            <div key={a.id} className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col items-center gap-1 text-faint shrink-0">
                <ArrowRight className="w-4 h-4" />
                <span className="text-[9px] font-bold uppercase tracking-wider">{idx === 0 ? 'top-1' : 'siguiente'}</span>
              </div>
              <div className={`min-w-[200px] p-3 rounded-xl bg-surface-2 border ${borderClass} flex flex-col gap-1`}>
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                  {a.technicianName ?? 'Técnico eliminado'}
                </span>
                <span className={`text-xs font-bold flex items-center gap-1 ${meta.className.split(' ')[0]}`}>
                  <meta.icon className="w-3 h-3" /> {meta.label}
                  {a.rejectionComment ? ` · «${a.rejectionComment}»` : ''}
                </span>
                <span className="text-[10px] text-faint tabular-nums">
                  {a.scoreAtAssignment && `score ${a.scoreAtAssignment}`}
                  {a.compensation !== null && ` · ${formatUchQuoteClp(a.compensation)}`}
                </span>
                {a.isReassignment && (
                  <span className="self-start flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface border border-divider text-muted">
                    <Repeat2 className="w-3 h-3" /> Reemplazo automático
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── 3b · Cadena de Calidad ── */

const QUALITY_STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: 'Activo', className: 'text-amber-300 border-amber-400/40' },
  pending_derivation: { label: 'Esperando respuesta', className: 'text-warning border-warning/40' },
  derivation_rejected: { label: 'Rechazó la derivación', className: 'text-error border-error/35' },
  derived: { label: 'Transferido', className: 'text-faint border-divider' },
  completed: { label: 'Completado', className: 'text-success border-success/40' },
};

type QualityAssignmentRow = CaseTraceData['qualityAssignments'][number];

/**
 * Reconstruye, para cada fila `case_quality_assignment`, quién era el revisor activo al
 * momento de esa fila — necesario para poder decir "X le ofreció el caso a Y" en filas de
 * derivación pendiente/rechazada, donde solo se guarda el destino (`calidadUserId`), no el origen.
 */
/** Estados que representan una tenencia real del caso (en algún momento tuvieron el caso), a diferencia de una oferta que no llegó a concretarse. */
const HOLDER_STATUSES = new Set(['active', 'derived', 'completed']);

function withOfferedBy(rows: QualityAssignmentRow[]): Array<QualityAssignmentRow & { offeredByName: string | null }> {
  let currentHolderName: string | null = null;
  return rows.map((row) => {
    // Ojo: no basta con status === 'active' — al cerrar el caso, todos los tenedores anteriores
    // quedan en 'derived'/'completed', nunca retroactivamente 'active'. Cualquiera de los 3
    // estados de tenencia marca quién tenía el caso al momento de esta fila.
    const offeredByName = HOLDER_STATUSES.has(row.status) ? null : currentHolderName;
    if (HOLDER_STATUSES.has(row.status)) currentHolderName = row.reviewerName;
    return { ...row, offeredByName };
  });
}

/**
 * Cadena real de revisores de Calidad, leída de `case_quality_assignment` (no del event log):
 * el mismo evento `CASO_DERIVADO_CALIDAD` significó "transferencia inmediata" en versiones
 * antiguas del código y "solicitud pendiente de aceptar/rechazar" después — esta tabla es la
 * única fuente que distingue ambos casos sin ambigüedad.
 */
function QualityChain({ trace }: { trace: CaseTraceData }) {
  if (trace.qualityAssignments.length === 0) return null;
  const rows = withOfferedBy(trace.qualityAssignments);

  return (
    <section className="p-6 rounded-2xl bg-surface/40 border border-divider flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Cadena de Calidad</h3>
        <span className="text-[11px] text-faint">{rows.length} evento{rows.length !== 1 ? 's' : ''} de asignación/derivación</span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const meta = QUALITY_STATUS_META[r.status] ?? { label: r.status, className: 'text-muted border-divider' };
          // Para filas cerradas, el momento relevante es cuándo se resolvió (updatedAt) — no cuándo
          // este revisor recibió el caso (assignedAt), que puede ser mucho antes.
          const isClosed = r.status !== 'active';
          const displayedAt = isClosed ? r.updatedAt : r.assignedAt;
          const fmt = (d: Date) => new Date(d).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          return (
            <div key={r.id} className={`p-3 rounded-xl bg-surface-2 border ${meta.className.split(' ')[1]} flex flex-col gap-1`}>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="flex items-center gap-1.5 font-bold text-foreground">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  {r.reviewerName ?? 'Revisor eliminado'}
                </span>
                <span className={`font-bold ${meta.className.split(' ')[0]}`}>{meta.label}</span>
                {r.status === 'derived' && r.derivedToName && (
                  <span className="text-muted">→ transferido a <strong className="text-foreground">{r.derivedToName}</strong></span>
                )}
                {r.offeredByName && (
                  <span className="text-muted">— oferta de <strong className="text-foreground">{r.offeredByName}</strong></span>
                )}
                <span className="ml-auto text-[10px] text-faint tabular-nums" title={`Recibido: ${fmt(r.assignedAt)}`}>
                  {fmt(displayedAt)}
                </span>
              </div>
              {(r.derivationReasonLabel || r.derivationComment) && (
                <p className="text-[11px] text-muted">
                  {r.derivationReasonLabel && <>Motivo de derivación: {r.derivationReasonLabel}. </>}
                  {r.derivationComment && <>«{r.derivationComment}»</>}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── 4 · Historia del caso ── */

type TraceEvent = CaseTraceData['events'][number];
type TimelineItem =
  | { kind: 'event'; event: TraceEvent }
  | { kind: 'iteration'; version: number; events: TraceEvent[]; certified: boolean; adjustmentCount: number };

const QUALITY_CYCLE_ACTIONS = new Set<string>([
  CASE_EVENTS.REVISION_ENVIADA_CALIDAD,
  CASE_EVENTS.REVISION_SOLICITADA_CALIDAD,
  CASE_EVENTS.CALIDAD_CERTIFICADA,
]);

/**
 * Agrupa entrega→cambios→certificación en "ciclos de calidad" (v1, v2, ...) para plegar el ruido
 * de idas y vueltas. Cada ciclo arranca en una entrega a Calidad y cierra al certificarse o al
 * comenzar la siguiente entrega — sin inferir nada que no esté en `action`.
 */
function groupIntoTimelineItems(events: TraceEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let current: { version: number; events: TraceEvent[] } | null = null;
  let version = 0;

  const closeCurrent = () => {
    if (!current) return;
    const certified = current.events.some((e) => e.action === CASE_EVENTS.CALIDAD_CERTIFICADA);
    const adjustmentCount = current.events.filter((e) => e.action === CASE_EVENTS.REVISION_SOLICITADA_CALIDAD).length;
    items.push({ kind: 'iteration', version: current.version, events: current.events, certified, adjustmentCount });
    current = null;
  };

  for (const event of events) {
    if (event.action === CASE_EVENTS.REVISION_ENVIADA_CALIDAD) {
      closeCurrent();
      version += 1;
      current = { version, events: [event] };
    } else if (current && QUALITY_CYCLE_ACTIONS.has(event.action)) {
      current.events.push(event);
      if (event.action === CASE_EVENTS.CALIDAD_CERTIFICADA) closeCurrent();
    } else {
      closeCurrent();
      items.push({ kind: 'event', event });
    }
  }
  closeCurrent();
  return items;
}

function EventRow({ event, compact, payloadUserNames }: { event: TraceEvent; compact?: boolean; payloadUserNames?: Record<string, string> }) {
  const when = new Date(event.createdAt);
  const reviewerContext = qualityReviewerContext(event, payloadUserNames ?? {});
  return (
    <div className={`relative p-3 rounded-xl hover:bg-white/[0.03] transition-colors duration-150 ${compact ? '' : ''}`}>
      <div className="grid grid-cols-[76px_1fr] gap-3">
        <div className="flex flex-col gap-0.5 pt-0.5 text-[11px] tabular-nums">
          <span className="text-faint text-[10px]">{when.toLocaleDateString('es-CL')}</span>
          <span className="text-foreground font-semibold">
            {when.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
            <span className={`uppercase tracking-wider ${actorAccentClass(event.actorRole)}`}>
              {actorLabel(event.actorRole)}
              {event.actorName ? ` · ${event.actorName}` : ''}
            </span>
            <span className="text-foreground normal-case font-semibold">{actionTitle(event.action || event.type)}</span>
          </div>
          {reviewerContext && <p className="text-xs text-amber-300/90 font-medium">{reviewerContext}</p>}
          {event.content && !(reviewerContext && QUALITY_CONTEXT_ACTIONS.has(event.action)) && (
            <p className="text-xs text-muted">{event.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function IterationGroup({ item, payloadUserNames }: { item: Extract<TimelineItem, { kind: 'iteration' }>; payloadUserNames: Record<string, string> }) {
  const first = new Date(item.events[0].createdAt);
  const last = new Date(item.events[item.events.length - 1].createdAt);
  const outcome = item.certified
    ? 'certificada ✓'
    : item.adjustmentCount > 0
      ? `cambios pedidos ×${item.adjustmentCount}`
      : 'en curso';

  return (
    <details className="rounded-xl border border-divider bg-surface/30 ml-1">
      <summary className="list-none cursor-pointer flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-bold text-muted hover:text-foreground transition-colors duration-150 [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-[10.5px] font-bold text-amber-300 bg-amber-400/10 rounded px-1.5 py-0.5">
          v{item.version}
        </span>
        <span>Ciclo de calidad {item.version}</span>
        <span className="ml-auto font-mono text-[10.5px] text-faint tabular-nums">
          {first.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          {' → '}
          {last.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {outcome}
        </span>
        <span className="chevron text-faint transition-transform duration-150">▸</span>
      </summary>
      <div className="flex flex-col gap-1 pb-2 pl-2 border-l-2 border-amber-400/20 ml-4">
        {item.events.map((e) => (
          <EventRow key={e.id} event={e} compact payloadUserNames={payloadUserNames} />
        ))}
      </div>
    </details>
  );
}

const PHASE_ICON: Record<PhaseKey, string> = {
  borrador: '○',
  evaluacion: '◈',
  ejecucion: '◆',
  revision: '◉',
  cierre: '✓',
};

function EventsTimeline({ trace }: { trace: CaseTraceData }) {
  const { events, payloadUserNames } = trace;
  const segments = computePhaseSegments(trace);

  const buckets = new Map<PhaseKey, TraceEvent[]>();
  for (const event of events) {
    const key = segments.length > 0 ? phaseKeyForTimestamp(new Date(event.createdAt).getTime(), segments) : 'evaluacion';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(event);
  }

  const orderedPhaseKeys: PhaseKey[] = ['borrador', 'evaluacion', 'ejecucion', 'revision', 'cierre'];
  const phaseGroups = orderedPhaseKeys
    .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
    .map((key) => {
      const phaseEvents = buckets.get(key)!;
      const first = new Date(phaseEvents[0].createdAt);
      const last = new Date(phaseEvents[phaseEvents.length - 1].createdAt);
      return { key, events: phaseEvents, first, last };
    });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Historia del caso</h3>
        <span className="text-[11px] text-faint">{events.length} eventos · agrupados por fase</span>
      </div>
      <div className="flex flex-wrap gap-4 text-[11px] text-muted px-1 pb-1">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-400" />Dentista</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-400" />Técnico</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Calidad</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" />Fauchard / Sistema</span>
      </div>

      {phaseGroups.length === 0 && <p className="text-sm text-faint">Sin eventos registrados.</p>}

      {phaseGroups.map((group, idx) => (
        <details
          key={group.key}
          className="group rounded-2xl border border-divider bg-surface/40"
          open={idx >= phaseGroups.length - 3}
        >
          <summary className="list-none cursor-pointer flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-surface-2 transition-colors duration-150 [&::-webkit-details-marker]:hidden">
            <span className="w-6 h-6 rounded-lg bg-surface-2 flex items-center justify-center text-xs font-black text-primary shrink-0">
              {PHASE_ICON[group.key]}
            </span>
            <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
              {PHASE_META[group.key].label}
            </span>
            <span className="ml-auto text-[11px] font-mono text-faint tabular-nums">
              {group.first.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              {' – '}
              {group.last.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {group.events.length} eventos
            </span>
            <span className="text-faint transition-transform duration-150 group-open:rotate-90">▸</span>
          </summary>
          <div className="flex flex-col gap-1.5 px-4 pb-4 pt-1 border-l-2 border-divider ml-6">
            {groupIntoTimelineItems(group.events).map((item, itemIdx) =>
              item.kind === 'event' ? (
                <EventRow key={item.event.id} event={item.event} payloadUserNames={payloadUserNames} />
              ) : (
                <IterationGroup key={`iter-${group.key}-${itemIdx}`} item={item} payloadUserNames={payloadUserNames} />
              ),
            )}
          </div>
        </details>
      ))}
    </section>
  );
}

/* ── Sidebar: Participantes ── */

function ParticipantsPanel({ trace }: { trace: CaseTraceData }) {
  const technicians = new Map<string, { name: string | null; email: string | null }>();
  for (const a of trace.assignments) {
    if (a.technicianId && a.status === 'accepted') {
      technicians.set(a.technicianId, { name: a.technicianName, email: a.technicianEmail });
    }
  }
  const qualityActors = new Map<string, { name: string | null; email: string | null }>();
  for (const e of trace.events) {
    if (e.actorRole === 'calidad' && e.actorId) {
      qualityActors.set(e.actorId, { name: e.actorName, email: e.actorEmail });
    }
  }

  return (
    <section className="p-5 rounded-2xl bg-surface/40 border border-divider flex flex-col gap-3">
      <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
        <Users className="w-3.5 h-3.5" /> Participantes
      </h3>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-xl bg-indigo-400/15 flex items-center justify-center text-indigo-300 font-black text-xs shrink-0">
          D
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-foreground truncate">{trace.case.doctorName ?? 'Sin nombre'}</span>
          <span className="text-[11px] text-faint truncate">{trace.case.doctorEmail}</span>
        </div>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-faint shrink-0">Dentista</span>
      </div>
      {[...technicians.entries()].map(([id, t]) => (
        <div key={id} className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-teal-400/15 flex items-center justify-center text-teal-300 font-black text-xs shrink-0">
            {t.name?.[0] ?? 'T'}
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-foreground truncate">{t.name ?? 'Técnico'}</span>
            <span className="text-[11px] text-faint truncate">{t.email}</span>
          </div>
          <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-faint shrink-0">Técnico</span>
        </div>
      ))}
      {[...qualityActors.entries()].map(([id, q]) => (
        <div key={id} className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-amber-400/15 flex items-center justify-center text-amber-300 font-black text-xs shrink-0">
            {q.name?.[0] ?? 'Q'}
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-foreground truncate">{q.name ?? 'Calidad'}</span>
            <span className="text-[11px] text-faint truncate">{q.email}</span>
          </div>
          <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-faint shrink-0">Calidad</span>
        </div>
      ))}
    </section>
  );
}

/* ── Sidebar: Config Fauchard ── */

function FauchardConfigPanel({ config }: { config: CaseTraceData['fauchardConfig'] }) {
  if (!config) {
    return (
      <section className="p-5 rounded-2xl bg-surface/40 border border-divider flex flex-col gap-3">
        <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Configuración Fauchard</h3>
        <p className="text-sm text-faint">No se pudo resolver la configuración usada.</p>
      </section>
    );
  }

  const weights = [
    { label: 'Q Calidad', value: config.alphaQuality },
    { label: 'P Puntualidad', value: config.alphaPunctuality },
    { label: 'E Experiencia', value: config.alphaExperience },
    { label: 'B Bono', value: config.alphaBonus },
    { label: 'L Carga', value: config.alphaLoad },
    { label: 'N No-respuesta', value: config.alphaNoResponse },
  ];
  const maxWeight = Math.max(...weights.map((w) => Number(w.value) || 0), 0.001);

  const timings = [
    { label: 'Aceptar asignación', value: `${config.tQuoteMinutes} min` },
    { label: 'Revisión dentista', value: `${config.tDentistReviewHours} h` },
    { label: 'Espera pool sin elegibles', value: `${config.tNoEligiblePoolHours} h` },
    { label: 'Corte reemplazo', value: `${config.replacementCutoffMinutes} min` },
  ];

  return (
    <section className="p-5 rounded-2xl bg-surface/40 border border-divider flex flex-col gap-3">
      <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Config Fauchard · v{config.version}</h3>
      <div className="flex flex-col gap-1.5">
        {weights.map((w) => (
          <div key={w.label} className="grid grid-cols-[100px_1fr_40px] items-center gap-2 text-xs">
            <span className="text-muted truncate">{w.label}</span>
            <span className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <span
                className="block h-full rounded-full bg-indigo-400"
                style={{ width: `${(Number(w.value) / maxWeight) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums text-faint">{Number(w.value).toFixed(3)}</span>
          </div>
        ))}
      </div>
      <div className="h-px bg-divider" />
      <div className="flex flex-col gap-1">
        {timings.map((t) => (
          <div key={t.label} className="flex justify-between text-xs">
            <span className="text-faint">{t.label}</span>
            <span className="tabular-nums text-foreground">{t.value}</span>
          </div>
        ))}
      </div>
      <div className="h-px bg-divider" />
      <p className="text-[11px] text-faint leading-relaxed">
        Config anclada al publicar el caso. Los cambios posteriores del configurador no afectan esta corrida.
        {config.changeReason && ` Motivo de cambio: ${config.changeReason}`}
      </p>
    </section>
  );
}
