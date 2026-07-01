import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import Slider from '@/components/ui/Slider';
import { openSimulatorHelp, SimulatorParamHelpButton } from '../../SimulatorHelp';
import { PARAM_GROUPS_BY_STEP } from '../simulatorConstants';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import type { SimulatorConfigOverride } from '../simulatorTypes';
import SimulatorActiveConfigRows from '../shared/SimulatorActiveConfigRows';

type AlphaOverrideKey = keyof SimulatorConfigOverride;

function AlphaOverrideSlider({
  label,
  fieldKey,
  helpKey,
  value,
  onOverrideChange,
}: {
  label: string;
  fieldKey: AlphaOverrideKey;
  helpKey: AlphaOverrideKey;
  value: number;
  onOverrideChange: (key: AlphaOverrideKey, val: number) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 min-w-0">
        <Slider
          label={label}
          value={value}
          onChange={(e) => onOverrideChange(fieldKey, parseFloat(e.target.value))}
          min={0}
          max={0.5}
          step={0.001}
          valueFormatter={(v) => v.toFixed(3)}
          onHelp={() => openSimulatorHelp(helpKey)}
        />
      </div>
      <input
        type="number"
        aria-label={`${label} (valor exacto)`}
        min={0}
        max={0.5}
        step={0.001}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onOverrideChange(fieldKey, v);
        }}
        className="w-[4.5rem] shrink-0 mb-0.5 rounded-lg border border-divider bg-surface px-1.5 py-1 text-xs font-mono font-bold text-primary text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

export default function SimulatorStepRanking({
  currentConfig,
  result,
  useOverride,
  onUseOverrideChange,
  configOverride,
  onOverrideChange,
  onBalanceOverride,
  sumOverride,
  isSumValid,
}: {
  currentConfig: Record<string, unknown>;
  result: SimulationResult | null;
  useOverride: boolean;
  onUseOverrideChange: (v: boolean) => void;
  configOverride: SimulatorConfigOverride;
  onOverrideChange: (key: AlphaOverrideKey, val: number) => void;
  onBalanceOverride: () => void;
  sumOverride: number;
  isSumValid: boolean;
}) {
  return (
    <div className="space-y-8">
      <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider shadow-xl space-y-6">
        <SimulatorActiveConfigRows
          groups={PARAM_GROUPS_BY_STEP.ranking}
          currentConfig={currentConfig}
          title="Pesos y ventana activos"
          subtitle="α Q/P/E/B/L/N y ventana de calidad de la config guardada."
        />

        <div className="pt-4 border-t border-divider space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-1.5">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted">Override α (sandbox)</label>
                <p className="text-xs text-muted mt-0.5">Solo afecta esta corrida; no guarda en Configuración.</p>
              </div>
              <SimulatorParamHelpButton focusKey="sim-override" label="Override α (sandbox)" />
            </div>
            <button
              type="button"
              onClick={() => onUseOverrideChange(!useOverride)}
              className={`relative w-10 h-5 rounded-full transition-colors ${useOverride ? 'bg-primary' : 'bg-divider'}`}
            >
              <motion.div animate={{ x: useOverride ? 22 : 2 }} className="w-4 h-4 bg-white rounded-full shadow-sm mt-0.5" />
            </button>
          </div>

          {useOverride && (
            <div className="space-y-5 animate-in fade-in slide-in-from-top-2">
              <AlphaOverrideSlider label="Q: Calidad" fieldKey="alphaQuality" helpKey="alphaQuality" value={configOverride.alphaQuality} onOverrideChange={onOverrideChange} />
              <AlphaOverrideSlider label="P: Puntualidad" fieldKey="alphaPunctuality" helpKey="alphaPunctuality" value={configOverride.alphaPunctuality} onOverrideChange={onOverrideChange} />
              <AlphaOverrideSlider label="E: Experiencia" fieldKey="alphaExperience" helpKey="alphaExperience" value={configOverride.alphaExperience} onOverrideChange={onOverrideChange} />
              <AlphaOverrideSlider label="B: Bono" fieldKey="alphaBonus" helpKey="alphaBonus" value={configOverride.alphaBonus} onOverrideChange={onOverrideChange} />
              <AlphaOverrideSlider label="L: Carga" fieldKey="alphaLoad" helpKey="alphaLoad" value={configOverride.alphaLoad} onOverrideChange={onOverrideChange} />
              <AlphaOverrideSlider label="N: No-respuesta" fieldKey="alphaNoResponse" helpKey="alphaNoResponse" value={configOverride.alphaNoResponse} onOverrideChange={onOverrideChange} />
              <div
                className={`flex flex-wrap items-center gap-2 text-xs font-bold p-3 rounded-xl border ${
                  isSumValid ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-error-hl border-error/30 text-error'
                }`}
              >
                <span>Suma α: {sumOverride.toFixed(3)} {isSumValid ? '✓' : '(debe ser 1.000)'}</span>
                {!isSumValid && (
                  <button
                    type="button"
                    onClick={onBalanceOverride}
                    className="ml-auto text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-current/40 hover:bg-white/5 transition-colors"
                  >
                    Equilibrar a 1.000
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {!result && (
        <div className="p-10 rounded-[2.5rem] border-2 border-dashed border-divider text-center space-y-3">
          <BarChart3 className="w-8 h-8 text-muted opacity-50 mx-auto" />
          <h4 className="text-sm font-bold text-foreground">Ranking Q/P/E/B/L/N</h4>
          <p className="text-muted opacity-50 text-xs max-w-sm mx-auto">
            Ejecuta la simulación para ver el score desglosado de cada técnico y quién encabeza el ranking.
          </p>
        </div>
      )}
    </div>
  );
}
