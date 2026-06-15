'use client';

import { useEffect, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export type DesiredDeliveryCalendarProps = {
  selectedDate: string;
  minDate: string;
  compact?: boolean;
  onSelect: (date: string) => void;
};

export function DesiredDeliveryCalendar({
  selectedDate,
  minDate,
  compact = false,
  onSelect,
}: DesiredDeliveryCalendarProps) {
  const selected = parseISO(selectedDate);
  const minDay = startOfDay(parseISO(minDate));
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected));

  useEffect(() => {
    setViewMonth(startOfMonth(parseISO(selectedDate)));
  }, [selectedDate]);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const canGoPrev = !isBefore(startOfMonth(subMonths(viewMonth, 1)), startOfMonth(minDay));
  const cell = compact ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-sm';

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-divider bg-surface dark:bg-surface shadow-lg ${
        compact ? 'p-2.5' : 'p-4'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={() => canGoPrev && setViewMonth(subMonths(viewMonth, 1))}
          className="p-1 rounded-lg text-faint hover:text-foreground hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={compact ? 16 : 18} />
        </button>
        <p className={`font-semibold text-foreground capitalize ${compact ? 'text-xs' : 'text-sm'}`}>
          {format(viewMonth, 'MMMM yyyy', { locale: es })}
        </p>
        <button
          type="button"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          className="p-1 rounded-lg text-faint hover:text-foreground hover:bg-surface-2 transition-colors"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={compact ? 16 : 18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className={`text-center font-bold uppercase text-faint ${compact ? 'text-[9px]' : 'text-[10px]'}`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = isSameMonth(day, viewMonth);
          const disabled = isBefore(startOfDay(day), minDay);
          const selectedDay = isSameDay(day, selected);
          const today = isSameDay(day, new Date());

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled || !inMonth}
              onClick={() => onSelect(format(day, 'yyyy-MM-dd'))}
              className={[
                cell,
                'mx-auto flex items-center justify-center rounded-lg font-medium transition-all',
                !inMonth && 'invisible pointer-events-none',
                disabled && inMonth && 'text-faint/40 cursor-not-allowed',
                !disabled && inMonth && !selectedDay && 'text-foreground hover:bg-primary/10',
                selectedDay && 'bg-primary text-primary-fg shadow-sm',
                today && !selectedDay && !disabled && 'ring-1 ring-primary/40',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
