import { Layers } from 'lucide-react';
import { SimulatorParamHelpButton } from '../../SimulatorHelp';
import { WORK_CATEGORY_LABELS, WORK_TYPE_LABELS } from '@/lib/constants/dental';
import type { LiveScenario } from '../simulatorTypes';
import SimulatorBadge from '../shared/SimulatorBadge';

export default function SimulatorStepClasificacion({ liveScenario }: { liveScenario: LiveScenario }) {
  const categoryLabel = WORK_CATEGORY_LABELS[liveScenario.category] ?? liveScenario.category;
  const workTypeLabel = WORK_TYPE_LABELS[liveScenario.workType] ?? liveScenario.workType;

  return (
    <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider shadow-xl space-y-6">
      <div className="flex items-center gap-3">
        <Layers className="w-5 h-5 text-primary" />
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Clasificación derivada</h3>
          <p className="text-[9px] text-faint mt-0.5">
            Calculada en vivo desde el escenario del paso Caso. Solo lectura — no se persiste en BD.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-faint">Atributos del motor</span>
        <SimulatorParamHelpButton focusKey="sim-classify" label="Clasificación derivada" />
      </div>

      <div className="flex flex-wrap gap-3">
        <SimulatorBadge label="tipo trabajo" value={workTypeLabel} />
        <SimulatorBadge label="liga" value={liveScenario.caseLeague} />
        <SimulatorBadge label="categoría" value={categoryLabel} />
        <SimulatorBadge label="complejidad" value={liveScenario.caseComplexity} />
      </div>

      <div className="p-4 rounded-2xl bg-surface border border-divider text-[11px] text-faint leading-relaxed">
        Estos valores alimentan los filtros duros (liga, skill, disponibilidad por categoría) y el cálculo de
        experiencia (E) en el ranking. Cambia piezas, restauración o notas en el paso Caso para ver cómo se
        actualizan.
      </div>
    </div>
  );
}
