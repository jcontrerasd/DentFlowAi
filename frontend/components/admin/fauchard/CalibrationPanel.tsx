'use client';

import { useCallback, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
  ReferenceLine, LabelList,
} from 'recharts';
import {
  RefreshCw, AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, Clock,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  getObservabilityMetricsAction,
  type ObservabilityData,
  type ObservabilityMetric,
} from '@/lib/db/actions/observability';
import type { FauchardConfigRow } from '@/lib/db/actions/fauchard';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ParamHint {
  name: string;
  label: string;
  currentValue: (cfg: FauchardConfigRow) => string;
  suggestion: string;
}

interface RecommendationRule {
  metricId: number;
  condition: (value: number) => boolean;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  params: ParamHint[];
}

type ActiveRule = RecommendationRule & { metricValue: number; metricLabel: string };

// ─── Reglas de recomendación ──────────────────────────────────────────────────

const RULES: RecommendationRule[] = [
  {
    metricId: 1,
    condition: (v) => v > 50,
    severity: 'critical',
    title: 'Exceso de técnicos sancionados',
    description: 'Más de la mitad de los técnicos están en nivel 2 o 3. El pool elegible se reduce drásticamente.',
    params: [
      { name: 'alphaNoResponse', label: 'Penalización no-respuesta (αN)', currentValue: (c) => c.alphaNoResponse, suggestion: 'Reducir para suavizar la penalización' },
      { name: 'level2Threshold', label: 'Umbral Nivel 2', currentValue: (c) => String(c.level2Threshold) + ' eventos', suggestion: 'Aumentar para ser menos estricto' },
    ],
  },
  {
    metricId: 1,
    condition: (v) => v > 30 && v <= 50,
    severity: 'warning',
    title: 'Alta concentración de técnicos sancionados',
    description: 'Más del 30% de los técnicos están en nivel 2 o 3. Considera suavizar los umbrales.',
    params: [
      { name: 'alphaNoResponse', label: 'Penalización no-respuesta (αN)', currentValue: (c) => c.alphaNoResponse, suggestion: 'Reducir ligeramente' },
      { name: 'level2Threshold', label: 'Umbral Nivel 2', currentValue: (c) => String(c.level2Threshold) + ' eventos', suggestion: 'Aumentar para elevar la tolerancia' },
      { name: 'level3Threshold', label: 'Umbral Nivel 3', currentValue: (c) => String(c.level3Threshold) + ' eventos', suggestion: 'Aumentar si hay muchos en nivel 3' },
    ],
  },
  {
    metricId: 2,
    condition: (v) => v > 40,
    severity: 'critical',
    title: 'Tasa de no-respuesta crítica',
    description: 'Más del 40% de las asignaciones expiran sin respuesta.',
    params: [
      { name: 'tQuoteMinutes', label: 'Plazo de respuesta (tQuoteMinutes)', currentValue: (c) => c.tQuoteMinutes + ' min', suggestion: 'Aumentar para dar más tiempo' },
    ],
  },
  {
    metricId: 2,
    condition: (v) => v > 25 && v <= 40,
    severity: 'warning',
    title: 'Alta tasa de no-respuesta',
    description: 'Más del 25% de las asignaciones vencen sin respuesta.',
    params: [
      { name: 'tQuoteMinutes', label: 'Plazo de respuesta (tQuoteMinutes)', currentValue: (c) => c.tQuoteMinutes + ' min', suggestion: 'Aumentar para dar más tiempo' },
      { name: 'alphaNoResponse', label: 'Penalización no-respuesta (αN)', currentValue: (c) => c.alphaNoResponse, suggestion: 'Reducir si desincentiva la participación' },
    ],
  },
  {
    metricId: 5,
    condition: (v) => v > 40,
    severity: 'critical',
    title: 'Colapso del pool — falta de oferta',
    description: 'Más del 40% de los casos activos están en cola de espera.',
    params: [
      { name: 'nInvited', label: 'Candidatos por corrida (nInvited)', currentValue: (c) => String(c.nInvited), suggestion: 'Aumentar para intentar con más técnicos' },
      { name: 'maxPoolCycles', label: 'Ciclos máximos (maxPoolCycles)', currentValue: (c) => String(c.maxPoolCycles), suggestion: 'Aumentar para más oportunidades' },
    ],
  },
  {
    metricId: 5,
    condition: (v) => v > 20 && v <= 40,
    severity: 'warning',
    title: 'Muchos casos en cola de espera',
    description: 'Más del 20% de los casos activos están esperando técnicos elegibles.',
    params: [
      { name: 'nInvited', label: 'Candidatos por corrida (nInvited)', currentValue: (c) => String(c.nInvited), suggestion: 'Aumentar para ampliar el pool' },
      { name: 'tNoEligiblePoolHours', label: 'TTL de cola (tNoEligiblePoolHours)', currentValue: (c) => c.tNoEligiblePoolHours + ' h', suggestion: 'Aumentar si los casos fallan pronto' },
      { name: 'maxPoolCycles', label: 'Ciclos máximos (maxPoolCycles)', currentValue: (c) => String(c.maxPoolCycles), suggestion: 'Aumentar para más reintentos' },
    ],
  },
  {
    metricId: 6,
    condition: (v) => v < 20,
    severity: 'warning',
    title: 'Baja tasa de reemplazos exitosos',
    description: 'Menos del 20% de los reemplazos automáticos logran asignar un nuevo técnico.',
    params: [
      { name: 'replacementCutoffMinutes', label: 'Margen de reemplazo (replacementCutoffMinutes)', currentValue: (c) => c.replacementCutoffMinutes + ' min', suggestion: 'Aumentar la ventana de tiempo' },
    ],
  },
  {
    metricId: 7,
    condition: (v) => v > 48,
    severity: 'warning',
    title: 'Dentistas tardan mucho en revisar',
    description: 'El promedio de revisión supera las 48 horas.',
    params: [
      { name: 'tDentistReviewHours', label: 'Plazo de revisión del dentista (tDentistReviewHours)', currentValue: (c) => c.tDentistReviewHours + ' h', suggestion: 'Aumentar si el plazo no refleja el comportamiento real' },
    ],
  },
  {
    metricId: 8,
    condition: (v) => v < 0.25,
    severity: 'warning',
    title: 'Score de asignación muy bajo',
    description: 'El score promedio al asignar está por debajo de 0.25.',
    params: [
      { name: 'alphaQuality', label: 'Peso calidad (αQ)', currentValue: (c) => c.alphaQuality, suggestion: 'Ajustar si concentra demasiado peso' },
      { name: 'alphaPunctuality', label: 'Peso puntualidad (αP)', currentValue: (c) => c.alphaPunctuality, suggestion: 'Revisar en relación al resto de pesos' },
      { name: 'alphaExperience', label: 'Peso experiencia (αE)', currentValue: (c) => c.alphaExperience, suggestion: 'Revisar distribución Q/P/E/B/L/N' },
    ],
  },
  {
    metricId: 10,
    condition: (v) => v > 90,
    severity: 'warning',
    title: 'Técnicos tardan en responder',
    description: 'El tiempo medio de respuesta supera los 90 minutos.',
    params: [
      { name: 'tQuoteMinutes', label: 'Plazo de respuesta (tQuoteMinutes)', currentValue: (c) => c.tQuoteMinutes + ' min', suggestion: 'Aumentar si los técnicos necesitan más tiempo' },
    ],
  },
  {
    metricId: 11,
    condition: (v) => v < 1.5,
    severity: 'warning',
    title: 'Pocos candidatos por caso',
    description: 'En promedio cada caso recibe menos de 1.5 respuestas.',
    params: [
      { name: 'nInvited', label: 'Candidatos por corrida (nInvited)', currentValue: (c) => String(c.nInvited), suggestion: 'Aumentar para más candidatos por caso' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mv(metrics: ObservabilityMetric[], id: number): number | null {
  const m = metrics.find((x) => x.id === id);
  return m?.available && m.value != null ? m.value : null;
}

function formatMetricValue(rule: { metricValue: number; metricId: number }): string {
  if ([1, 2, 5, 6, 9, 12].includes(rule.metricId)) return `${rule.metricValue.toFixed(1)}%`;
  if (rule.metricId === 7) return `${rule.metricValue.toFixed(1)} h`;
  if (rule.metricId === 10) return `${rule.metricValue.toFixed(0)} min`;
  return rule.metricValue.toFixed(2);
}

function getActiveRules(metrics: ObservabilityMetric[], config: FauchardConfigRow): ActiveRule[] {
  const active: ActiveRule[] = [];
  for (const rule of RULES) {
    const m = metrics.find((x) => x.id === rule.metricId);
    if (!m || !m.available || m.value == null) continue;
    if (rule.condition(m.value)) active.push({ ...rule, metricValue: m.value, metricLabel: m.label });
  }
  const seen = new Map<string, boolean>();
  return active.filter((r) => {
    const key = `${r.metricId}-${r.severity}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    if (r.severity === 'warning' && active.some((x) => x.metricId === r.metricId && x.severity === 'critical')) return false;
    return true;
  });
}

function computeHealthScore(rules: ActiveRule[]): number {
  return Math.max(0, rules.reduce((acc, r) => acc - (r.severity === 'critical' ? 20 : 8), 100));
}

// ─── Subcomponentes ────────────────────────────────────────────────────────────

function HealthScore({ score, outOfRange }: { score: number; outOfRange: number }) {
  const color = score >= 75 ? 'var(--color-primary)' : score >= 50 ? '#f59e0b' : 'var(--color-error)';
  const label = score >= 75 ? 'Bueno' : score >= 50 ? 'Revisar' : 'Atención';
  return (
    <div className="p-6 rounded-3xl bg-surface/40 border border-divider flex items-center gap-8">
      <div className="shrink-0 text-right">
        <span className="text-5xl font-black" style={{ color }}>{score}</span>
        <span className="text-xl font-black text-muted">/100</span>
        <p className="text-xs font-black uppercase tracking-widest mt-0.5" style={{ color }}>{label}</p>
      </div>
      <div className="flex-1 space-y-2.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-foreground">Salud del motor de asignación</span>
          <span className="text-xs font-bold text-muted shrink-0">
            {outOfRange === 0 ? 'Todas las métricas en rango' : `${outOfRange} alerta${outOfRange > 1 ? 's' : ''} activa${outOfRange > 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${score}%`, background: color }}
          />
        </div>
        <p className="text-xs text-muted">75–100: buen estado · 50–74: revisar parámetros · 0–49: intervención recomendada · Crítico: −20 pts · Advertencia: −8 pts</p>
      </div>
    </div>
  );
}

function GaugeRow({
  label, pct, displayValue, threshold, thresholdLabel, ok,
}: {
  label: string; pct: number; displayValue: string;
  threshold: number; thresholdLabel: string; ok: boolean;
}) {
  const color = ok ? '#10b981' : '#f59e0b';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-sm font-black" style={{ color }}>{displayValue}</span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-surface-2 overflow-visible">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-muted/50 rounded-full"
          style={{ left: `${Math.min(threshold, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted">{thresholdLabel}</p>
    </div>
  );
}

function ResponsePanel({ metrics, config }: { metrics: ObservabilityMetric[]; config: FauchardConfigRow }) {
  const noResp = mv(metrics, 2) ?? 0;
  const explicitRatio = mv(metrics, 9) ?? 0;
  const avgTime = mv(metrics, 10);

  const responded = 100 - noResp;
  const rejected = responded * explicitRatio / 100;
  const accepted = Math.max(0, responded - rejected);

  const isTimeOk = avgTime != null && config.tQuoteMinutes ? avgTime < config.tQuoteMinutes / 2 : null;

  return (
    <div className="p-6 rounded-3xl bg-surface/40 border border-divider space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-muted mb-0.5">Respuesta del técnico</p>
        <p className="text-sm font-bold text-foreground">¿Qué hacen los técnicos con sus asignaciones?</p>
      </div>

      <div className="space-y-3">
        <div className="h-7 w-full rounded-xl overflow-hidden flex gap-px">
          <div style={{ width: `${accepted}%`, background: '#10b981' }} className="h-full transition-all duration-700 first:rounded-l-xl" />
          <div style={{ width: `${rejected}%`, background: '#f59e0b' }} className="h-full transition-all duration-700" />
          <div style={{ width: `${noResp}%`, background: '#ef4444' }} className="h-full transition-all duration-700 last:rounded-r-xl" />
        </div>
        <div className="flex gap-5 flex-wrap">
          {([
            { label: 'Aceptó', value: accepted, color: '#10b981' },
            { label: 'Rechazó', value: rejected, color: '#f59e0b' },
            { label: 'Sin respuesta', value: noResp, color: '#ef4444' },
          ] as const).map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="text-xs font-semibold text-muted">{s.label}</span>
              <span className="text-sm font-black text-foreground">{s.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 pt-1 border-t border-divider">
        <div className="flex gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-warning">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-warning inline-block" />
            Advertencia si sin respuesta &gt;25%
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-error">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-error inline-block" />
            Crítico si &gt;40%
          </div>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          <span className="font-bold text-foreground">Bueno:</span> &gt;70% acepta.{' '}
          <span className="font-bold text-foreground">Alerta:</span> Si "sin respuesta" crece, revisar el plazo configurado (<code className="text-xs bg-surface-2 px-1 rounded">tQuoteMinutes</code>).
          Si "rechazó" crece, puede haber sobrecarga o perfil mal calibrado en el ranking.
        </p>
      </div>

      {avgTime != null && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${
          isTimeOk === false
            ? 'bg-warning-hl border-warning/20 text-warning'
            : 'bg-primary-hl border-primary/20 text-primary'
        }`}>
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Tiempo medio de respuesta: {avgTime.toFixed(0)} min
          {config.tQuoteMinutes ? ` · plazo configurado: ${config.tQuoteMinutes} min` : ''}
        </div>
      )}
    </div>
  );
}

function CoveragePanel({ metrics }: { metrics: ObservabilityMetric[] }) {
  const pool = mv(metrics, 5);
  const replacements = mv(metrics, 6);

  const data = [
    {
      name: 'En espera (pool)',
      value: pool ?? 0,
      label: pool != null ? `${pool.toFixed(1)}%` : '—',
      fill: pool == null ? '#6b7280' : pool > 40 ? '#ef4444' : pool > 20 ? '#f59e0b' : '#10b981',
    },
    {
      name: 'Reemplazos exitosos',
      value: replacements ?? 0,
      label: replacements != null ? `${replacements.toFixed(1)}%` : '—',
      fill: replacements == null ? '#6b7280' : replacements < 20 ? '#f59e0b' : '#10b981',
    },
  ];

  return (
    <div className="p-6 rounded-3xl bg-surface/40 border border-divider space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-muted mb-0.5">Cobertura de asignación</p>
        <p className="text-sm font-bold text-foreground">¿El motor cubre la demanda disponible?</p>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 40, bottom: 8, left: 8 }}>
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} width={32} unit="%" />
            <Tooltip
              cursor={{ fill: 'var(--color-surface-2)', opacity: 0.4 }}
              contentStyle={{ borderRadius: 12, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', fontSize: 11 }}
              formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`]}
            />
            <ReferenceLine y={20} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: '20%', position: 'right', fontSize: 11, fill: '#f59e0b' }} />
            <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: '40%', position: 'right', fontSize: 11, fill: '#ef4444' }} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={72}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
              <LabelList dataKey="label" position="top" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--color-foreground)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5 pt-2 border-t border-divider">
        <p className="text-xs text-muted leading-relaxed">
          <span className="font-bold text-foreground">En espera (pool):</span> casos sin técnico elegible en este momento. Menos es mejor — por encima del 20% hay un problema de oferta, no de parámetros.
        </p>
        <p className="text-xs text-muted leading-relaxed">
          <span className="font-bold text-foreground">Reemplazos exitosos:</span> cuando un técnico rechaza, ¿el motor encuentra sustituto? Por debajo del 20% la ventana de reemplazo es muy corta (<code className="text-xs bg-surface-2 px-1 rounded">replacementCutoffMinutes</code>).
        </p>
      </div>
    </div>
  );
}

function ScorePanel({ metrics }: { metrics: ObservabilityMetric[] }) {
  const m1 = mv(metrics, 1);
  const m8 = mv(metrics, 8);
  const m11 = mv(metrics, 11);

  return (
    <div className="p-6 rounded-3xl bg-surface/40 border border-divider space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-muted mb-0.5">Score de asignación</p>
        <p className="text-sm font-bold text-foreground">¿La calidad del ranking es adecuada?</p>
      </div>
      <div className="space-y-5">
        <GaugeRow
          label="Técnicos en nivel de sanción (Niv 2 o 3)"
          pct={m1 ?? 0}
          displayValue={m1 != null ? `${m1.toFixed(1)}%` : '—'}
          threshold={30}
          thresholdLabel="Alerta si >30% — técnicos sancionados quedan fuera del pool elegible"
          ok={m1 == null || m1 <= 30}
        />
        <GaugeRow
          label="Score promedio al asignar"
          pct={m8 != null ? m8 * 100 : 0}
          displayValue={m8 != null ? m8.toFixed(2) : '—'}
          threshold={25}
          thresholdLabel="Alerta si <0.25 — indica que el ranking concentra puntos en pocos técnicos; re-tunear pesos α"
          ok={m8 == null || m8 >= 0.25}
        />
        <GaugeRow
          label="Asignaciones por caso"
          pct={m11 != null ? Math.min(m11 / 5 * 100, 100) : 0}
          displayValue={m11 != null ? m11.toFixed(1) : '—'}
          threshold={30}
          thresholdLabel="Alerta si <1.5 — cada caso recibe muy pocas respuestas; aumentar nInvited"
          ok={m11 == null || m11 >= 1.5}
        />
      </div>
    </div>
  );
}

const FUNNEL_COLORS = ['#14b8a6', '#10b981', '#0ea5e9', '#22c55e'];

function FunnelPanel({ funnel, windowDays }: { funnel: ObservabilityData['funnel']; windowDays: number }) {
  const { published, proposal, accepted, completed } = funnel;

  const conv = (a: number, b: number) => (b > 0 && a > 0 ? `${Math.round(a / b * 100)}%` : '');

  const data = [
    { stage: 'Publicados', n: published, label: `${published}` },
    { stage: 'Asignados', n: proposal, label: `${proposal}  ${conv(proposal, published)}` },
    { stage: 'En revisión', n: accepted, label: `${accepted}  ${conv(accepted, proposal)}` },
    { stage: 'Completados', n: completed, label: `${completed}  ${conv(completed, accepted)}` },
  ];

  return (
    <div className="p-6 rounded-3xl bg-surface/40 border border-divider space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-muted mb-0.5">Ciclo completo</p>
        <p className="text-sm font-bold text-foreground">¿Cuántos casos completan el proceso?</p>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, bottom: 8, left: 8 }}>
            <XAxis dataKey="stage" tick={{ fontSize: 12, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              cursor={{ fill: 'var(--color-surface-2)', opacity: 0.4 }}
              contentStyle={{ borderRadius: 12, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', fontSize: 11 }}
            />
            <Bar dataKey="n" radius={[8, 8, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i]} />)}
              <LabelList dataKey="label" position="top" style={{ fontSize: 12, fontWeight: 700, fill: 'var(--color-muted)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 pt-2 border-t border-divider">
        <p className="text-xs text-muted leading-relaxed">
          El porcentaje junto a cada barra es la conversión respecto al paso anterior.
          <span className="font-bold text-foreground"> Bueno:</span> conversión Publicado→Aceptado &gt;70%.
          Una caída brusca entre pasos indica dónde se pierde el caso — si cae en "Asignados" hay problema de oferta; si cae en "En revisión" el técnico no está entregando; si cae en "Completados" el dentista no está aprobando.
        </p>
      </div>
    </div>
  );
}

function CompactRec({ rule, config }: { rule: ActiveRule; config: FauchardConfigRow }) {
  const isCritical = rule.severity === 'critical';
  const firstParam = rule.params[0];
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-xs flex-wrap ${
      isCritical ? 'bg-error-hl border-error/20' : 'bg-warning-hl border-warning/20'
    }`}>
      {isCritical
        ? <AlertCircle className="w-4 h-4 text-error shrink-0" />
        : <AlertTriangle className="w-4 h-4 text-warning shrink-0" />}
      <span className="font-bold text-foreground">{rule.metricLabel}</span>
      <span className={`font-black ${isCritical ? 'text-error' : 'text-warning'}`}>
        {formatMetricValue(rule)}
      </span>
      {firstParam && (
        <>
          <span className="text-faint">→</span>
          <code className="font-mono text-xs bg-primary-hl text-primary px-1.5 py-0.5 rounded">
            {firstParam.name}
          </code>
          <span className="text-muted">{firstParam.currentValue(config)}</span>
          <span className="text-muted text-xs">{firstParam.suggestion}</span>
        </>
      )}
      <a
        href="/dashboard/admin/fauchard"
        className="ml-auto flex items-center gap-1 text-xs font-bold text-primary hover:underline shrink-0"
      >
        <ExternalLink className="w-3 h-3" /> Configuración
      </a>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

interface Props {
  initialData: ObservabilityData;
  initialDays: number;
  config: FauchardConfigRow;
}

export default function CalibrationPanel({ initialData, initialDays, config }: Props) {
  const [data, setData] = useState<ObservabilityData>(initialData);
  const [days] = useState(initialDays);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getObservabilityMetricsAction(days);
    setLoading(false);
    if (res.success) setData(res.data);
    else setError(res.error ?? 'Error al cargar métricas');
  }, [days]);

  const activeRules = getActiveRules(data.metrics, config);
  const score = computeHealthScore(activeRules);

  return (
    <div className="flex flex-col gap-8">
      {/* Controles */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          Actualizado {new Date(data.generatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <Button onClick={refresh} loading={loading} variant="secondary" icon={<RefreshCw className="w-4 h-4" />}>
          Refrescar
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-error-hl border border-error/30 text-error text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Score de salud */}
      <HealthScore score={score} outOfRange={activeRules.length} />

      {/* 4 paneles de gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResponsePanel metrics={data.metrics} config={config} />
        <CoveragePanel metrics={data.metrics} />
        <ScorePanel metrics={data.metrics} />
        <FunnelPanel funnel={data.funnel} windowDays={data.windowDays} />
      </div>

      {/* Recomendaciones compactas */}
      {activeRules.length === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-surface/40 border border-divider">
          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs font-bold text-foreground">
            El motor opera dentro de rangos normales — no hay alertas activas en los últimos {days} días.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-foreground">
            Recomendaciones ({activeRules.length})
            <span className="ml-2 text-xs font-bold text-muted normal-case tracking-normal">
              — parámetros a revisar según las alertas activas
            </span>
          </h2>
          {activeRules.map((rule, i) => (
            <CompactRec key={`${rule.metricId}-${i}`} rule={rule} config={config} />
          ))}
        </div>
      )}

    </div>
  );
}
