import { DollarSign, FlaskConical } from 'lucide-react';
import type { CatalogOption } from '@/lib/db/actions/catalogs';
import type { CaseComplexity } from '@/lib/constants/dental';
import { COMPACT_SELECT_CLASS, COMPLEXITY_OPTIONS } from '../simulatorConstants';
import type { SimulatorFormParams, SimulatorLivePrice } from '../simulatorTypes';
import SimulatorField from '../shared/SimulatorField';
import { SimulatorLivePriceBlock } from '../shared/SimulatorPricePreview';

const TOGGLE_BTN =
  'flex-1 text-[9px] font-bold uppercase py-1.5 rounded-lg border transition-colors';
const TOGGLE_ACTIVE = 'bg-primary/10 border-primary/30 text-primary';
const TOGGLE_IDLE = 'bg-surface border-divider text-muted';

export default function SimulatorStepCaso({
  params,
  onParamsChange,
  catalogOptions,
  livePrice,
}: {
  params: SimulatorFormParams;
  onParamsChange: (updater: (p: SimulatorFormParams) => SimulatorFormParams) => void;
  catalogOptions: {
    restorations: CatalogOption[];
    materials: CatalogOption[];
    shades: CatalogOption[];
    urgencies: CatalogOption[];
  };
  livePrice: SimulatorLivePrice;
}) {
  const { restorations, materials, shades, urgencies } = catalogOptions;

  return (
    <div className="rounded-2xl bg-surface/40 border border-divider shadow-lg p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        {/* Precio */}
        <section className="space-y-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary shrink-0" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">Datos de precio</h3>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SimulatorField label="Restauración" helpFocusKey="sim-restoration" compact>
              <select
                className={COMPACT_SELECT_CLASS}
                value={params.restorationCode}
                onChange={(e) => onParamsChange((p) => ({ ...p, restorationCode: e.target.value }))}
              >
                {restorations.map((opt) => (
                  <option key={opt.id} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </SimulatorField>
            <SimulatorField label="Material" helpFocusKey="sim-material" compact>
              <select
                className={COMPACT_SELECT_CLASS}
                value={params.materialCode}
                onChange={(e) => onParamsChange((p) => ({ ...p, materialCode: e.target.value }))}
              >
                {materials.map((opt) => (
                  <option key={opt.id} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </SimulatorField>
            <SimulatorField label="Shade VITA" helpFocusKey="sim-shade" compact>
              <select
                className={COMPACT_SELECT_CLASS}
                value={params.shadeCode}
                onChange={(e) => onParamsChange((p) => ({ ...p, shadeCode: e.target.value }))}
              >
                {shades.map((opt) => (
                  <option key={opt.id} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </SimulatorField>
            <SimulatorField label="Urgencia" helpFocusKey="sim-urgency" compact>
              <select
                className={COMPACT_SELECT_CLASS}
                value={params.urgencyLabel}
                onChange={(e) => onParamsChange((p) => ({ ...p, urgencyLabel: e.target.value }))}
              >
                {urgencies.map((opt) => (
                  <option key={opt.id} value={opt.label}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </SimulatorField>
          </div>

          <SimulatorLivePriceBlock livePrice={livePrice} compact />
        </section>

        {/* Asignación */}
        <section className="space-y-2.5 min-w-0 md:border-l md:border-divider md:pl-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary shrink-0" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">Escenario de asignación</h3>
          </div>

          <div className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-2.5 items-end">
            <SimulatorField label="Piezas" helpFocusKey="sim-teeth" compact>
              <input
                type="number"
                min={1}
                max={32}
                className={COMPACT_SELECT_CLASS}
                value={params.teethCount}
                onChange={(e) =>
                  onParamsChange((p) => ({ ...p, teethCount: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                }
              />
            </SimulatorField>

            <SimulatorField label="Pónticos" helpFocusKey="sim-pontic" compact>
              <div className="flex gap-1.5">
                {([
                  { value: true, label: 'Sí' },
                  { value: false, label: 'No' },
                ] as const).map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => onParamsChange((p) => ({ ...p, replacesMissingTeeth: opt.value }))}
                    className={`${TOGGLE_BTN} ${
                      params.replacesMissingTeeth === opt.value ? TOGGLE_ACTIVE : TOGGLE_IDLE
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </SimulatorField>
          </div>

          <SimulatorField label="Complejidad" helpFocusKey="sim-complexity" compact>
            <div className="flex gap-2 items-center">
              <div className="flex gap-1.5 shrink-0">
                {(['auto', 'manual'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onParamsChange((p) => ({ ...p, complexityMode: mode }))}
                    className={`${TOGGLE_BTN} min-w-[4.5rem] ${
                      params.complexityMode === mode ? TOGGLE_ACTIVE : TOGGLE_IDLE
                    }`}
                  >
                    {mode === 'auto' ? 'Auto' : 'Manual'}
                  </button>
                ))}
              </div>
              {params.complexityMode === 'manual' && (
                <select
                  className={`${COMPACT_SELECT_CLASS} flex-1 min-w-0`}
                  value={params.caseComplexity}
                  onChange={(e) =>
                    onParamsChange((p) => ({ ...p, caseComplexity: e.target.value as CaseComplexity }))
                  }
                >
                  {COMPLEXITY_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </SimulatorField>
        </section>
      </div>
    </div>
  );
}
