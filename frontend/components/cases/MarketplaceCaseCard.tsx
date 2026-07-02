import { motion } from 'framer-motion';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import React, { useMemo } from 'react';
import { useDeadlineMs, useRemainingMsUntil, formatCountdownHMS } from '@/lib/hooks/useRemainingUntil';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  CaseHubUnreadBadge,
  CaseServiceTypeBadge,
  UchHubIcon,
} from '@/components/cases/CaseFichaHubAndServiceIcons';
import { formatCaseIdAndPac } from '@/lib/cases/caseDisplay';
import { statusLabel, statusIcon } from '@/components/ui/StatusBadge';
import type { ServerClockAnchor } from '@/lib/deadlineMs';
import { dispatchCaseHubToggle } from '@/lib/caseHubToggleEvent';
import { getDentistCardZone, getTechnicianCardCta } from '@/lib/cases/dentistCardPresentation';
import { maskCaseStatusForViewer } from '@/lib/cases/qualityStatusMasking';

const CASE_CARD_SHELL =
  'bg-surface border border-divider/35 rounded-[1.5rem] shadow-sm shadow-black/40 ring-1 ring-inset ring-white/[0.07] transition-colors duration-150 hover:bg-surface-off hover:border-primary/30 hover:ring-teal-500/10 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary/30';

const CTA_BUTTON_BASE =
  'flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all group/btn';
const CTA_BUTTON_NEUTRAL = `${CTA_BUTTON_BASE} bg-surface border border-divider text-foreground hover:bg-primary hover:border-teal-600`;
const CTA_BUTTON_PRIMARY = `${CTA_BUTTON_BASE} bg-primary border border-teal-600 text-on-primary hover:bg-primary/90 shadow-[0_0_18px_-6px_rgba(20,184,166,0.55)]`;

const DAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatCaseDateShort(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return null;
  const day = DAYS_ES[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS_ES[d.getMonth()];
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${dd}/${mon}/${yy}, ${hh}:${mm}`;
}

function formatDeadlineRelative(value: unknown): { label: string | null; urgent: boolean } {
  if (!value) return { label: null, urgent: false };
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return { label: null, urgent: false };
  const diffMs = d.getTime() - Date.now();
  if (diffMs < 0) return { label: 'Vencido', urgent: true };
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 48) return { label: `en ${Math.ceil(diffH)}h`, urgent: true };
  const diffD = diffMs / (1000 * 60 * 60 * 24);
  if (diffD < 7) return { label: `en ${Math.ceil(diffD)} días`, urgent: false };
  const day = DAYS_ES[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS_ES[d.getMonth()];
  return { label: `${day} ${dd}/${mon}`, urgent: false };
}

// Full class names so Tailwind detects them at build time
const STATUS_ACCENT: Record<string, string> = {
  borrador: 'border-l-divider',
  cerrado: 'border-l-divider',
  enEvaluacion: 'border-l-primary',
  aceptadaPendienteInicio: 'border-l-primary',
  enEjecucion: 'border-l-primary',
  propuestaLista: 'border-l-warning',
  enRevision: 'border-l-warning',
  enRevisionCalidad: 'border-l-warning',
  cambiosEnProceso: 'border-l-warning',
  pausado: 'border-l-warning',
  completado: 'border-l-jade',
  rechazado: 'border-l-error',
  cancelado: 'border-l-error',
};

const STATUS_TEXT: Record<string, string> = {
  borrador: 'text-muted',
  cerrado: 'text-muted',
  enEvaluacion: 'text-primary',
  aceptadaPendienteInicio: 'text-primary',
  enEjecucion: 'text-primary',
  propuestaLista: 'text-warning',
  enRevision: 'text-warning',
  enRevisionCalidad: 'text-warning',
  cambiosEnProceso: 'text-warning',
  pausado: 'text-warning',
  completado: 'text-jade',
  rechazado: 'text-error',
  cancelado: 'text-error',
};

function countFiles(c: any): number {
  const files = c?.files || c?.files_on_clinicalCase;
  return Array.isArray(files) ? files.length : 0;
}

interface MarketplaceCaseCardProps {
  c: any;
  myBid?: any;
  invitation?: any;
  deletingBidId?: string | null;
  submitting?: boolean;
  onSetDeletingBidId?: (id: string | null) => void;
  onDeleteBid?: (id: string) => void;
  onSelectCase: (c: any) => void;
  isLink?: boolean;
  isDentist?: boolean;
  isCalidad?: boolean;
  /** Pendientes por caso (servidor): UCH + bump de responsabilidad / turno. */
  hubUchUnread?: number;
  /** Ancla de reloj del servidor (listCases / detalle) para countdown alineado. */
  serverClockAnchor?: ServerClockAnchor | null;
}

export default function MarketplaceCaseCard({
  c,
  myBid,
  invitation,
  onSelectCase,
  isDentist = false,
  isCalidad = false,
  hubUchUnread = 0,
  serverClockAnchor = null,
}: MarketplaceCaseCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  useAuth();

  const inviteExpirySource = invitation?.expiresAt || c.invitationExpiresAt;
  const inviteDeadlineMs = useDeadlineMs(inviteExpirySource ?? null);
  const remaining = useRemainingMsUntil(inviteDeadlineMs, serverClockAnchor);
  const countdownText = remaining <= 0 ? null : formatCountdownHMS(remaining);

  const proposalSource =
    isDentist && String(c.status ?? '') === 'propuestaLista' && c.proposalExpiresAt ? c.proposalExpiresAt : null;
  const proposalDeadlineMs = useDeadlineMs(proposalSource);
  const proposalRemaining = useRemainingMsUntil(proposalDeadlineMs, serverClockAnchor);
  const proposalCountdownText = proposalRemaining < 0 ? null : formatCountdownHMS(proposalRemaining);

  const unreadCount = useMemo(() => hubUchUnread ?? 0, [hubUchUnread]);

  const dentistZone = useMemo(
    () =>
      isDentist
        ? getDentistCardZone({
            status: String(c.status ?? ''),
            workDeadline: c.workDeadline,
            completedAt: c.completedAt,
            material: c.material,
            fileCount: countFiles(c),
            desiredDeliveryAt: c.desiredDeliveryAt,
          })
        : null,
    [isDentist, c],
  );

  const technicianCta = !isDentist
    ? getTechnicianCardCta({
        invitationStatus: myBid?.status ?? null,
        caseStatus: String(c.status ?? ''),
      })
    : null;

  const hubAriaLabel =
    unreadCount > 0
      ? `Centro de control: ${unreadCount} mensaje${unreadCount === 1 ? '' : 's'} sin leer`
      : pathname === `/dashboard/cases/${c.id}`
        ? 'Abrir o cerrar Centro de control'
        : 'Abrir Centro de control';

  const status = String(c.status ?? '');
  const displayStatus = isDentist ? maskCaseStatusForViewer(status, 'dentista') : status;
  const accentClass = STATUS_ACCENT[displayStatus] ?? 'border-l-divider';
  const textColorClass = STATUS_TEXT[displayStatus] ?? 'text-muted';
  const StatusIcon = statusIcon(displayStatus);
  const metaLine = formatCaseIdAndPac(c.caseNumber, c.patientIdAnon);
  const ctaClass = dentistZone?.ctaVariant === 'primary' ? CTA_BUTTON_PRIMARY : CTA_BUTTON_NEUTRAL;
  const ctaLabel = isDentist ? dentistZone?.ctaLabel ?? 'Ver caso' : technicianCta ?? 'Ver caso';

  const isHighPriority = c.urgency === 'Alta' || c.urgency === 'Urgente' || c.urgency === 'alta' || c.urgency === 'urgente';
  const deadline = formatDeadlineRelative(c.desiredDeliveryAt);

  const isPublished = Boolean(c.publishedAt);
  const pubDateLabel = formatCaseDateShort(c.publishedAt ?? c.updatedAt);
  const pubDatePrefix = isPublished ? 'F.Pub' : 'Borrador';

  return (
    <motion.div
      key={c.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${CASE_CARD_SHELL} border-l-4 ${accentClass} transition-all group relative overflow-hidden backdrop-blur-sm flex flex-col h-full min-w-[260px]`}
    >
      <div className="p-4 flex flex-col flex-1 text-sm">

        {/* Header: estado + hub */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${textColorClass}`} aria-hidden />
            <span className={`text-[11px] font-bold uppercase tracking-wider truncate ${textColorClass}`}>
              {statusLabel(displayStatus)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const casePath = `/dashboard/cases/${c.id}`;
                if (pathname === casePath) {
                  dispatchCaseHubToggle(c.id);
                  return;
                }
                router.push(`${casePath}?openHub=1`);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-divider/60 bg-background/60 text-muted transition-colors duration-150 hover:bg-surface-off hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              title={hubAriaLabel}
              aria-label={hubAriaLabel}
            >
              <UchHubIcon className="h-3.5 w-3.5" />
            </button>
            <CaseHubUnreadBadge count={unreadCount} />
          </div>
        </div>

        {/* Nombre + meta */}
        <div className="mb-3">
          <h3 className="text-lg serif-font text-foreground group-hover:text-primary transition-colors uppercase tracking-tight line-clamp-2 leading-tight">
            {c.internalName || c.restorationType || 'Caso Dental'}
          </h3>
          {metaLine && (
            <p className="text-muted text-xs mt-0.5 font-bold uppercase tracking-wide">{metaLine}</p>
          )}
        </div>

        {/* Chips: tipo + CAD + prioridad (solo si alta/urgente) */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {c.restorationType && (
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary bg-primary-hl px-1.5 py-0.5 rounded-md">
              {c.restorationType}
            </span>
          )}
          <CaseServiceTypeBadge serviceType={c.serviceType} />
          {isHighPriority && (
            <span className="text-[11px] font-bold uppercase tracking-wider text-error bg-error-hl px-1.5 py-0.5 rounded-md">
              ⚠ {c.urgency}
            </span>
          )}
        </div>

        {/* Deadline pill */}
        {deadline.label && (
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider mb-3 ${
              deadline.urgent
                ? 'bg-error-hl text-error border-error/20'
                : 'bg-surface-off text-muted border-divider'
            }`}
          >
            <span className="opacity-70">Entrega</span>
            <span>{deadline.label}</span>
            {pubDateLabel && (
              <span className="ml-auto font-mono text-[10px] opacity-60 normal-case tracking-normal">
                {pubDatePrefix} {pubDateLabel}
              </span>
            )}
          </div>
        )}

        {/* Chip "Calificar" para rol calidad */}
        {isCalidad && c.qualityRatingPending && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-warning bg-warning-hl px-1.5 py-0.5 rounded-md">
              <ClipboardCheck className="w-3 h-3" aria-hidden />
              Calificar
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* CTA único */}
        <button
          onClick={(e) => {
            e.preventDefault();
            onSelectCase(c);
          }}
          className={ctaClass}
        >
          {ctaLabel}
          <ChevronRight className="w-3 h-3 shrink-0 group-hover/btn:translate-x-1 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
}
