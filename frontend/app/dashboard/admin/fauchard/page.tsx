export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import { getFauchardConfigAction } from '@/lib/db/actions/fauchard';
import { isAvailabilityAdminPanelEnabled } from '@/lib/constants/availabilityFlags';
import FauchardNav from '@/components/admin/fauchard/FauchardNav';
import { Settings2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const metadata = {
  title: 'Motor Fauchard | Admin DentFlow',
};

export default async function AdminFauchardPage() {
  // Guard server-side: solo admin. Un técnico/dentista que escriba la URL es
  // redirigido a su dashboard (el menú ya no expone esta ruta a esos roles).
  const identity = await getServerIdentity();
  if (!identity || (identity.role !== 'admin' && !identity.isSystemAdmin)) {
    redirect('/dashboard');
  }

  const res = await getFauchardConfigAction();

  if (!res.success) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-[2rem] bg-error-hl border border-error/30 flex items-center justify-center text-error">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-black text-foreground uppercase tracking-tighter">Error de Configuración</h1>
        <p className="text-faint text-sm max-w-md text-center">{res.error}</p>
      </div>
    );
  }

  const config = res.config;

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4 max-w-[1700px] mx-auto">
      {/* Header compacto + subnav en una fila */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg font-black text-foreground uppercase tracking-tighter leading-none">Motor Fauchard</h1>
              <p className="text-[10px] text-faint font-medium hidden sm:block">Parámetros de asignación de técnicos</p>
            </div>
          </div>
          <FauchardNav className="mb-0" />
        </div>

        <div className="flex items-center gap-3 px-3 py-1.5 rounded-2xl bg-surface/40 border border-divider shrink-0">
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-bold uppercase tracking-wider text-faint">Versión</span>
            <span className="text-xs font-black text-foreground">V{config.version}</span>
          </div>
          <div className="w-px h-6 bg-surface-2" />
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-bold uppercase tracking-wider text-faint">Actualizado</span>
            <span className="text-[10px] font-bold text-muted">
              {format(new Date(config.updatedAt), "dd/MM/yy HH:mm", { locale: es })}
            </span>
          </div>
        </div>
      </header>

      <TabContainer config={config} showAvailabilityPanel={isAvailabilityAdminPanelEnabled()} />
    </div>
  );
}

// Client Component for Tabs
import { Suspense } from 'react';
import { TabClient } from './TabClient';

function TabContainer({ config, showAvailabilityPanel }: { config: any; showAvailabilityPanel: boolean }) {
  // Suspense: TabClient usa useSearchParams (deep-link de parámetros vía ?focus=).
  return (
    <Suspense fallback={null}>
      <TabClient config={config} showAvailabilityPanel={showAvailabilityPanel} />
    </Suspense>
  );
}
