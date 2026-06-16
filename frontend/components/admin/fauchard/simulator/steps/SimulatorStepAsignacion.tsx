import { Trophy } from 'lucide-react';
import { PARAM_GROUPS_BY_STEP } from '../simulatorConstants';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import SimulatorActiveConfigRows from '../shared/SimulatorActiveConfigRows';

export default function SimulatorStepAsignacion({
  currentConfig,
  result,
}: {
  currentConfig: Record<string, unknown>;
  result: SimulationResult | null;
}) {
  return (
    <div className="space-y-8">
      <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider shadow-xl">
        <SimulatorActiveConfigRows
          groups={PARAM_GROUPS_BY_STEP.asignacion}
          currentConfig={currentConfig}
          title="Parámetros de asignación"
          subtitle="Intentos máximos y plazo de respuesta de la config activa."
        />
      </div>

      {!result && (
        <div className="p-10 rounded-[2.5rem] border-2 border-dashed border-divider text-center space-y-3">
          <Trophy className="w-8 h-8 text-faint mx-auto" />
          <h4 className="text-sm font-bold text-foreground">Cadena de asignación</h4>
          <p className="text-faint text-xs max-w-sm mx-auto">
            Ejecuta la simulación para ver el técnico asignado y la cadena de respaldo. Podrás simular rechazos del
            asignado para probar el siguiente en la cadena.
          </p>
        </div>
      )}
    </div>
  );
}
