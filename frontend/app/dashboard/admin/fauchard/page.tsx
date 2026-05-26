import { getFauchardConfigAction } from '@/lib/db/actions/fauchard';
import FauchardNav from '@/components/admin/fauchard/FauchardNav';
import { Settings2, Sliders, Trophy, History, ShieldCheck, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const metadata = {
  title: 'Motor Fauchard | Admin DentFlow',
};

export default async function AdminFauchardPage() {
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
    <div className="flex flex-col gap-10 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
              <Settings2 className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Motor Fauchardón</h1>
          </div>
          <p className="text-faint text-sm font-medium">Configura los parámetros inteligentes de asignación de técnicos.</p>
        </div>

        <div className="flex items-center gap-4 px-6 py-3 rounded-3xl bg-surface/40 border border-divider shadow-xl">
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-bold uppercase tracking-wider text-faint">Versión Activa</span>
            <span className="text-sm font-black text-foreground">V{config.version}</span>
          </div>
          <div className="w-px h-8 bg-surface-2" />
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-bold uppercase tracking-wider text-faint">Último Cambio</span>
            <span className="text-[11px] font-bold text-muted">
              {format(new Date(config.updatedAt), "dd/MM/yy HH:mm", { locale: es })}
            </span>
          </div>
        </div>
      </header>

      <FauchardNav />

      {/* Tabs / Content Section */}
      <TabContainer config={config} />
    </div>
  );
}

// Client Component for Tabs
import { TabClient } from './TabClient';

function TabContainer({ config }: { config: any }) {
  return <TabClient config={config} />;
}
