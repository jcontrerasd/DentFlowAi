'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Button from '@/components/ui/Button';

type ActionStats = {
  p50: number;
  p95: number;
  p99: number;
  count: number;
  avgMs: number;
};

type PerfSample = {
  action: string;
  durationMs: number;
  ts: number;
};

type SnapshotData = {
  stats: Record<string, ActionStats>;
  recentSamples: PerfSample[];
  capturedAt: string;
};

const THRESHOLDS = { ok: 300, warn: 800 };

function colorForMs(ms: number): string {
  if (ms < THRESHOLDS.ok) return '#2dd4bf';   // teal
  if (ms < THRESHOLDS.warn) return '#fbbf24';  // amber
  return '#f87171';                             // red
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function StatCell({ label, value, ms }: { label: string; value: string; ms: number }) {
  return (
    <div className="text-center">
      <div className="text-xs text-white/40 mb-0.5">{label}</div>
      <div className="text-sm font-mono font-semibold" style={{ color: colorForMs(ms) }}>{value}</div>
    </div>
  );
}

export default function PerfLatencyPanel() {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/perf-snapshot');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = data
    ? Object.entries(data.stats).sort((a, b) => b[1].p95 - a[1].p95)
    : [];

  const chartData = rows.map(([action, s]) => ({
    name: action.replace(/Action$/, '').replace(/\./g, '·'),
    p50: s.p50,
    p95: s.p95,
    p99: s.p99,
  }));

  const totalSamples = rows.reduce((n, [, s]) => n + s.count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-teal-400" />
          <h2 className="text-base font-semibold text-white">Latencias de Server Actions</h2>
          {data && (
            <span className="text-xs text-white/40 ml-1">
              {totalSamples} samples · actualizado {new Date(data.capturedAt).toLocaleTimeString('es-CL')}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/30 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!data && !loading && !error && (
        <p className="text-sm text-white/40">Sin datos aún. Los samples se acumulan con el tráfico del servidor.</p>
      )}

      {/* Leyenda umbrales */}
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block" /> &lt; 300 ms — OK</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 300–800 ms — Lento</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> &gt; 800 ms — Crítico</span>
      </div>

      {rows.length > 0 && (
        <>
          {/* Tabla de stats */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-white/40 border-b border-white/10">
                  <th className="text-left py-2 pr-4 font-medium">Acción</th>
                  <th className="text-right py-2 px-3 font-medium">P50</th>
                  <th className="text-right py-2 px-3 font-medium">P95</th>
                  <th className="text-right py-2 px-3 font-medium">P99</th>
                  <th className="text-right py-2 px-3 font-medium">Avg</th>
                  <th className="text-right py-2 pl-3 font-medium">Samples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map(([action, s]) => (
                  <tr key={action} className="hover:bg-white/[0.02] transition-colors duration-150">
                    <td className="py-2.5 pr-4 font-mono text-xs text-white/70">{action}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs" style={{ color: colorForMs(s.p50) }}>{fmtMs(s.p50)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs" style={{ color: colorForMs(s.p95) }}>{fmtMs(s.p95)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs" style={{ color: colorForMs(s.p99) }}>{fmtMs(s.p99)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs text-white/50">{fmtMs(s.avgMs)}</td>
                    <td className="py-2.5 pl-3 text-right text-white/40 text-xs">{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Gráfico de barras P50/P95 */}
          {chartData.length > 0 && (
            <div>
              <p className="text-xs text-white/40 mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> P50 y P95 por acción (ms)
              </p>
              <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 36)}>
                <BarChart layout="vertical" data={chartData} margin={{ left: 4, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1e2a2a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12 }}
                    formatter={(v) => [`${fmtMs(Number(v ?? 0))}`, '']}
                  />
                  <Bar dataKey="p50" name="P50" radius={[0, 3, 3, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={colorForMs(entry.p50)} fillOpacity={0.6} />
                    ))}
                  </Bar>
                  <Bar dataKey="p95" name="P95" radius={[0, 3, 3, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={colorForMs(entry.p95)} fillOpacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Últimos samples */}
          {data?.recentSamples && data.recentSamples.length > 0 && (
            <details className="group">
              <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60 transition-colors select-none">
                Últimos {data.recentSamples.length} samples individuales
              </summary>
              <div className="mt-2 max-h-64 overflow-y-auto font-mono text-xs space-y-px">
                {data.recentSamples.map((s, i) => (
                  <div key={i} className="flex gap-3 py-0.5">
                    <span className="text-white/25 shrink-0">{new Date(s.ts).toLocaleTimeString('es-CL')}</span>
                    <span className="text-white/50 truncate flex-1">{s.action}</span>
                    <span className="shrink-0" style={{ color: colorForMs(s.durationMs) }}>{fmtMs(s.durationMs)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
