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
import SimulatorPanel from '@/components/admin/fauchard/SimulatorPanel';
import { FlaskConical, AlertTriangle, Info } from 'lucide-react';

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
    <div className="flex flex-col gap-10 p-4 md:p-8 max-w-[1700px] mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
              <FlaskConical className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Simulador Sandbox</h1>
          </div>
          <p className="text-faint text-sm font-medium">
            Simula precio de lista y asignación directa con datos completos del caso virtual.
          </p>
        </div>
      </header>

      <FauchardNav />

      <SimulatorPanel
        currentConfig={res.config}
        catalogOptions={{
          restorations,
          materials,
          shades,
          urgencies,
        }}
      />

      <div className="p-8 rounded-[3rem] bg-surface/40 border border-divider flex gap-6 items-start">
        <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-muted shrink-0">
          <Info className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">¿Cómo funciona la simulación?</h4>
          <ol className="text-xs text-faint leading-relaxed list-decimal list-inside space-y-2">
            <li>Precio de lista: lookup por restauración, material, shade y urgencia (misma regla que al publicar).</li>
            <li>Clasificación del caso virtual: se deriva <em>workType</em>, liga y categoría de disponibilidad.</li>
            <li>Filtros duros idénticos a publicación: liga, suspensión, inactividad, cooldown, skill mínimo y AND-triple v5.0.</li>
            <li>Score Q/P/E/L/N y ranking determinístico; el #1 es el asignado y los siguientes forman la cadena de respaldo.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
