'use client';

import { Factory, Layers, MessageSquare, PenTool } from 'lucide-react';
import { SERVICE_TYPE_LABELS } from '@/lib/constants/dental';

/**
 * Icono de chat (doble burbuja) para el Centro de control (UCH).
 * Hereda color vía `currentColor` (coherente con botones teal de la app).
 */
export function UchHubIcon({ className }: { className?: string }) {
  return (
    <span
      className={['relative inline-flex shrink-0 items-center justify-center', className ?? 'h-4 w-4'].join(' ')}
      aria-hidden
    >
      <MessageSquare
        strokeWidth={2}
        className="absolute left-[2px] top-[2px] h-[13px] w-[13px] text-current opacity-[0.28]"
      />
      <MessageSquare strokeWidth={2.25} className="relative h-4 w-4 text-current" />
    </span>
  );
}

/** Globo de no leídos junto al botón UCH en fichas (sutil, sin animación agresiva). */
export function CaseHubUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const display = count > 99 ? '99+' : String(count);
  return (
    <span
      className="pointer-events-none flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-error px-1 text-[8px] font-semibold tabular-nums leading-none text-inverse/95 ring-1 ring-slate-950/60"
      title={`${count} mensaje${count === 1 ? '' : 's'} sin leer en el Centro de control`}
    >
      {display}
    </span>
  );
}

const SERVICE_META: Record<
  string,
  { Icon: typeof PenTool; label: string; chipClass: string; iconClass: string }
> = {
  solo_diseno: {
    Icon: PenTool,
    label: 'CAD',
    chipClass: 'border-sky-500/35 bg-sky-500/10 text-primary',
    iconClass: 'text-sky-400',
  },
  solo_fabricacion: {
    Icon: Factory,
    label: 'CAM',
    chipClass: 'border-warning/20 bg-warning-hl text-warning',
    iconClass: 'text-warning',
  },
  integral: {
    Icon: Layers,
    label: 'CAD+CAM',
    chipClass: 'border-primary/30 bg-primary/12 text-primary',
    iconClass: 'text-primary',
  },
};

export function CaseServiceTypeBadge({ serviceType }: { serviceType?: string | null }) {
  const key = typeof serviceType === 'string' ? serviceType : '';
  const meta = SERVICE_META[key];
  if (!meta) return null;
  const { Icon, label, chipClass, iconClass } = meta;
  const title = SERVICE_TYPE_LABELS[key] ?? label;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-2 py-1 ${chipClass}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} aria-hidden />
      <span className="font-bold uppercase tracking-wider text-[9px]">{label}</span>
    </span>
  );
}
