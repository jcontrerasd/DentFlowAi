'use client';

import { Clock, TrendingUp, XCircle, Calendar, BookOpen } from 'lucide-react';

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
          sub="Técnicos que respondieron a su asignación"
          icon={<Clock className="w-4 h-4" />}
          color="teal"
        />
        <MetricCard
          label="Tasa aceptación"
          value={`${(metrics.technicianAcceptanceRate * 100).toFixed(1)}%`}
          sub="De las respuestas, cuántas terminaron en trabajo aceptado"
          icon={<TrendingUp className="w-4 h-4" />}
          color="indigo"
        />
        <MetricCard
          label="Casos sin asignación"
          value={metrics.failedCases.length.toString()}
          sub="Casos que no pudieron asignarse a ningún técnico"
          icon={<XCircle className="w-4 h-4" />}
          color={metrics.failedCases.length > 0 ? 'red' : 'slate'}
        />
        <MetricCard
          label="Tiempo medio respuesta"
          value={avgResp}
          sub="Tiempo entre recibir asignación y responder"
          icon={<Calendar className="w-4 h-4" />}
          color="slate"
        />
      </div>

      {/* Guía de lectura */}
      <div className="rounded-3xl bg-surface/40 border border-divider p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-muted">Cómo leer este panel</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ReadingHint
            term="Asig."
            description="Cuántas veces fue asignado un caso a este técnico en el período."
          />
          <ReadingHint
            term="Resp."
            description="De esas asignaciones, cuántas recibieron respuesta (aceptó o rechazó) antes de que venciera el plazo."
          />
          <ReadingHint
            term="Acept."
            description="De las que respondió, cuántas terminaron en trabajo aceptado y ejecutado."
          />
          <ReadingHint
            term="Tasa respuesta"
            description="Resp. ÷ Asig. Un valor bajo indica técnicos que no responden a tiempo o con el plazo muy ajustado."
          />
          <ReadingHint
            term="Tasa aceptación"
            description="Acept. ÷ Resp. Un valor bajo indica técnicos que responden pero rechazan — puede ser por carga o preferencia."
          />
          <ReadingHint
            term="Tiempo medio"
            description="Minutos promedio entre que llega la asignación y el técnico responde. Ideal: menos de la mitad del plazo configurado."
          />
        </div>

        <p className="text-xs text-muted border-t border-divider pt-4 leading-relaxed">
          La barra de cada técnico muestra su volumen relativo de asignaciones. Los colores indican su liga actual:{' '}
          <span className="font-semibold text-muted">Bronce · Plata · Oro · Élite</span>.
          Un técnico con muchas asignaciones y baja aceptación puede indicar sobrecarga o perfil mal calibrado en Fauchard.
        </p>
      </div>
    </div>
  );
}

function ReadingHint({ term, description }: { term: string; description: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-[10px] font-black text-primary bg-primary-hl border border-primary/20 rounded-lg px-2 py-0.5 h-fit shrink-0 mt-0.5 whitespace-nowrap">
        {term}
      </span>
      <p className="text-xs text-foreground leading-relaxed">{description}</p>
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
        <span className="text-[10px] font-black uppercase text-muted tracking-widest block mb-1">{label}</span>
        <span className="text-2xl font-black text-foreground">{value}</span>
        <p className="text-xs text-muted mt-1 font-medium">{sub}</p>
      </div>
    </div>
  );
}
