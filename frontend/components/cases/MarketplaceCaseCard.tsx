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
import CaseViewerStatusStripe from '@/components/cases/CaseViewerStatusStripe';
import StatusBadge from '@/components/ui/StatusBadge';
import type { CaseViewerStatusInput } from '@/lib/cases/caseViewerStatusPresentation';
import type { InvitationStatusForKpi } from '@/lib/dashboard/classifyCaseForDashboardKpi';
import type { ServerClockAnchor } from '@/lib/deadlineMs';
import { dispatchCaseHubToggle } from '@/lib/caseHubToggleEvent';
import { getDentistCardZone, getTechnicianCardCta } from '@/lib/cases/dentistCardPresentation';

/** Marco de ficha sobre fondo oscuro: borde + aro interior muy suave. */
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
  const { userProfile: authUserProfile } = useAuth();

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

  const techStatusInput: CaseViewerStatusInput | null = useMemo(() => {
    if (isDentist || !authUserProfile?.id) return null;
    const invStatus = (myBid?.status ?? null) as InvitationStatusForKpi;
    return {
      caseStatus: String(c.status ?? ''),
      assignedTechnicianId: c.assignedTechnicianId ?? null,
      technicianUserId: String(authUserProfile.id),
      invitationStatus: invStatus,
    };
  }, [isDentist, authUserProfile?.id, myBid?.status, c.status, c.assignedTechnicianId]);

  const techCountdownRight =
    countdownText &&
    techStatusInput &&
    (techStatusInput.invitationStatus === 'pending' ||
      (techStatusInput.invitationStatus === 'quoted' &&
        techStatusInput.caseStatus === 'enEvaluacion') ||
      ((techStatusInput.caseStatus === 'enEvaluacion' ||
        techStatusInput.caseStatus === 'propuestaLista') &&
        (techStatusInput.invitationStatus === 'accepted' ||
          techStatusInput.invitationStatus === 'confirmed'))) ? (
      <div className="font-mono text-[11px] tabular-nums tracking-normal text-warning opacity-90">
        {countdownText}
      </div>
    ) : null;

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

  const dentistCountdown =
    String(c.status ?? '') === 'enEvaluacion'
      ? countdownText
      : String(c.status ?? '') === 'propuestaLista'
        ? proposalCountdownText
        : null;
  const dentistCountdownPulses =
    (String(c.status ?? '') === 'enEvaluacion' && remaining > 0) ||
    (String(c.status ?? '') === 'propuestaLista' && proposalRemaining > 0);

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

  const uchHubOpenButton = (
    <motion.div className="flex shrink-0 items-center gap-1">
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
        className="flex h-[42px] w-10 shrink-0 items-center justify-center rounded-xl border border-divider/80 bg-background/80 text-muted transition-colors duration-150 hover:bg-surface-off hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        title={hubAriaLabel}
        aria-label={hubAriaLabel}
      >
        <UchHubIcon className="h-4 w-4" />
      </button>
      <CaseHubUnreadBadge count={unreadCount} />
    </motion.div>
  );

  const isPublished = Boolean(c.publishedAt);
  const caseDateLabel = formatCaseDateShort(c.publishedAt ?? c.updatedAt);
  const caseDatePrefix = isPublished ? 'F.Publicación' : 'F.Borrador';
  const deliveryDateLabel = formatCaseDateShort(c.desiredDeliveryAt);
  const metaLine = formatCaseIdAndPac(c.caseNumber, c.patientIdAnon);

  const ctaClass = dentistZone?.ctaVariant === 'primary' ? CTA_BUTTON_PRIMARY : CTA_BUTTON_NEUTRAL;
  const ctaLabel = isDentist ? dentistZone?.ctaLabel ?? 'Ver caso' : technicianCta ?? 'Ver caso';

  return (
    <motion.div
      key={c.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${CASE_CARD_SHELL} transition-all group relative overflow-hidden backdrop-blur-sm flex flex-col h-full min-w-[260px]`}
    >
      <div className="p-4 flex flex-col flex-1 text-sm">
        {/* Header: chips + fecha */}
        <div className="flex flex-col gap-1 mb-3">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary bg-primary-hl px-1.5 py-0.5 rounded-md">
                {c.restorationType || 'General'}
              </span>
              <CaseServiceTypeBadge serviceType={c.serviceType} />
            </div>
            {(caseDateLabel || deliveryDateLabel) && (
              <div className="text-[11px] font-mono text-muted shrink-0 ml-1 flex flex-col items-end">
                {caseDateLabel && <span><span className="text-muted/70">{caseDatePrefix} :</span> {caseDateLabel}</span>}
                {deliveryDateLabel && <span><span className="text-muted/70">F.Entrega :</span> {deliveryDateLabel}</span>}
              </div>
            )}
          </div>
          <span
            className={`text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md w-fit ${
              c.urgency === 'Alta' || c.urgency === 'Urgente'
                ? 'bg-error-hl text-error'
                : 'bg-primary-hl text-primary'
            }`}
          >
            Prioridad {c.urgency || 'Normal'}
          </span>
        </div>

        {/* Título + metadata en una línea */}
        <div className="mb-3">
          <h3 className="text-lg serif-font text-foreground group-hover:text-primary transition-colors uppercase tracking-tight line-clamp-2 leading-tight">
            {c.internalName || c.restorationType || 'Caso Dental'}
          </h3>
          {metaLine && (
            <p className="text-muted text-xs mt-1 font-bold uppercase tracking-wide">{metaLine}</p>
          )}
        </div>

        {/* Zona adaptativa */}
        <div className="flex-1 mb-4">
          {isDentist && dentistZone ? (
            <div className="w-full rounded-xl bg-background/80 border border-divider px-3 py-2.5">
              <div className="flex items-center gap-2">
                <dentistZone.icon className={`w-4 h-4 shrink-0 ${dentistZone.iconClass}`} aria-hidden />
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                  {dentistZone.primary}
                </span>
                {dentistCountdown && (
                  <span
                    className={`ml-auto font-mono text-[11px] tabular-nums tracking-normal text-warning ${
                      dentistCountdownPulses ? 'animate-pulse' : ''
                    }`}
                  >
                    {dentistCountdown}
                  </span>
                )}
              </div>
            </div>
          ) : isCalidad ? (
            <div className="w-full min-h-10 flex items-center gap-2 px-3 rounded-xl bg-background border border-divider">
              <StatusBadge status={String(c.status ?? '')} />
              {c.qualityRatingPending && (
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-warning bg-warning-hl px-1.5 py-0.5 rounded-md shrink-0">
                  <ClipboardCheck className="w-3 h-3" aria-hidden />
                  Por calificar
                </span>
              )}
            </div>
          ) : !isDentist && techStatusInput ? (
            <CaseViewerStatusStripe
              input={techStatusInput}
              invitedAt={invitation?.invitedAt ?? myBid?.invitedAt ?? myBid?.createdAt}
              countdownRight={techCountdownRight}
            />
          ) : null}
        </div>

        {/* Pie: hub + CTA */}
        <div className="flex w-full gap-2">
          {uchHubOpenButton}
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
      </div>
    </motion.div>
  );
}
