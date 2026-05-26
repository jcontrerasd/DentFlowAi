'use client';

import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

export type TimelineFilterItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export type CaseListTimelineFilterProps = {
  mainItems: TimelineFilterItem[];
  exceptionItems?: TimelineFilterItem[];
  selected: string[];
  onToggle: (id: string) => void;
  mainAriaLabel: string;
  exceptionGroupLabel?: string;
  /** Ancho mínimo del paso (etiquetas largas, p. ej. KPI técnico). */
  stepMinWidthClass?: string;
};

function TimelineStep({
  item,
  selected,
  onToggle,
  showLeadingConnector,
  stepMinWidthClass,
}: {
  item: TimelineFilterItem;
  selected: boolean;
  onToggle: (id: string) => void;
  showLeadingConnector: boolean;
  stepMinWidthClass: string;
}) {
  const Icon = item.icon;

  return (
    <motion.div className="flex items-start shrink-0">
      {showLeadingConnector ? (
        <span
          className="mt-[15px] mx-0.5 h-px w-2 sm:w-2.5 shrink-0 bg-surface-off/70"
          aria-hidden
        />
      ) : null}
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        aria-pressed={selected}
        aria-label={item.label}
        className={`group flex ${stepMinWidthClass} flex-col items-center gap-1.5 px-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 rounded-lg`}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
            selected
              ? 'border-teal-400/90 bg-primary-hl text-primary shadow-[0_0_14px_rgba(45,212,191,0.35)]'
              : 'border-divider/90 bg-background text-faint group-hover:border-divider'
          }`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </span>
        <span
          className={`w-full text-center text-[6px] font-black uppercase leading-[1.15] tracking-wide sm:text-[7px] ${
            selected ? 'text-primary/95' : 'text-faint'
          }`}
        >
          {item.label}
        </span>
      </button>
    </motion.div>
  );
}

export function ExceptionPill({
  item,
  selected,
  onToggle,
}: {
  item: TimelineFilterItem;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={() => onToggle(item.id)}
      aria-pressed={selected}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all ${
        selected
          ? 'border-teal-400/80 bg-primary-hl text-primary shadow-[0_0_10px_rgba(45,212,191,0.25)]'
          : 'border-divider/90 bg-background text-faint hover:border-divider'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="whitespace-nowrap text-[7px] font-bold uppercase tracking-wider">
        {item.label}
      </span>
    </button>
  );
}

const CHIP_BASE =
  'px-3 py-1.5 rounded-xl border text-[8px] font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0';

export function CaseListTimelineFilterWrap({
  items,
  selected,
  onToggle,
}: {
  items: TimelineFilterItem[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <motion.div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isOn = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={
              isOn
                ? `${CHIP_BASE} bg-primary/20 border-primary/30 text-primary`
                : `${CHIP_BASE} bg-background border-divider text-faint`
            }
          >
            {item.label}
          </button>
        );
      })}
    </motion.div>
  );
}

export default function CaseListTimelineFilter({
  mainItems,
  exceptionItems = [],
  selected,
  onToggle,
  mainAriaLabel,
  exceptionGroupLabel = 'Excepciones',
  stepMinWidthClass = 'w-[4.75rem] sm:w-[5.25rem]',
}: CaseListTimelineFilterProps) {
  return (
    <motion.div className="space-y-3">
      <motion.div
        className="flex flex-wrap items-start justify-start gap-y-3"
        role="group"
        aria-label={mainAriaLabel}
      >
        {mainItems.map((item, index) => (
          <TimelineStep
            key={item.id}
            item={item}
            selected={selected.includes(item.id)}
            onToggle={onToggle}
            showLeadingConnector={index > 0}
            stepMinWidthClass={stepMinWidthClass}
          />
        ))}
      </motion.div>

      {exceptionItems.length > 0 ? (
        <motion.div>
          <p className="mb-2 text-[8px] font-bold uppercase tracking-wider text-faint">
            {exceptionGroupLabel}
          </p>
          <motion.div className="flex flex-wrap gap-2">
            {exceptionItems.map((item) => (
              <ExceptionPill
                key={item.id}
                item={item}
                selected={selected.includes(item.id)}
                onToggle={onToggle}
              />
            ))}
          </motion.div>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
