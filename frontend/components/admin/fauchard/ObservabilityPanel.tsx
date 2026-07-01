'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { RefreshCw, AlertCircle, HelpCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  getObservabilityMetricsAction,
  type ObservabilityData,
  type ObservabilityMetric,
} from '@/lib/db/actions/observability';
import FauchardHelpButton from './FauchardHelpButton';
import FauchardHelpWindow from './FauchardHelpWindow';
import { OBSERVABILITY_HELP } from '@/lib/constants/fauchardHelp';

/**
 * Dashboard de observabilidad (v5.0, §11.3). 13 métricas = termómetro. Refresh
 * manual con indicador de última actualización (sin polling). Lazy-loaded.
 */

const WINDOWS = [7, 30, 90];

function formatMetric(m: ObservabilityMetric): string {
  if (!m.available || m.value == null) return '—';
  switch (m.kind) {
    case 'pct': return `${m.value.toFixed(1)}%`;
    case 'hours': return `${m.value.toFixed(1)} h`;
    case 'minutes': return `${m.value.toFixed(0)} min`;
    default: return m.value.toFixed(2);
  }
}

/** Tarjeta de ayuda de OBSERVABILITY_HELP para una métrica (#N), incluyendo la
 *  tarjeta agrupada "#3·#4·#12". Devuelve el símbolo a enfocar y la descripción. */
function helpForMetric(id: number) {
  const sym = `#${id}`;
  return (
    OBSERVABILITY_HELP.params.find((p) => p.symbol === sym) ??
    OBSERVABILITY_HELP.params.find((p) => (p.symbol ?? '').split('·').includes(sym))
  );
}

export default function ObservabilityPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ObservabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [helpFocus, setHelpFocus] = useState<string | null>(null);
  const openHelp = (focus?: string | null) => { setHelpFocus(focus ?? null); setShowHelp(true); };

  const load = useCallback(async (window: number) => {
    setLoading(true);
    setError(null);
    const res = await getObservabilityMetricsAction(window);
    setLoading(false);
    if (res.success) setData(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  const funnelData = data
    ? [
        { stage: 'Publicado', n: data.funnel.published },
        { stage: 'Propuesta', n: data.funnel.proposal },
        { stage: 'Aceptada', n: data.funnel.accepted },
        { stage: 'Completado', n: data.funnel.completed },
      ]
    : [];
  const funnelColors = ['#14b8a6', '#10b981', '#0ea5e9', '#22c55e'];

  return (
    <div className="flex flex-col gap-8">
      {/* Controles */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-surface/60 border border-divider rounded-full">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
                days === w ? 'bg-surface-2 text-primary border border-divider' : 'text-faint hover:text-muted'
              }`}
            >
              {w} días
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          {data && (
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Última actualización {new Date(data.generatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <FauchardHelpButton onClick={() => openHelp()} label="Observabilidad" />
          <Button onClick={() => load(days)} loading={loading} variant="secondary" icon={<RefreshCw className="w-4 h-4" />}>
            Refrescar
          </Button>
        </div>
      </div>

      <FauchardHelpWindow isOpen={showHelp} onClose={() => setShowHelp(false)} section={OBSERVABILITY_HELP} focusKey={helpFocus} />

      {error && (
        <div className="p-4 rounded-2xl bg-error-hl border border-error/30 text-error text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data?.metrics ?? []).map((m) => {
          const help = helpForMetric(m.id);
          return (
            <div
              key={m.id}
              className={`p-5 rounded-3xl border ${m.available ? 'bg-surface/40 border-divider' : 'bg-surface/20 border-divider/50 opacity-60'}`}
              title={help?.description ?? m.hint}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">#{m.id}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-2xl font-black ${m.available ? 'text-foreground' : 'text-faint'}`}>{formatMetric(m)}</span>
                  {help && (
                    <button
                      type="button"
                      onClick={() => openHelp(help.symbol)}
                      className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-white/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      title="Ver explicación y parámetros a ajustar"
                      aria-label={`Ayuda de la métrica ${m.label}`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs font-bold text-muted mt-2">{m.label}</p>
              <p className="text-xs text-muted mt-1 leading-snug">{m.hint}</p>
            </div>
          );
        })}
      </div>

      {/* Funnel (métrica 13) */}
      <div className="p-6 rounded-3xl bg-surface/40 border border-divider">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-xs font-black uppercase tracking-wider text-primary">#13 · Funnel del caso</h3>
          <button
            type="button"
            onClick={() => openHelp('#13')}
            className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-white/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title="Ver explicación del funnel"
            aria-label="Ayuda del funnel del caso"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted mb-5">Publicado → Propuesta lista → Aceptada → Completado (últimos {data?.windowDays ?? days} días)</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <XAxis dataKey="stage" tick={{ fontSize: 11, fill: 'var(--color-faint)' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-faint)' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip cursor={{ fill: 'var(--color-surface-2)', opacity: 0.4 }} contentStyle={{ borderRadius: 12, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', fontSize: 12 }} />
              <Bar dataKey="n" radius={[8, 8, 0, 0]}>
                {funnelData.map((_, i) => <Cell key={i} fill={funnelColors[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-xs text-muted italic">
        Métricas 3, 4 y 12 requieren historial de eventos que se registra en Fase 6 (crons). Se muestran como "—".
      </p>
    </div>
  );
}
