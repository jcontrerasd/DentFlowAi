export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import { getFauchardConfigAction, listAllConfigVersionsAction, getConfigVersionKpisAction } from '@/lib/db/actions/fauchard';
import type { ConfigVersionKpis } from '@/lib/db/actions/fauchard';
import { isAvailabilityAdminPanelEnabled } from '@/lib/constants/availabilityFlags';
import { AlertTriangle, SlidersHorizontal } from 'lucide-react';
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

  const isSystemAdmin = identity.isSystemAdmin ?? false;

  const [res, versionsRes] = await Promise.all([
    getFauchardConfigAction(),
    listAllConfigVersionsAction(),
  ]);

  // Precarga KPIs de versiones inactivas en el servidor para evitar flicker en cliente
  const versions = versionsRes.success ? versionsRes.versions : [];
  const inactiveVersions = versions.filter((v) => !v.isActive);
  const kpisResults = await Promise.all(
    inactiveVersions.map((v) => getConfigVersionKpisAction(v.id).then((r) => ({ id: v.id, kpis: r.success ? r.kpis : null })))
  );
  const initialKpisCache: Record<string, ConfigVersionKpis> = {};
  for (const r of kpisResults) if (r.kpis) initialKpisCache[r.id] = r.kpis;

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
    <div className="flex flex-col gap-3 p-4 md:p-8 max-w-[1700px] mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Configuración</h1>
          </div>
          <p className="text-faint text-sm font-medium">Parámetros globales del motor de asignación directa.</p>
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

      <TabContainer
        config={config}
        showAvailabilityPanel={isAvailabilityAdminPanelEnabled()}
        versions={versions}
        initialKpisCache={initialKpisCache}
        isSystemAdmin={isSystemAdmin}
      />
    </div>
  );
}

// Client Component for Tabs
import { Suspense } from 'react';
import { TabClient } from './TabClient';
import type { ConfigVersionMeta } from '@/lib/db/actions/fauchard';

function TabContainer({
  config,
  showAvailabilityPanel,
  versions,
  initialKpisCache,
  isSystemAdmin,
}: {
  config: any;
  showAvailabilityPanel: boolean;
  versions: ConfigVersionMeta[];
  initialKpisCache: Record<string, ConfigVersionKpis>;
  isSystemAdmin: boolean;
}) {
  // Suspense: TabClient usa useSearchParams (deep-link de parámetros vía ?focus=).
  return (
    <Suspense fallback={null}>
      <TabClient
        config={config}
        showAvailabilityPanel={showAvailabilityPanel}
        versions={versions}
        initialKpisCache={initialKpisCache}
        isSystemAdmin={isSystemAdmin}
      />
    </Suspense>
  );
}
