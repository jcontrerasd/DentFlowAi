export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import { getFauchardMetricsAction } from '@/lib/db/actions/fauchard';
import ConcentrationAlert from '@/components/admin/fauchard/ConcentrationAlert';
import AssignmentDistributionChart from '@/components/admin/fauchard/AssignmentDistributionChart';
import AssignmentMetricsPanel from '@/components/admin/fauchard/AssignmentMetricsPanel';
import FailedSelectionsPanel from '@/components/admin/fauchard/FailedSelectionsPanel';
import PerfLatencyPanel from '@/components/admin/PerfLatencyPanel';
import { Activity, AlertTriangle } from 'lucide-react';

export const metadata = {
  title: 'Monitoreo Fauchard | Admin DentFlow',
};

export default async function AdminFauchardMonitorPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const identity = await getServerIdentity();
  if (!identity || (identity.role !== 'admin' && !identity.isSystemAdmin)) {
    redirect('/dashboard');
  }

  const sp = await searchParams;
  const days = parseInt(sp.days as string) || 30;
  const res = await getFauchardMetricsAction(days);

  if (!res.success) {
    return <ErrorState message={res.error ?? 'Error desconocido'} />;
  }

  const { metrics } = res;

  return (
    <div className="flex flex-col gap-10 p-4 md:p-8 max-w-[1700px] mx-auto">
      <Header days={days} />

      <div className="space-y-12">
        <ConcentrationAlert alerts={metrics.alerts} topQuartileShare={metrics.topQuartileShare} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <AssignmentDistributionChart data={metrics.assignmentsByTechnician} />
          </div>
          <div className="lg:col-span-7">
            <AssignmentMetricsPanel metrics={metrics} />
          </div>
        </div>

        <FailedSelectionsPanel failedCases={metrics.failedCases} />

        {/* Panel de latencias de server actions — datos en memoria del proceso actual */}
        <section className="bg-surface/40 border border-divider rounded-2xl p-6">
          <PerfLatencyPanel />
        </section>
      </div>
    </div>
  );
}

function Header({ days }: { days: number }) {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
            <Activity className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Monitoreo y Equidad</h1>
        </div>
        <p className="text-faint text-sm font-medium">Monitoreo de equidad y desempeño — asignación directa.</p>
      </div>

      <div className="flex items-center gap-2 p-1 bg-surface/60 border border-divider rounded-2xl">
        {[30, 90, 365].map((d) => (
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
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-16 h-16 rounded-[2rem] bg-error-hl border border-error/30 flex items-center justify-center text-error">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h1 className="text-xl font-black text-foreground uppercase tracking-tighter">Error de Carga</h1>
      <p className="text-faint text-sm">{message}</p>
    </div>
  );
}
