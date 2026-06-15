'use client';

import { useState, useEffect } from 'react';
import Slider from '@/components/ui/Slider';
import { Clock, Users, ShieldAlert, BadgePercent } from 'lucide-react';
import FauchardHelpButton from './FauchardHelpButton';
import FauchardHelpWindow from './FauchardHelpWindow';
import { FILTERS_HELP, fauchardParamTooltip, fauchardParamNumber } from '@/lib/constants/fauchardHelp';
import { useFauchardDraft } from './FauchardDraftContext';
import { useFlashedParams } from '@/lib/hooks/useParamFlash';

/**
 * Editor de "Selección y Ronda". Lee/escribe el borrador compartido
 * (`FauchardDraftContext`); el guardado es global (sin botón propio).
 */
export default function FauchardFiltersPanel({ initialFocusKey = null }: { initialFocusKey?: string | null }) {
  const { draft, setParam } = useFauchardDraft();
  const flashed = useFlashedParams();
  const [showHelp, setShowHelp] = useState(false);
  const [helpFocus, setHelpFocus] = useState<string | null>(null);
  const openHelp = (key?: string) => { setHelpFocus(key ?? null); setShowHelp(true); };

  // Deep-link desde Observabilidad: abre la ayuda enfocada en el parámetro.
  useEffect(() => { if (initialFocusKey) openHelp(initialFocusKey); }, [initialFocusKey]);

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Selección y Ronda</h3>
          <p className="text-xs text-faint">Cómo Fauchard mide, filtra y asigna técnicos, y los plazos de respuesta.</p>
        </div>
        <FauchardHelpButton onClick={() => openHelp()} label="Selección y Ronda" />
      </div>

      <FauchardHelpWindow isOpen={showHelp} onClose={() => setShowHelp(false)} section={FILTERS_HELP} focusKey={helpFocus} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">

        {/* Ventanas de medición */}
        <Section title="Ventanas de medición" icon={<Clock className="w-4 h-4" />}>
          <Slider
            label="Calidad Histórica (días)"
            value={draft.wQualityDays}
            min={30} max={365} step={1}
            onChange={(e) => setParam('wQualityDays', parseInt(e.target.value))}
            valueSuffix=" d"
            tooltip={fauchardParamTooltip('wQualityDays')}
            onHelp={() => openHelp('wQualityDays')}
            paramNumber={fauchardParamNumber('wQualityDays')}
            flash={flashed.has('wQualityDays')}
          />
          <Slider
            label="Carga Reciente (días)"
            value={draft.wLoadDays}
            min={7} max={90} step={1}
            onChange={(e) => setParam('wLoadDays', parseInt(e.target.value))}
            valueSuffix=" d"
            tooltip={fauchardParamTooltip('wLoadDays')}
            onHelp={() => openHelp('wLoadDays')}
            paramNumber={fauchardParamNumber('wLoadDays')}
            flash={flashed.has('wLoadDays')}
          />
          <Slider
            label="Techo Índice de Carga (C_max)"
            value={draft.cMax}
            min={1} max={5} step={0.1}
            onChange={(e) => setParam('cMax', parseFloat(e.target.value))}
            valueFormatter={(v) => `${v.toFixed(1)}×`}
            tooltip={fauchardParamTooltip('cMax')}
            onHelp={() => openHelp('cMax')}
            paramNumber={fauchardParamNumber('cMax')}
            flash={flashed.has('cMax')}
          />
          <Slider
            label="Bono Infrautilización (días máx)"
            value={draft.dBonusMaxDays}
            min={7} max={60} step={1}
            onChange={(e) => setParam('dBonusMaxDays', parseInt(e.target.value))}
            valueSuffix=" d"
            tooltip={fauchardParamTooltip('dBonusMaxDays')}
            onHelp={() => openHelp('dBonusMaxDays')}
            paramNumber={fauchardParamNumber('dBonusMaxDays')}
            flash={flashed.has('dBonusMaxDays')}
          />
        </Section>

        {/* Filtros de elegibilidad */}
        <Section title="Filtros de elegibilidad" icon={<ShieldAlert className="w-4 h-4" />}>
          <div className="rounded-2xl border border-warning/25 bg-warning-hl/20 p-5 space-y-8">
            <Slider
              label="Cooldown Invitaciones"
              value={draft.tCooldownMinutes}
              min={1} max={1440} step={1}
              onChange={(e) => setParam('tCooldownMinutes', parseInt(e.target.value))}
              valueFormatter={(v) => {
                if (v < 60) return `${v} min`;
                const h = Math.floor(v / 60);
                const m = v % 60;
                return m === 0 ? `${h} h` : `${h} h ${m} min`;
              }}
              tooltip={fauchardParamTooltip('tCooldownMinutes')}
              onHelp={() => openHelp('tCooldownMinutes')}
              paramNumber={fauchardParamNumber('tCooldownMinutes')}
              flash={flashed.has('tCooldownMinutes')}
            />
            <Slider
              label="Inactividad Máxima (días)"
              value={draft.dInactivityDays}
              min={3} max={30} step={1}
              onChange={(e) => setParam('dInactivityDays', parseInt(e.target.value))}
              valueSuffix=" d"
              tooltip={fauchardParamTooltip('dInactivityDays')}
              onHelp={() => openHelp('dInactivityDays')}
              paramNumber={fauchardParamNumber('dInactivityDays')}
              flash={flashed.has('dInactivityDays')}
            />
            <div className="flex items-start gap-2 pt-3 border-t border-warning/20">
              <ShieldAlert className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <p className="text-[10px] text-warning leading-relaxed font-medium">
                Estos dos se aplican <strong>antes del score</strong>: un técnico que no los cumpla queda excluido del pool para ese caso, por bueno que sea su puntaje.
              </p>
            </div>
          </div>
        </Section>

        {/* Asignación */}
        <Section title="Reglas de asignación" icon={<Users className="w-4 h-4" />}>
          <Slider
            label="Intentos máximos de asignación"
            value={draft.maxAssignmentAttempts}
            min={1} max={10} step={1}
            onChange={(e) => setParam('maxAssignmentAttempts', parseInt(e.target.value))}
            valueSuffix=" intentos"
            tooltip="Máximo de técnicos a intentar por caso (rechazo o expiración)."
            onHelp={() => openHelp('maxAssignmentAttempts')}
            paramNumber={fauchardParamNumber('maxAssignmentAttempts')}
            flash={flashed.has('maxAssignmentAttempts')}
          />
        </Section>

        {/* Plazos de respuesta */}
        <Section title="Plazos de asignación" icon={<BadgePercent className="w-4 h-4" />}>
          <Slider
            label="Tiempo para responder asignación"
            value={draft.tQuoteMinutes}
            min={1} max={1440} step={1}
            onChange={(e) => setParam('tQuoteMinutes', parseInt(e.target.value))}
            valueFormatter={(v) => {
              if (v < 60) return `${v} min`;
              const h = Math.floor(v / 60);
              const m = v % 60;
              return m === 0 ? `${h} h` : `${h} h ${m} min`;
            }}
            tooltip={fauchardParamTooltip('tQuoteMinutes')}
            onHelp={() => openHelp('tQuoteMinutes')}
            paramNumber={fauchardParamNumber('tQuoteMinutes')}
            flash={flashed.has('tQuoteMinutes')}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-xl bg-surface-2 flex items-center justify-center text-muted border border-divider">
          {icon}
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h3>
      </div>
      <div className="space-y-8 pl-1">
        {children}
      </div>
    </div>
  );
}
