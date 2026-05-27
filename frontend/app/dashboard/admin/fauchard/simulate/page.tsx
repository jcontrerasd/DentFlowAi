import { getFauchardConfigAction } from '@/lib/db/actions/fauchard';
import FauchardNav from '@/components/admin/fauchard/FauchardNav';
import SimulatorPanel from '@/components/admin/fauchard/SimulatorPanel';
import { FlaskConical, AlertTriangle, Info } from 'lucide-react';

export const metadata = {
  title: 'Simulador Fauchard | Admin DentFlow',
};

export default async function AdminFauchardSimulatePage() {
  const res = await getFauchardConfigAction();

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
    <div className="flex flex-col gap-10 p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
              <FlaskConical className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Simulador Sandbox</h1>
          </div>
          <p className="text-faint text-sm font-medium">Prueba cambios en los pesos sin afectar la operación real.</p>
        </div>
      </header>

      <FauchardNav />

      <SimulatorPanel currentConfig={res.config} />

      <div className="p-8 rounded-[3rem] bg-surface/40 border border-divider flex gap-6 items-start">
        <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-muted shrink-0">
          <Info className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">¿Cómo funciona la simulación?</h4>
          <p className="text-xs text-faint leading-relaxed">
            El simulador utiliza el pool de técnicos <strong>real</strong> y les aplica los filtros duros actuales 
            (disponibilidad, cooldown, habilidades). Luego calcula el score base para cada técnico usando los pesos 
            seleccionados y genera una distribución probabilística teórica. 
            <br /><br />
            Esto te permite predecir si un cambio en los pesos $\alpha$ resultará en una asignación más equitativa o si 
            se concentrará demasiado en unos pocos técnicos.
          </p>
        </div>
      </div>
    </div>
  );
}
