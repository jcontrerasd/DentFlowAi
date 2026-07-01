import FauchardNav from '@/components/admin/fauchard/FauchardNav';
import { Settings2 } from 'lucide-react';

/** Reclama espacio del padding global del dashboard (section p-10) en rutas Fauchard. */
export default function FauchardSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-6 -mt-4 mb-0 sm:-mx-8 lg:-mx-10 lg:-mt-6">
      {/* Header compartido — siempre en la misma posición al navegar entre pestañas */}
      <div className="flex items-center justify-between gap-4 px-3 md:px-4 pt-3 pb-2 border-b border-divider/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Settings2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-lg font-black text-foreground uppercase tracking-tighter leading-none">Motor Fauchard</p>
            <p className="text-[10px] text-faint font-medium hidden sm:block">Parámetros de asignación de técnicos</p>
          </div>
        </div>
        <FauchardNav />
      </div>
      {children}
    </div>
  );
}
