'use client';

import { useState, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import FauchardHelpButton from './FauchardHelpButton';
import FauchardHelpWindow from './FauchardHelpWindow';
import { PLAZOS_HELP, fauchardParamTooltip, fauchardParamNumber } from '@/lib/constants/fauchardHelp';
import { useFauchardDraft, type DraftKey } from './FauchardDraftContext';

/**
 * Editor "Disponibilidad y Sanciones" (v5.0). Lee/escribe el borrador compartido
 * (`FauchardDraftContext`); el guardado y la validación cruzada son globales.
 */

function NumberField({
  label, value, onChange, min, max, suffix, tooltip, onHelp, paramNumber,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; suffix?: string; tooltip?: string; onHelp?: () => void; paramNumber?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {paramNumber != null && (
          <span className="inline-flex h-5 items-center justify-center rounded-md bg-primary-hl px-1.5 text-[10px] font-black text-primary tracking-normal normal-case shrink-0" title={`Parámetro N°${paramNumber}`}>
            N°{paramNumber}
          </span>
        )}
        <label className="text-[11px] font-bold uppercase tracking-wider text-faint">{label}</label>
        {onHelp ? (
          <button
            type="button"
            onClick={onHelp}
            title={tooltip}
            aria-label={`Abrir ayuda de ${label}`}
            className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-white/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        ) : tooltip ? (
          <span className="relative group/tt inline-flex items-center">
            <HelpCircle className="w-3 h-3 text-faint cursor-help" />
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/tt:block w-56 p-2.5 bg-surface-2 text-foreground text-[11px] font-normal normal-case tracking-normal rounded-md shadow-md border border-divider z-[100] text-left space-y-1.5">
              <span className="block leading-relaxed">{tooltip}</span>
              <span className="absolute top-full left-0 right-0 h-2" aria-hidden="true"></span>
            </span>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full rounded-xl bg-surface-2 border border-divider px-3 py-2 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        {suffix && <span className="text-[10px] font-bold uppercase text-faint shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-black uppercase tracking-wider text-primary">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function PlazosYSancionesPanel({ initialFocusKey = null }: { initialFocusKey?: string | null }) {
  const { draft, setParam } = useFauchardDraft();
  const [showHelp, setShowHelp] = useState(false);
  const [helpFocus, setHelpFocus] = useState<string | null>(null);
  const openHelp = (key?: string) => { setHelpFocus(key ?? null); setShowHelp(true); };

  // Deep-link desde Observabilidad: abre la ayuda enfocada en el parámetro.
  useEffect(() => { if (initialFocusKey) openHelp(initialFocusKey); }, [initialFocusKey]);

  const set = (k: DraftKey, val: number) => setParam(k, val);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-foreground">Disponibilidad y Sanciones</h3>
          <p className="text-[10px] text-faint hidden md:block">Revisión, pool, reemplazo e inactividad.</p>
        </div>
        <FauchardHelpButton onClick={() => openHelp()} label="Disponibilidad y Sanciones" />
      </div>

      <FauchardHelpWindow isOpen={showHelp} onClose={() => setShowHelp(false)} section={PLAZOS_HELP} focusKey={helpFocus} />

      <div className="columns-1 md:columns-2 xl:columns-3 gap-4 [&>*]:break-inside-avoid [&>*]:mb-4">
      <Block title="1 · Revisión del dentista">
        <NumberField label="Revisión del dentista" value={draft.tDentistReviewHours} onChange={(x) => set('tDentistReviewHours', x)} min={1} max={336} suffix="h" tooltip={fauchardParamTooltip('tDentistReviewHours')} onHelp={() => openHelp('tDentistReviewHours')} paramNumber={fauchardParamNumber('tDentistReviewHours')} />
      </Block>

      <Block title="2 · Espera de técnicos disponibles">
        <NumberField label="Tiempo de espera (TTL)" value={draft.tNoEligiblePoolHours} onChange={(x) => set('tNoEligiblePoolHours', x)} min={1} max={168} suffix="h" tooltip={fauchardParamTooltip('tNoEligiblePoolHours')} onHelp={() => openHelp('tNoEligiblePoolHours')} paramNumber={fauchardParamNumber('tNoEligiblePoolHours')} />
        <NumberField label="Ciclos de espera" value={draft.maxPoolCycles} onChange={(x) => set('maxPoolCycles', x)} min={1} max={10} suffix="ciclos" tooltip={fauchardParamTooltip('maxPoolCycles')} onHelp={() => openHelp('maxPoolCycles')} paramNumber={fauchardParamNumber('maxPoolCycles')} />
      </Block>

      <Block title="3 · Reemplazo automático">
        <NumberField label="Margen de reemplazo" value={draft.replacementCutoffMinutes} onChange={(x) => set('replacementCutoffMinutes', x)} min={0} max={120} suffix="min" tooltip={fauchardParamTooltip('replacementCutoffMinutes')} onHelp={() => openHelp('replacementCutoffMinutes')} paramNumber={fauchardParamNumber('replacementCutoffMinutes')} />
      </Block>

      <Block title="4 · Inactividad (recordatorio y auto-OFF)">
        <NumberField label="Recordatorio de actividad" value={draft.inactivityReminderDays} onChange={(x) => set('inactivityReminderDays', x)} min={1} max={365} suffix="días" tooltip={fauchardParamTooltip('inactivityReminderDays')} onHelp={() => openHelp('inactivityReminderDays')} paramNumber={fauchardParamNumber('inactivityReminderDays')} />
        <NumberField label="Auto-OFF preventivo" value={draft.inactivityAutoOffDays} onChange={(x) => set('inactivityAutoOffDays', x)} min={1} max={365} suffix="días" tooltip={fauchardParamTooltip('inactivityAutoOffDays')} onHelp={() => openHelp('inactivityAutoOffDays')} paramNumber={fauchardParamNumber('inactivityAutoOffDays')} />
      </Block>

      <Block title="5 · Sanción por no responder">
        <NumberField label="Ventana rolling" value={draft.noResponseWindowDays} onChange={(x) => set('noResponseWindowDays', x)} min={1} max={90} suffix="días" tooltip={fauchardParamTooltip('noResponseWindowDays')} onHelp={() => openHelp('noResponseWindowDays')} paramNumber={fauchardParamNumber('noResponseWindowDays')} />
        <NumberField label="Rehabilitación" value={draft.noResponseRehabilitationDays} onChange={(x) => set('noResponseRehabilitationDays', x)} min={1} max={180} suffix="días" tooltip={fauchardParamTooltip('noResponseRehabilitationDays')} onHelp={() => openHelp('noResponseRehabilitationDays')} paramNumber={fauchardParamNumber('noResponseRehabilitationDays')} />
        <NumberField label="Umbral Nivel 1" value={draft.level1Threshold} onChange={(x) => set('level1Threshold', x)} min={1} max={50} tooltip={fauchardParamTooltip('level1Threshold')} onHelp={() => openHelp('level1Threshold')} paramNumber={fauchardParamNumber('level1Threshold')} />
        <NumberField label="Umbral Nivel 2" value={draft.level2Threshold} onChange={(x) => set('level2Threshold', x)} min={1} max={50} tooltip={fauchardParamTooltip('level2Threshold')} onHelp={() => openHelp('level2Threshold')} paramNumber={fauchardParamNumber('level2Threshold')} />
        <NumberField label="Umbral Nivel 3" value={draft.level3Threshold} onChange={(x) => set('level3Threshold', x)} min={1} max={50} tooltip={fauchardParamTooltip('level3Threshold')} onHelp={() => openHelp('level3Threshold')} paramNumber={fauchardParamNumber('level3Threshold')} />
      </Block>
      </div>

      <div className="rounded-xl border border-divider/70 bg-surface-2/30 p-3 text-[10px] text-muted leading-snug">
        Los <strong>pesos del score</strong> (incluida la Penalización por No-respuesta, αN) se
        configuran en la pestaña <strong>Pesos del Score</strong>, única fuente de verdad (los 6
        pesos suman 1.000).
      </div>
    </div>
  );
}
