'use client';

import Slider from '@/components/ui/Slider';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import FauchardHelpWindow from './FauchardHelpWindow';
import FauchardHelpButton from './FauchardHelpButton';
import { WEIGHTS_HELP, fauchardParamTooltip, fauchardParamNumber } from '@/lib/constants/fauchardHelp';
import { useFauchardDraft } from './FauchardDraftContext';
import { useFlashedParams } from '@/lib/hooks/useParamFlash';
import { useState, useEffect } from 'react';

/**
 * Editor de los 5 pesos del score (α). Lee/escribe el borrador compartido
 * (`FauchardDraftContext`); el guardado es global (no tiene botón propio).
 */
export default function FauchardWeightsPanel({ initialFocusKey = null }: { initialFocusKey?: string | null }) {
  const { draft, setParam } = useFauchardDraft();
  const flashed = useFlashedParams();
  const [showHelp, setShowHelp] = useState(false);
  const [helpFocus, setHelpFocus] = useState<string | null>(null);
  const openHelp = (key?: string) => { setHelpFocus(key ?? null); setShowHelp(true); };

  // Deep-link desde Observabilidad: abre la ayuda enfocada en el parámetro.
  useEffect(() => { if (initialFocusKey) openHelp(initialFocusKey); }, [initialFocusKey]);

  const sum =
    draft.alphaQuality + draft.alphaPunctuality + draft.alphaExperience +
    draft.alphaLoad + draft.alphaNoResponse;
  const isSumValid = Math.abs(sum - 1.0) < 0.001;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Pesos del Score</h3>
          <p className="text-xs text-faint">Importancia relativa de cada factor de selección. Deben sumar 1.000.</p>
        </div>
        <FauchardHelpButton onClick={() => openHelp()} label="Pesos del Score" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-x-10 gap-y-8">
        <div className="space-y-2">
          <Slider label="Calidad Histórica (Q)" value={draft.alphaQuality} onChange={(e) => setParam('alphaQuality', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaQuality')} onHelp={() => openHelp('alphaQuality')} paramNumber={fauchardParamNumber('alphaQuality')} flash={flashed.has('alphaQuality')} />
          <p className="text-[10px] text-faint italic px-1">Importancia de los ratings promedio de casos anteriores.</p>
        </div>
        <div className="space-y-2">
          <Slider label="Puntualidad (P)" value={draft.alphaPunctuality} onChange={(e) => setParam('alphaPunctuality', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaPunctuality')} onHelp={() => openHelp('alphaPunctuality')} paramNumber={fauchardParamNumber('alphaPunctuality')} flash={flashed.has('alphaPunctuality')} />
          <p className="text-[10px] text-faint italic px-1">Historial de entregas en el plazo prometido.</p>
        </div>
        <div className="space-y-2">
          <Slider label="Experiencia Especializada (E)" value={draft.alphaExperience} onChange={(e) => setParam('alphaExperience', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaExperience')} onHelp={() => openHelp('alphaExperience')} paramNumber={fauchardParamNumber('alphaExperience')} flash={flashed.has('alphaExperience')} />
          <p className="text-[10px] text-faint italic px-1">Nivel de habilidad declarado para el tipo de trabajo específico.</p>
        </div>
        <div className="space-y-2">
          <Slider label="Carga activa (L)" value={draft.alphaLoad} onChange={(e) => setParam('alphaLoad', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaLoad')} onHelp={() => openHelp('alphaLoad')} paramNumber={fauchardParamNumber('alphaLoad')} flash={flashed.has('alphaLoad')} />
          <p className="text-[10px] text-faint italic px-1">Penaliza técnicos con muchos casos activos en curso.</p>
        </div>
        <div className="space-y-2">
          <Slider label="Penalización por No-respuesta (N)" value={draft.alphaNoResponse} onChange={(e) => setParam('alphaNoResponse', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} valueSuffix=" (w)" tooltip={fauchardParamTooltip('alphaNoResponse')} onHelp={() => openHelp('alphaNoResponse')} paramNumber={fauchardParamNumber('alphaNoResponse')} flash={flashed.has('alphaNoResponse')} />
          <p className="text-[10px] text-faint italic px-1">Castiga asignaciones vencidas sin respuesta (ventana rolling 14d).</p>
        </div>
      </div>

      {/* Indicador de suma (la acción de guardar es global) */}
      <div className={`flex items-center gap-3 p-4 rounded-2xl border text-sm ${isSumValid ? 'bg-primary-hl border-primary/20 text-primary' : 'bg-warning-hl border-warning/30 text-warning'}`}>
        {isSumValid ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
        <span className="font-bold">Suma de pesos α: {sum.toFixed(3)} / 1.000</span>
        <span className="text-xs opacity-80">{isSumValid ? 'Válido.' : 'Debe ser exactamente 1.000 para poder guardar.'}</span>
      </div>

      <FauchardHelpWindow isOpen={showHelp} onClose={() => setShowHelp(false)} section={WEIGHTS_HELP} focusKey={helpFocus} />
    </div>
  );
}
