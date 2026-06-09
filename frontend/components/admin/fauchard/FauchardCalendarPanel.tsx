'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Clock, Plus, Trash2, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Slider from '@/components/ui/Slider';
import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';
import {
  createHolidayAction,
  deleteHolidayAction,
  listHolidaysAction,
  type FauchardHolidayRow,
} from '@/lib/db/actions/fauchardHolidays';
import FauchardHelpButton from './FauchardHelpButton';
import FauchardHelpWindow from './FauchardHelpWindow';
import { CALENDAR_HELP, fauchardParamTooltip, fauchardParamNumber } from '@/lib/constants/fauchardHelp';

interface FauchardCalendarPanelProps {
  initialConfig: any;
}

/**
 * Espacio independiente "Calendario laboral". Panel autónomo: horario/días con su
 * propio Guardar (subconjunto `business*` de `fauchard_config`, disjunto del borrador
 * del modelo) + CRUD de feriados (tabla `fauchard_holiday`).
 */
export default function FauchardCalendarPanel({ initialConfig }: FauchardCalendarPanelProps) {
  const [params, setParams] = useState({
    businessHoursStart: Number(initialConfig.businessHoursStart ?? 8),
    businessHoursEnd: Number(initialConfig.businessHoursEnd ?? 20),
    businessDaysMask: Number(initialConfig.businessDaysMask ?? 31),
  });
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [calendarMsg, setCalendarMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [helpFocus, setHelpFocus] = useState<string | null>(null);
  const openHelp = (key?: string) => { setHelpFocus(key ?? null); setShowHelp(true); };

  const [holidays, setHolidays] = useState<FauchardHolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [submittingHoliday, setSubmittingHoliday] = useState(false);
  const [holidayMsg, setHolidayMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    const res = await listHolidaysAction();
    if (res.success) setHolidays(res.holidays);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const hoursValid = params.businessHoursStart < params.businessHoursEnd;

  const handleSaveCalendar = async () => {
    if (!hoursValid) return;
    setSavingCalendar(true);
    setCalendarMsg(null);
    const res = await updateFauchardParamsAction(params);
    setSavingCalendar(false);
    if (res.success) setCalendarMsg({ type: 'success', text: 'Calendario laboral actualizado' });
    else setCalendarMsg({ type: 'error', text: res.error });
  };

  const handleAdd = async () => {
    setSubmittingHoliday(true);
    setHolidayMsg(null);
    const res = await createHolidayAction(date, label);
    setSubmittingHoliday(false);
    if (res.success) {
      setDate(''); setLabel('');
      setHolidayMsg({ type: 'success', text: 'Feriado agregado' });
      await refresh();
    } else {
      setHolidayMsg({ type: 'error', text: res.error });
    }
  };

  const handleDelete = async (id: string) => {
    setSubmittingHoliday(true);
    setHolidayMsg(null);
    const res = await deleteHolidayAction(id);
    setSubmittingHoliday(false);
    if (res.success) {
      setHolidayMsg({ type: 'success', text: 'Feriado eliminado' });
      await refresh();
    } else {
      setHolidayMsg({ type: 'error', text: res.error });
    }
  };

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(`${iso}T00:00:00`);
      return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return iso; }
  };

  const toggleDayBit = (idx: number) => {
    const bit = 1 << idx;
    const next = (params.businessDaysMask & bit) ? (params.businessDaysMask & ~bit) : (params.businessDaysMask | bit);
    if (next < 1) return;
    setParams((p) => ({ ...p, businessDaysMask: next }));
  };

  const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <div className="flex flex-col gap-12 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Calendario laboral</h3>
          <p className="text-xs text-faint">Jornada, días hábiles y feriados para el cálculo de plazos.</p>
        </div>
        <FauchardHelpButton onClick={() => openHelp()} label="Calendario laboral" />
      </div>

      <FauchardHelpWindow isOpen={showHelp} onClose={() => setShowHelp(false)} section={CALENDAR_HELP} focusKey={helpFocus} />

      <Section title="Horario y días laborables" icon={<Clock className="w-4 h-4" />}>
        <Slider
          label="Hora apertura"
          value={params.businessHoursStart}
          min={0} max={22} step={1}
          onChange={(e) => setParams((p) => ({ ...p, businessHoursStart: parseInt(e.target.value) }))}
          valueFormatter={(v) => `${String(v).padStart(2, '0')}:00`}
          tooltip={fauchardParamTooltip('businessHoursStart')}
          onHelp={() => openHelp('businessHoursStart')}
          paramNumber={fauchardParamNumber('businessHoursStart')}
        />
        <Slider
          label="Hora cierre"
          value={params.businessHoursEnd}
          min={1} max={23} step={1}
          onChange={(e) => setParams((p) => ({ ...p, businessHoursEnd: parseInt(e.target.value) }))}
          valueFormatter={(v) => `${String(v).padStart(2, '0')}:00`}
          tooltip={fauchardParamTooltip('businessHoursEnd')}
          onHelp={() => openHelp('businessHoursEnd')}
          paramNumber={fauchardParamNumber('businessHoursEnd')}
        />
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 items-center justify-center rounded-md bg-primary-hl px-1.5 text-[10px] font-black text-primary shrink-0" title={`Parámetro N°${fauchardParamNumber('businessDaysMask')}`}>
              N°{fauchardParamNumber('businessDaysMask')}
            </span>
            <label className="text-[11px] font-bold text-muted uppercase tracking-wider">Días laborables</label>
          </div>
          <div className="flex flex-wrap gap-2">
            {dayLabels.map((lbl, i) => {
              const on = !!(params.businessDaysMask & (1 << i));
              return (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => toggleDayBit(i)}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase transition-colors ${on ? 'bg-primary text-inverse border-primary' : 'bg-surface-2 text-muted border-divider hover:border-primary/30'}`}
                >{lbl}</button>
              );
            })}
          </div>
          <p className="text-[10px] text-faint">Default L-V. Marca Sáb/Dom solo si aplica a tu operación.</p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveCalendar} loading={savingCalendar} disabled={!hoursValid} icon={<Save className="w-4 h-4" />}>
            Guardar horario
          </Button>
        </div>

        {calendarMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-xl text-xs ${calendarMsg.type === 'success' ? 'bg-primary-hl border border-primary/20 text-primary' : 'bg-error-hl border border-error/30 text-error'}`}>
            {calendarMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{calendarMsg.text}</span>
          </div>
        )}
      </Section>

      <Section title="Feriados" icon={<CalendarDays className="w-4 h-4" />}>
        <p className="text-xs text-muted">
          <span className="inline-flex h-5 items-center justify-center rounded-md bg-primary-hl px-1.5 text-[10px] font-black text-primary align-middle mr-2" title={`Parámetro N°${fauchardParamNumber('holidays')}`}>
            N°{fauchardParamNumber('holidays')}
          </span>
          El cálculo de plazos de trabajo salta estas fechas igual que un día no laborable.
        </p>

        <div className="rounded-2xl border border-divider bg-surface/30 p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Agregar feriado</p>
          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted block">Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-surface-2 border border-divider rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/30" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted block">Nombre</label>
              <input type="text" maxLength={120} placeholder="Ej: Independencia de Chile" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full bg-surface-2 border border-divider rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-primary/30" />
            </div>
            <Button onClick={handleAdd} loading={submittingHoliday} disabled={!date || !label.trim()} icon={<Plus className="w-4 h-4" />}>
              Agregar
            </Button>
          </div>
          {holidayMsg && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs ${holidayMsg.type === 'success' ? 'bg-primary-hl border border-primary/20 text-primary' : 'bg-error-hl border border-error/30 text-error'}`}>
              {holidayMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{holidayMsg.text}</span>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-divider overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-muted text-center">Cargando…</p>
          ) : holidays.length === 0 ? (
            <p className="p-6 text-sm text-muted text-center">No hay feriados configurados.</p>
          ) : (
            <ul className="divide-y divide-divider">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground font-bold">{h.label}</p>
                    <p className="text-xs text-muted capitalize">{fmtDate(h.holidayDate)}</p>
                  </div>
                  <button type="button" onClick={() => handleDelete(h.id)} disabled={submittingHoliday} className="p-2 rounded-lg text-error hover:bg-error-hl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-error/40 disabled:opacity-50" aria-label={`Eliminar feriado ${h.label}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-xl bg-surface-2 flex items-center justify-center text-muted border border-divider">{icon}</div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h3>
      </div>
      <div className="space-y-6 pl-1">{children}</div>
    </div>
  );
}
