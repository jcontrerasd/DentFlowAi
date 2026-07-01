'use client';

import Slider from '@/components/ui/Slider';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import FauchardHelpWindow from './FauchardHelpWindow';
import FauchardHelpButton from './FauchardHelpButton';
import { WEIGHTS_HELP, fauchardParamTooltip, fauchardParamNumber } from '@/lib/constants/fauchardHelp';
import { useFauchardDraft } from './FauchardDraftContext';
import { renormalizeActiveAlphas, ACTIVE_ALPHA_KEYS } from '@/lib/fauchard/alphaWeightNormalize';
import type { DraftKey } from './FauchardDraftContext';
import { useFlashedParams } from '@/lib/hooks/useParamFlash';
import { useState, useEffect } from 'react';

/**
 * Editor de los 6 pesos del score (α). Lee/escribe el borrador compartido
 * (`FauchardDraftContext`); el guardado es global (no tiene botón propio).
 */
export default function FauchardWeightsPanel({ initialFocusKey = null }: { initialFocusKey?: string | null }) {
  const { draft, setParam } = useFauchardDraft();
  const flashed = useFlashedParams();
  const [showHelp, setShowHelp] = useState(false);
  const [helpFocus, setHelpFocus] = useState<string | null>(null);
  const openHelp = (key?: string) => { setHelpFocus(key ?? null); setShowHelp(true); };

  useEffect(() => { if (initialFocusKey) openHelp(initialFocusKey); }, [initialFocusKey]);

  const sum = ACTIVE_ALPHA_KEYS.reduce((acc, k) => acc + draft[k as DraftKey], 0);
  const isSumValid = Math.abs(sum - 1.0) < 0.001;

  const balanceWeights = () => {
    const normalized = renormalizeActiveAlphas(draft);
    for (const key of ACTIVE_ALPHA_KEYS) {
      setParam(key as DraftKey, normalized[key]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-foreground">Pesos del Score</h3>
          <p className="text-xs text-muted hidden md:block">Importancia relativa de cada factor. Deben sumar 1.000.</p>
        </div>
        <FauchardHelpButton onClick={() => openHelp()} label="Pesos del Score" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-3">
        <Slider label="Calidad Histórica (Q)" value={draft.alphaQuality} onChange={(e) => setParam('alphaQuality', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaQuality')} onHelp={() => openHelp('alphaQuality')} paramNumber={fauchardParamNumber('alphaQuality')} flash={flashed.has('alphaQuality')} />
        <Slider label="Puntualidad (P)" value={draft.alphaPunctuality} onChange={(e) => setParam('alphaPunctuality', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaPunctuality')} onHelp={() => openHelp('alphaPunctuality')} paramNumber={fauchardParamNumber('alphaPunctuality')} flash={flashed.has('alphaPunctuality')} />
        <Slider label="Experiencia Especializada (E)" value={draft.alphaExperience} onChange={(e) => setParam('alphaExperience', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaExperience')} onHelp={() => openHelp('alphaExperience')} paramNumber={fauchardParamNumber('alphaExperience')} flash={flashed.has('alphaExperience')} />
        <Slider label="Bono de Infrautilización (B)" value={draft.alphaBonus} onChange={(e) => setParam('alphaBonus', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaBonus')} onHelp={() => openHelp('alphaBonus')} paramNumber={fauchardParamNumber('alphaBonus')} flash={flashed.has('alphaBonus')} />
        <Slider label="Carga activa (L)" value={draft.alphaLoad} onChange={(e) => setParam('alphaLoad', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaLoad')} onHelp={() => openHelp('alphaLoad')} paramNumber={fauchardParamNumber('alphaLoad')} flash={flashed.has('alphaLoad')} />
        <Slider label="Penalización por No-respuesta (N)" value={draft.alphaNoResponse} onChange={(e) => setParam('alphaNoResponse', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaNoResponse')} onHelp={() => openHelp('alphaNoResponse')} paramNumber={fauchardParamNumber('alphaNoResponse')} flash={flashed.has('alphaNoResponse')} />
      </div>

      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border text-xs ${isSumValid ? 'bg-primary-hl border-primary/20 text-primary' : 'bg-warning-hl border-warning/30 text-warning'}`}>
        {isSumValid ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
        <span className="font-bold">Σ α: {sum.toFixed(3)} / 1.000</span>
        <span className="text-xs opacity-80 hidden sm:inline">{isSumValid ? 'Válido.' : 'Debe ser exactamente 1.000 para guardar.'}</span>
        {!isSumValid && (
          <button
            type="button"
            onClick={balanceWeights}
            className="ml-auto text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-warning/40 hover:bg-warning/10 transition-colors"
          >
            Equilibrar a 1.000
          </button>
        )}
      </div>

      <FauchardHelpWindow isOpen={showHelp} onClose={() => setShowHelp(false)} section={WEIGHTS_HELP} focusKey={helpFocus} />
    </div>
  );
}
