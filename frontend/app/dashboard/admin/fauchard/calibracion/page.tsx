export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import { getObservabilityMetricsAction } from '@/lib/db/actions/observability';
import { getActiveConfig } from '@/lib/db/actions/fauchard';
import CalibrationPanel from '@/components/admin/fauchard/CalibrationPanel';
import { Gauge, AlertTriangle } from 'lucide-react';

export const metadata = {
  title: 'Diagnóstico Fauchard | Admin DentFlow',
};

export default async function AdminFauchardCalibrationPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const identity = await getServerIdentity();
  if (!identity || (identity.role !== 'admin' && !identity.isSystemAdmin)) {
    redirect('/dashboard');
  }

  const sp = await searchParams;
  const days = parseInt(sp.days as string) || 30;

  const [metricsRes, config] = await Promise.all([
    getObservabilityMetricsAction(days),
    getActiveConfig(),
  ]);

  if (!metricsRes.success) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-[2rem] bg-error-hl border border-error/30 flex items-center justify-center text-error">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-black text-foreground uppercase tracking-tighter">Error de Carga</h1>
        <p className="text-faint text-sm">{metricsRes.error ?? 'Error desconocido'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 p-4 md:p-8 max-w-[1700px] mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
              <Gauge className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Diagnóstico del Motor</h1>
          </div>
          <p className="text-faint text-sm font-medium">KPIs operativos y recomendaciones de ajuste del motor de asignación.</p>
        </div>

        <div className="flex items-center gap-2 p-1 bg-surface/60 border border-divider rounded-2xl">
          {[7, 30, 90].map((d) => (
            <a
              key={d}
              href={`?days=${d}`}
              className={`px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                days === d ? 'bg-surface-2 text-foreground border border-divider' : 'text-faint hover:text-muted'
              }`}
            >
              {d} Días
            </a>
          ))}
        </div>
      </header>

      <CalibrationPanel initialData={metricsRes.data} initialDays={days} config={config} />
    </div>
  );
}
