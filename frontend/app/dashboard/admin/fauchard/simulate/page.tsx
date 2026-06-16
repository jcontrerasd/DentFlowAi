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
import FauchardNav from '@/components/admin/fauchard/FauchardNav';
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
    <div className="flex flex-col gap-3 p-3 md:p-4 max-w-[1700px] mx-auto">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <FlaskConical className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-foreground uppercase tracking-tighter leading-tight">
              Simulador Sandbox
            </h1>
            <p className="text-faint text-xs font-medium truncate sm:whitespace-normal">
              Caso virtual, precio de lista y asignación directa con la config activa.
            </p>
          </div>
        </div>
        <FauchardNav className="!mb-0 shrink-0" />
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
