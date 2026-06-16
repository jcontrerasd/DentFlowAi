'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { simulateFauchardAction } from '@/lib/db/actions/fauchard';
import { AlertCircle, RefreshCcw, FlaskConical, AlertTriangle, ChevronDown, Users } from 'lucide-react';
import { useFauchardDraft } from './FauchardDraftContext';
import { ACTIVE_ALPHA_KEYS } from '@/lib/fauchard/alphaWeightNormalize';
import { flashParams } from '@/lib/hooks/useParamFlash';

/** Parámetros del borrador que alimentan cada KPI (espeja las fórmulas de abajo).
 *  Al pulsar un KPI se resaltan estos controles en los paneles editores. */
const KPI_PARAMS = {
  quality: ['alphaQuality', 'alphaExperience'],
  equity: ['alphaBonus', 'alphaLoad'],
  agility: ['tQuoteMinutes', 'maxAssignmentAttempts'],
  emptyPool: ['tCooldownMinutes', 'dInactivityDays', 'alphaNoResponse'],
} as const;

/**
 * Laboratorio de decisión. Refleja el borrador compartido en vivo:
 * radar de pesos α **editable** (arrastrar un vértice ajusta su peso, igual que el
 * slider correspondiente — comparten `FauchardDraftContext`), tooltip por factor al
 * pasar el mouse, KPIs + distribución de técnicos **reales** (vía `simulateFauchardAction`
 * con el borrador completo como override) + alertas de dependencias.
 */

const PARAMETER_HELP_MAP: Record<string, { label: string; symbol: string; description: string; example: string }> = {
  alphaQuality: { label: 'Calidad Histórica', symbol: 'αQ', description: 'Prioriza a los técnicos con mejores calificaciones en trabajos anteriores de la misma dimensión.', example: 'Si αQ = 0.40, la reputación manda: Lab Andes (4.8⭐) será invitado antes que Lab Roble (4.0⭐).' },
  alphaPunctuality: { label: 'Puntualidad', symbol: 'αP', description: 'Favorece a los laboratorios que entregan dentro del plazo prometido.', example: 'Si αP = 0.30 y un técnico se retrasa seguido, su score cae en casos urgentes.' },
  alphaExperience: { label: 'Experiencia Especializada', symbol: 'αE', description: 'Prioriza a técnicos con mayor nivel de habilidad en el tipo de trabajo específico.', example: 'Para una Guía Quirúrgica, un especialista 7/7 supera al generalista si αE está alto.' },
  alphaBonus: { label: 'Bono de Infrautilización', symbol: 'αB', description: 'Aumento temporal de score para técnicos sin asignaciones recientes (días desde lastInvitedAt).', example: 'Si αB = 0.10 y el Lab. Sur lleva semanas sin asignación, su B=1.0 le empuja en el ranking frente a labs saturados.' },
  alphaLoad: { label: 'Carga activa', symbol: 'αL', description: 'Resta score a técnicos saturados para evitar cuellos de botella.', example: 'Si αL = 0.20, un lab excelente pero con 8 casos cede el turno a otro más libre.' },
  alphaNoResponse: { label: 'Penalización por No-respuesta', symbol: 'αN', description: 'Resta score al técnico que ignora asignaciones repetidamente.', example: 'Si αN = 0.25 y Lab Pino ignoró 2 asignaciones (Nivel 2), su score cae fuerte.' },
};

export default function FauchardLabPanel() {
  const { draft, warnings, setParam } = useFauchardDraft();

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // Tooltip flotante (posición fija = coords del puntero) del factor bajo el mouse / en arrastre.
  const [tip, setTip] = useState<{ key: string; x: number; y: number } | null>(null);
  const [showDist, setShowDist] = useState(false);
  const [simulation, setSimulation] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sumWeights = ACTIVE_ALPHA_KEYS.reduce((acc, k) => acc + draft[k as keyof typeof draft], 0);
  const isWeightsSumValid = Math.abs(sumWeights - 1.0) < 0.001;

  // Simulación reactiva (debounced) sobre el pool real, con el borrador completo.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isWeightsSumValid) {
        startTransition(async () => {
          setErrorMessage(null);
          try {
            const res = await simulateFauchardAction({
              restorationType: 'corona_posterior',
              caseComplexity: 'INTERMEDIO',
              configOverride: draft,
            });
            if (res.success) setSimulation(res.simulation);
            else setErrorMessage(res.error || 'Fallo en la simulación.');
          } catch {
            setErrorMessage('Error al invocar la simulación remota.');
          }
        });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [draft, isWeightsSumValid]);

  // Indicadores de salud (derivados del borrador).
  const qualityFocus = Math.min(100, Math.round(((draft.alphaQuality + draft.alphaExperience) / 0.8) * 100));
  const equityScore = Math.min(100, Math.round(((draft.alphaBonus + draft.alphaLoad) / 0.35) * 100));
  const emptyPoolRisk = Math.min(100, Math.round(
    (draft.tCooldownMinutes / 1440) * 30 +
    Math.max(0, (15 - draft.dInactivityDays) / 14) * 40 +
    draft.alphaNoResponse * 30,
  ));
  const agilityScore = Math.round(Math.max(0, 100 - (draft.tQuoteMinutes / 180) * 50 - (draft.maxAssignmentAttempts / 10) * 20));

  const eligible = simulation?.funnel?.eligible ?? null;
  const attemptsWarning = eligible !== null && draft.maxAssignmentAttempts > eligible;

  const axes = [
    { key: 'alphaQuality', label: 'Calidad', color: 'var(--color-primary)' },
    { key: 'alphaPunctuality', label: 'Puntual.', color: 'var(--color-jade)' },
    { key: 'alphaExperience', label: 'Exp.', color: '#a78bfa' },
    { key: 'alphaBonus', label: 'Bono', color: '#38bdf8' },
    { key: 'alphaLoad', label: 'Carga', color: '#fb923c' },
    { key: 'alphaNoResponse', label: 'No-Resp', color: 'var(--color-error)' },
  ];
  const N = axes.length;
  const CX = 150, CY = 150, R = 105, maxVal = 0.5;
  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const angle = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2;
  const toXY = (i: number, mag: number) => ({ x: CX + Math.cos(angle(i)) * R * mag, y: CY + Math.sin(angle(i)) * R * mag });
  const gridPolygons = levels.map((lvl) => axes.map((_, i) => { const p = toXY(i, lvl); return `${p.x},${p.y}`; }).join(' '));
  const dataPoints = axes.map((ax, i) => { const val = (draft[ax.key as keyof typeof draft] as number) / maxVal; return toXY(i, Math.min(val, 1)); });
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  // Arrastre de un vértice → fija el peso α de ese eje (clamp 0–0.50, paso 0.01),
  // proyectando el puntero sobre la dirección del eje. El slider espeja el valor
  // (mismo `setParam` + contexto). No re-normaliza el resto: el medidor Σα avisa
  // si la suma deja de ser 1.0, igual que al mover los sliders.
  const applyDragValue = (clientX: number, clientY: number, i: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const ux = Math.cos(angle(i)), uy = Math.sin(angle(i));
    const proj = (pt.x - CX) * ux + (pt.y - CY) * uy; // distancia con signo sobre el eje
    const mag = Math.max(0, Math.min(proj / R, 1));    // 0..1 dentro del radar
    const value = Math.round(mag * maxVal * 100) / 100; // 0..0.50, paso 0.01
    setParam(axes[i].key as Parameters<typeof setParam>[0], value);
  };
  const startDrag = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    draggingRef.current = i;
    setDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
    setTip({ key: axes[i].key, x: e.clientX, y: e.clientY });
    applyDragValue(e.clientX, e.clientY, i);
  };
  const moveDrag = (e: React.PointerEvent, i: number) => {
    if (draggingRef.current !== i) return;
    setTip({ key: axes[i].key, x: e.clientX, y: e.clientY });
    applyDragValue(e.clientX, e.clientY, i);
  };
  const endDrag = (e: React.PointerEvent) => {
    draggingRef.current = null;
    setDragging(false);
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const hoverTip = (e: React.PointerEvent, i: number) => {
    if (draggingRef.current === null) setTip({ key: axes[i].key, x: e.clientX, y: e.clientY });
  };
  const leaveTip = () => { if (draggingRef.current === null) setTip(null); };

  const tipInfo = tip ? PARAMETER_HELP_MAP[tip.key] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FlaskConical className="w-3.5 h-3.5 text-primary shrink-0" />
          <h3 className="text-[11px] font-black uppercase tracking-wider text-foreground truncate">Laboratorio</h3>
        </div>
        {isPending && <RefreshCcw className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />}
      </div>

      <div className="p-2.5 rounded-xl bg-surface/30 border border-divider">
        <h4 className="text-[10px] font-bold text-foreground mb-1">Radar α</h4>
        <svg ref={svgRef} viewBox="0 0 300 300" className="w-full max-w-[180px] mx-auto h-auto touch-none">
          <defs>
            <radialGradient id="labRadarFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.08" />
            </radialGradient>
          </defs>
          {gridPolygons.map((pts, li) => <polygon key={li} points={pts} fill="none" stroke="var(--color-divider)" strokeWidth="1" />)}
          {axes.map((_, i) => { const o = toXY(i, 1); return <line key={i} x1={CX} y1={CY} x2={o.x} y2={o.y} stroke="var(--color-divider)" strokeWidth="1" />; })}
          <polygon points={dataPolygon} fill="url(#labRadarFill)" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" />
          {dataPoints.map((p, i) => (
            <g key={i}>
              {/* Punto visible */}
              <circle cx={p.x} cy={p.y} r={dragging && draggingRef.current === i ? 8 : 5} fill={axes[i].color} stroke="var(--color-surface)" strokeWidth="2" className="pointer-events-none transition-[r]" />
              {/* Zona de agarre (transparente, área cómoda) */}
              <circle
                cx={p.x} cy={p.y} r="14" fill="transparent"
                className={dragging ? 'cursor-grabbing' : 'cursor-grab'}
                onPointerDown={(e) => startDrag(e, i)}
                onPointerMove={(e) => moveDrag(e, i)}
                onPointerUp={endDrag}
                onPointerEnter={(e) => hoverTip(e, i)}
                onPointerLeave={leaveTip}
              />
            </g>
          ))}
          {axes.map((ax, i) => {
            const lp = toXY(i, 1.2);
            const anchor = Math.cos(angle(i)) < -0.3 ? 'end' : Math.cos(angle(i)) > 0.3 ? 'start' : 'middle';
            return (
              <text
                key={i} x={lp.x} y={lp.y + 4} textAnchor={anchor} fontSize="9" fontWeight="700"
                fill="var(--color-muted)" className="cursor-help select-none"
                onPointerEnter={(e) => hoverTip(e, i)} onPointerLeave={leaveTip}
              >{ax.label}</text>
            );
          })}
          <circle cx={CX} cy={CY} r="3" fill="var(--color-primary)" opacity="0.5" />
        </svg>
        <p className="text-[9px] text-faint text-center mt-1 leading-tight">Arrastra los vértices para ajustar α · pasa el mouse para ver cada factor</p>
        <div className={`mt-1 p-2 rounded-lg border text-[10px] font-bold flex items-center justify-between ${isWeightsSumValid ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-error/5 border-error/20 text-error'}`}>
          <span>Σ α = {sumWeights.toFixed(3)}</span>
          <span>{isWeightsSumValid ? '✓ Válido' : '⚠ Debe sumar 1.0'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Foco en Calidad" value={qualityFocus} good={qualityFocus > 60} goodLabel="Exigente" badLabel="Balanceado" bar="bg-primary" onClick={() => flashParams([...KPI_PARAMS.quality])} />
        <Kpi label="Equidad / Rotación" value={equityScore} good={equityScore > 50} goodLabel="Estable" badLabel="Concentrado" bar="bg-jade" onClick={() => flashParams([...KPI_PARAMS.equity])} />
        <Kpi label="Agilidad" value={agilityScore} good={agilityScore > 70} goodLabel="Rápida" badLabel="Lenta" bar="bg-warning" onClick={() => flashParams([...KPI_PARAMS.agility])} />
        <Kpi label="Riesgo Pool Vacío" value={emptyPoolRisk} good={emptyPoolRisk < 40} goodLabel="Seguro" badLabel="Peligro" bar="bg-error" invert onClick={() => flashParams([...KPI_PARAMS.emptyPool])} />
      </div>

      {/* Alertas de dependencias */}
      {(warnings.length > 0 || attemptsWarning) && (
        <div className="space-y-2">
          {attemptsWarning && (
            <Warn text={`Configuras ${draft.maxAssignmentAttempts} intentos pero solo ${eligible} técnicos son elegibles en este escenario: puede agotar el pool.`} />
          )}
          {warnings.map((w) => <Warn key={w.rule} text={w.message} />)}
        </div>
      )}

      {/* Distribución de técnicos reales (expander secundario) */}
      <div className="rounded-xl bg-surface/20 border border-divider overflow-hidden">
        <button
          onClick={() => setShowDist((v) => !v)}
          className="w-full flex items-center gap-2 p-2.5 text-left transition-colors hover:bg-surface-2/30 focus-visible:outline-none focus-visible:bg-surface-2/40"
          aria-expanded={showDist}
        >
          <Users className="w-4 h-4 text-faint shrink-0" />
          <span className="text-xs font-black text-foreground uppercase tracking-tight">Ver técnicos</span>
          {simulation && (
            <span className="text-[9px] font-black px-2 py-0.5 bg-primary-hl border border-primary/20 text-primary rounded-lg">
              {simulation.funnel?.eligible ?? 0} / {simulation.funnel?.universe ?? 0}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-faint ml-auto shrink-0 transition-transform ${showDist ? 'rotate-180' : ''}`} />
        </button>

        {showDist && (
          <div className="px-4 pb-4 space-y-3">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-error-hl border border-error/20 text-error text-[11px] flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />{errorMessage}
              </div>
            )}
            {simulation ? (
              <div className="space-y-1.5">
                {(simulation.ranked as Array<Record<string, unknown>>)?.slice(0, 10).map((d) => (
                  <div key={d.technicianId as string} className={`flex items-center gap-2 p-2 rounded-lg ${d.excluded ? 'opacity-40 bg-background/10' : 'bg-background/20'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-foreground truncate">{d.fullName as string}</p>
                      {d.excluded
                        ? <p className="text-[8px] font-black uppercase text-error">{String(d.exclusionReason)}</p>
                        : <p className="text-[8px] font-bold uppercase text-faint">{d.leagueLevel as string}</p>}
                    </div>
                    <span className="text-[11px] font-mono font-bold text-primary shrink-0">{(d.score as number).toFixed(3)}</span>
                    <div className="flex gap-0.5 shrink-0">
                      {['Q', 'P', 'E', 'B', 'L', 'N'].map((k) => (
                        <span key={k} className="text-[7px] font-mono text-faint">{(d.components as Record<string, number>)?.[k]?.toFixed(1)}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-[11px] text-faint">Esperando simulación…</p>
            )}
          </div>
        )}
      </div>

      {/* Tooltip flotante del factor bajo el mouse / en arrastre (posición fija = puntero). */}
      {tip && tipInfo && (
        <div
          className="fixed z-50 pointer-events-none w-56 max-w-[80vw] rounded-xl border border-divider bg-surface shadow-xl p-3 space-y-1.5"
          style={{
            left: Math.min(tip.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 240),
            top: tip.y + 14,
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-foreground">{tipInfo.label}</span>
            <span className="text-[9px] font-mono font-bold bg-surface-2 border border-divider px-1 py-0.5 rounded text-primary ml-auto shrink-0">
              {tipInfo.symbol} = {(draft[tip.key as keyof typeof draft] as number).toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] text-muted leading-snug">{tipInfo.description}</p>
          <p className="text-[10px] text-faint leading-snug italic">{tipInfo.example}</p>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, good, goodLabel, badLabel, bar, onClick }: { label: string; value: number; good: boolean; goodLabel: string; badLabel: string; bar: string; invert?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Resaltar los parámetros que afectan este indicador"
      aria-label={`Resaltar parámetros de ${label}`}
      className="p-2 rounded-lg bg-surface/40 border border-divider flex flex-col gap-1 text-left transition-colors duration-150 hover:bg-white/5 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="text-[8px] font-black text-faint uppercase tracking-widest">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-black text-foreground tabular-nums">{value}%</span>
        <span className={`text-[8px] font-bold ${good ? 'text-jade' : 'text-warning'}`}>{good ? goodLabel : badLabel}</span>
      </div>
      <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </button>
  );
}

function Warn({ text }: { text: string }) {
  return (
    <div className="p-3 rounded-xl bg-warning-hl border border-warning/25 text-warning text-[11px] flex items-start gap-2">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}
