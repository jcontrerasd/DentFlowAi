'use client';

import { Clock, TrendingUp, XCircle, Calendar } from 'lucide-react';

interface AssignmentMetricsPanelProps {
  metrics: {
    technicianResponseRate: number;
    technicianAcceptanceRate: number;
    avgResponseMinutes: number | null;
    failedCases: { caseId: string; reason: string; createdAt: string | Date }[];
  };
}

export default function AssignmentMetricsPanel({ metrics }: AssignmentMetricsPanelProps) {
  const avgResp =
    metrics.avgResponseMinutes != null
      ? `${Math.round(metrics.avgResponseMinutes)}m`
      : '—';

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Tasa respuesta técnico"
          value={`${(metrics.technicianResponseRate * 100).toFixed(1)}%`}
          sub="Asignaciones con respuesta (aceptó/rechazó)"
          icon={<Clock className="w-4 h-4" />}
          color="teal"
        />
        <MetricCard
          label="Tasa aceptación"
          value={`${(metrics.technicianAcceptanceRate * 100).toFixed(1)}%`}
          sub="Aceptadas / (aceptadas + rechazadas)"
          icon={<TrendingUp className="w-4 h-4" />}
          color="indigo"
        />
        <MetricCard
          label="Casos sin asignación"
          value={metrics.failedCases.length.toString()}
          sub="Estados sin_asignacion_fallo / sin_cotizaciones_fallo"
          icon={<XCircle className="w-4 h-4" />}
          color={metrics.failedCases.length > 0 ? 'red' : 'slate'}
        />
        <MetricCard
          label="Tiempo medio respuesta"
          value={avgResp}
          sub="Promedio respondedAt − assignedAt"
          icon={<Calendar className="w-4 h-4" />}
          color="slate"
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, icon, color }: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
}) {
  const colors: Record<string, string> = {
    teal: 'text-primary bg-primary-hl border-primary/20',
    indigo: 'text-primary bg-primary-hl border-primary/20',
    red: 'text-error bg-error-hl border-error/30',
    slate: 'text-muted bg-surface-2 border-divider',
  };

  return (
    <div className="p-6 rounded-3xl bg-surface/40 border border-divider shadow-xl flex flex-col gap-4">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <span className="text-[9px] font-black uppercase text-faint tracking-widest block mb-1">{label}</span>
        <span className="text-2xl font-black text-foreground">{value}</span>
        <p className="text-[10px] text-faint mt-1 font-medium">{sub}</p>
      </div>
    </div>
  );
}
