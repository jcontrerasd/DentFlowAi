export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import {
  listRestorationTypesAction,
  listDentalMaterialsAction,
  listVitaShadesAction,
  listUrgencyLevelsAction,
} from '@/lib/db/actions/catalogs';
import { getFauchardConfigAction } from '@/lib/db/actions/fauchard';
import SimulatorWorkspace from '@/components/admin/fauchard/simulator/SimulatorWorkspace';
import { SimulatorHelpHost } from '@/components/admin/fauchard/SimulatorHelp';
import { FlaskConical, AlertTriangle } from 'lucide-react';

export const metadata = {
  title: 'Simulador Fauchard | Admin DentFlow',
};

export default async function AdminFauchardSimulatePage() {
  const identity = await getServerIdentity();
  if (!identity || (identity.role !== 'admin' && !identity.isSystemAdmin)) {
    redirect('/dashboard');
  }

  const [res, restorations, materials, shades, urgencies] = await Promise.all([
    getFauchardConfigAction(),
    listRestorationTypesAction(),
    listDentalMaterialsAction(),
    listVitaShadesAction(),
    listUrgencyLevelsAction(),
  ]);

  if (!res.success) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-[2rem] bg-error-hl border border-error/30 flex items-center justify-center text-error">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-black text-foreground uppercase tracking-tighter">Error</h1>
        <p className="text-faint text-sm">{res.error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 md:p-8 max-w-[1700px] mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
              <FlaskConical className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Simulador</h1>
          </div>
          <p className="text-faint text-sm font-medium">Caso virtual, precio de lista y asignación directa con la config activa.</p>
        </div>
      </header>

      <SimulatorWorkspace
        currentConfig={res.config}
        catalogOptions={{
          restorations,
          materials,
          shades,
          urgencies,
        }}
      />

      <SimulatorHelpHost />
    </div>
  );
}
