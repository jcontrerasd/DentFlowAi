'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, Clock } from 'lucide-react';
import {
  formatDesiredDeliveryDateLabel,
  formatDesiredDeliverySummary,
  isDesiredDeliveryValid,
  joinLocalDatetime,
  minTimeForDate,
  splitLocalDatetime,
  todayDateString,
} from '@/lib/desiredDelivery';
import { DesiredDeliveryCalendar } from './DesiredDeliveryCalendar';

export type DesiredDeliveryPickerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Minutos mínimos en el futuro (default 30). */
  minLeadMinutes?: number;
  /** Variante compacta para ficha de caso. */
  compact?: boolean;
};

const fieldClass =
  'w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-3 text-foreground text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all';

const fieldClassCompact =
  'w-full bg-surface border border-primary/30 rounded px-3 py-2 text-foreground text-xs outline-none focus:border-primary/50';

function bumpTimeIfNeeded(
  date: string,
  hour: string,
  minute: string,
  minLeadMinutes: number,
): { hour: string; minute: string } {
  const joined = joinLocalDatetime(date, hour, minute);
  if (isDesiredDeliveryValid(joined, minLeadMinutes)) return { hour, minute };
  const min = minTimeForDate(date, minLeadMinutes);
  if (!min) return { hour, minute };
  const [h, m] = min.split(':');
  return { hour: h, minute: m };
}

export function DesiredDeliveryPicker({
  value,
  onChange,
  minLeadMinutes = 30,
  compact = false,
}: DesiredDeliveryPickerProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { date, hour, minute } = splitLocalDatetime(value);
  const minDate = todayDateString();
  const summary = formatDesiredDeliverySummary(value);
  const valid = isDesiredDeliveryValid(value, minLeadMinutes);
  const timeValue = `${hour}:${minute}`;
  const minTime = minTimeForDate(date, minLeadMinutes);
  const dateLabel = formatDesiredDeliveryDateLabel(value);

  useEffect(() => {
    if (!calendarOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [calendarOpen]);

  const update = (nextDate: string, nextHour: string, nextMinute: string) => {
    const bumped = bumpTimeIfNeeded(nextDate, nextHour, nextMinute, minLeadMinutes);
    onChange(joinLocalDatetime(nextDate, bumped.hour, bumped.minute));
  };

  const fc = compact ? fieldClassCompact : fieldClass;
  const triggerClass = `${fc} flex items-center justify-between gap-2 text-left cursor-pointer hover:border-primary/40`;

  return (
    <div className="space-y-3">
      <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
        <div className="relative space-y-1.5" ref={containerRef}>
          <label className="text-xs font-bold uppercase tracking-wider text-muted px-1 flex items-center gap-1">
            <Calendar size={11} /> Fecha
          </label>
          <button
            type="button"
            className={triggerClass}
            aria-expanded={calendarOpen}
            aria-haspopup="dialog"
            onClick={() => setCalendarOpen((open) => !open)}
          >
            <span className="truncate">{dateLabel}</span>
            <ChevronDown
              size={compact ? 14 : 16}
              className={`shrink-0 text-muted transition-transform ${calendarOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <div
            className={`absolute z-50 top-full left-0 mt-1.5 w-full min-w-[17rem] sm:min-w-[18rem] ${
              calendarOpen ? '' : 'hidden'
            }`}
            role="dialog"
            aria-hidden={!calendarOpen}
          >
            <DesiredDeliveryCalendar
              compact={compact}
              selectedDate={date}
              minDate={minDate}
              onSelect={(newDate) => {
                update(newDate, hour, minute);
                setCalendarOpen(false);
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted px-1 flex items-center gap-1">
            <Clock size={11} /> Hora (hh:mm)
          </label>
          <input
            type="time"
            className={fc}
            value={timeValue}
            min={minTime}
            onChange={(e) => {
              const t = e.target.value;
              if (!t) return;
              const [h, m] = t.split(':');
              update(date, h, m);
            }}
          />
          <p className="text-xs text-muted px-1">
            Elige la hora límite de entrega del diseño.
          </p>
        </div>
      </div>

      {summary && (
        <div
          className={`rounded-xl border px-4 py-3 ${
            valid
              ? 'border-primary/25 bg-primary/5'
              : 'border-warning/30 bg-warning-hl'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">
            Entrega solicitada
          </p>
          <p className={`text-sm font-semibold leading-snug ${valid ? 'text-foreground' : 'text-warning'}`}>
            {summary}
          </p>
          {!valid && (
            <p className="text-[11px] text-warning mt-1">
              La fecha y hora deben ser al menos {minLeadMinutes} minutos en el futuro.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
