'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, Ban, CheckCircle2, Clock, Hammer, XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDeadlineMs, useRemainingMsUntil, formatCountdownHMS } from '@/lib/hooks/useRemainingUntil';
import OfferConditionsBlock from '@/components/cases/OfferConditionsBlock';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';
import { startWorkAction } from '@/lib/db/actions/proposal';
import { acceptAssignmentAction } from '@/lib/db/actions/assignment';
import { getRejectionUiEnabledAction } from '@/lib/db/actions/rejection';
import UchRejectInvitationDialog from '@/components/cases/uch/UchRejectInvitationDialog';
import { quoteDisplayFromInvitation } from '@/lib/uchQuoteDisplay';
import type { InvitationItem } from '@/lib/db/actions/invitations';
import type { ServerClockAnchor } from '@/lib/deadlineMs';
import { dispatchDashboardMetricsRefresh } from '@/lib/dashboard/dashboardRefresh';
import { CaseDesiredDeliveryChip } from '@/components/cases/CaseDesiredDeliveryChip';
import { POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import { INTERNAL_CASE_STATUSES } from '@/lib/constants/dental';

export type UchFauchardActionsPanelProps = {
  caseId: string;
  caseStatus: string;
  actingAsDentista: boolean;
  actingAsTecnico: boolean;
  clinicalCase: any;
  myInvitation: InvitationItem | null | undefined;
  comparative?: unknown;
  currentUserId?: string;
  quotePrice?: string;
  setQuotePrice?: (v: string) => void;
  quoteDays?: number;
  setQuoteDays?: (v: number) => void;
  quoteFlatUnit?: 'dias' | 'horas';
  setQuoteFlatUnit?: (v: 'dias' | 'horas') => void;
  quoteNotes?: string;
  setQuoteNotes?: (v: string) => void;
  isSubmittingQuote?: boolean;
  isStartingWork: boolean;
  setIsStartingWork: (v: boolean) => void;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  onInvitationUpdate?: () => void | Promise<void>;
  onActionTriggered?: (action: string, data?: unknown) => Promise<unknown>;
  onOpenDeliveryInline?: () => void;
  showDeliveryShortcut?: boolean;
  proposalDeadlineMs?: number | null;
  serverClockAnchor?: ServerClockAnchor | null;
};

export default function UchFauchardActionsPanel({
  caseId,
  caseStatus,
  actingAsDentista,
  actingAsTecnico,
  clinicalCase,
  myInvitation,
  currentUserId,
  isStartingWork,
  setIsStartingWork,
  showSuccess,
  showError,
  onInvitationUpdate,
  serverClockAnchor,
}: UchFauchardActionsPanelProps) {
  const [rejectionEnabled, setRejectionEnabled] = useState(false);
  const [showRejectAssignment, setShowRejectAssignment] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptStep, setAcceptStep] = useState<'choose' | 'confirm'>('choose');

  useEffect(() => {
    getRejectionUiEnabledAction().then((r) => setRejectionEnabled(r.enabled));
  }, []);

  const assignmentExpiresMs = useDeadlineMs(myInvitation?.expiresAt ?? null);
  const assignmentRemainingMs = useRemainingMsUntil(assignmentExpiresMs, serverClockAnchor);
  const assignmentCountdown = formatCountdownHMS(assignmentRemainingMs);

  const canAcceptAssignment =
    actingAsTecnico &&
    myInvitation?.status === 'pending' &&
    caseStatus === 'enEvaluacion' &&
    assignmentRemainingMs > 0;

  const canRejectAssignment =
    rejectionEnabled &&
    actingAsTecnico &&
    myInvitation?.status === 'pending' &&
    caseStatus === 'enEvaluacion';

  const canStartWork =
    actingAsTecnico &&
    caseStatus === 'aceptadaPendienteInicio' &&
    myInvitation?.status === 'accepted';

  const assignmentQuote = myInvitation
    ? quoteDisplayFromInvitation({
        compensation: myInvitation.compensation,
        deadlineDays: myInvitation.deadlineDays,
        deadlineHours: myInvitation.deadlineHours,
      })
    : null;

  const handleAccept = async () => {
    if (!myInvitation?.id) return;
    setIsAccepting(true);
    const res = await acceptAssignmentAction(myInvitation.id);
    setIsAccepting(false);
    if (res.success) {
      showSuccess('Asignación aceptada. Cuando estés listo, inicia el trabajo.');
      dispatchDashboardMetricsRefresh();
      await onInvitationUpdate?.();
    } else {
      showError(res.error || 'No se pudo aceptar la asignación');
    }
  };

  if (actingAsDentista && caseStatus === 'enEvaluacion') {
    if (clinicalCase?.internalStatus === POOL_INTERNAL_STATUS) {
      return null;
    }
    const awaitingAccept = clinicalCase?.internalStatus === INTERNAL_CASE_STATUSES.ASIGNACION_PENDIENTE;
    return (
      <div className="rounded-xl border border-primary/20 bg-primary-hl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-[10px] font-black text-primary uppercase tracking-widest">
            {awaitingAccept ? 'Esperando aceptación del técnico' : 'Fauchard está asignando tu caso'}
          </span>
        </div>
        <p className="text-[11px] text-muted leading-relaxed">
          El precio y plazo ya están definidos. Te avisaremos cuando un técnico acepte la asignación.
        </p>
        {clinicalCase?.listPriceSale != null && (
          <p className="text-[11px] text-foreground font-semibold">
            Precio acordado: ${Number(clinicalCase.listPriceSale).toLocaleString('es-CL')} CLP
          </p>
        )}
      </div>
    );
  }

  if (!actingAsTecnico || !myInvitation) return null;

  return (
    <div className="space-y-3">
      {clinicalCase?.desiredDeliveryAt && (
        <CaseDesiredDeliveryChip value={clinicalCase.desiredDeliveryAt} className="w-full justify-center" />
      )}

      {canAcceptAssignment && (
        <div className="rounded-xl border border-primary/30 bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-black text-muted uppercase tracking-widest">
              Nueva asignación
            </span>
            <span className="text-[10px] font-mono text-warning tabular-nums">{assignmentCountdown}</span>
          </div>
          {assignmentQuote && (
            <UchQuoteBreakdown quote={assignmentQuote} variant="compact" tone="neutral" />
          )}
          <p className="text-[10px] text-muted leading-relaxed">
            Acepta para comprometerte con la compensación y el plazo indicados, o rechaza si no puedes tomar el caso.
          </p>
          {acceptStep === 'confirm' ? (
            <div className="space-y-2">
              <p className="text-[10px] text-muted text-center">¿Confirmas que aceptas esta asignación?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAcceptStep('choose')}
                  className="flex-1 py-2 bg-surface-2 text-muted text-[10px] font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => { await handleAccept(); setAcceptStep('choose'); }}
                  disabled={isAccepting}
                  data-testid="uch-accept-assignment"
                  className="flex-1 py-2.5 bg-primary text-inverse text-[10px] font-black rounded-xl uppercase shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAccepting ? (
                    <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Confirmar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAcceptStep('confirm')}
              disabled={isAccepting}
              data-testid="uch-accept-assignment"
              className="w-full py-2.5 bg-primary text-inverse text-[10px] font-black rounded-xl uppercase shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Aceptar asignación
            </button>
          )}
          {canRejectAssignment && (
            <button
              type="button"
              onClick={() => setShowRejectAssignment(true)}
              data-testid="uch-reject-assignment-open"
              className="w-full py-2 border border-error/20 text-error hover:bg-error-hl text-[10px] font-black uppercase rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Ban className="w-3.5 h-3.5" />
              Rechazar asignación
            </button>
          )}
        </div>
      )}

      {myInvitation.status === 'accepted' && caseStatus === 'aceptadaPendienteInicio' && (
        <div className="bg-primary-hl border border-primary/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Hammer className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">
              Asignación aceptada
            </span>
          </div>
          <p className="text-[10px] text-muted leading-relaxed">
            Cuando estés listo, confirma el inicio del trabajo. Esto notificará al dentista y comenzará el conteo de tu plazo.
          </p>
          {assignmentQuote && (
            <OfferConditionsBlock
              invitation={{
                compensation: myInvitation.compensation,
                deadlineDays: myInvitation.deadlineDays,
                deadlineHours: myInvitation.deadlineHours,
                status: myInvitation.status,
              }}
            />
          )}
          <button
            type="button"
            onClick={async () => {
              setIsStartingWork(true);
              const res = await startWorkAction(caseId);
              setIsStartingWork(false);
              if (res.success) {
                showSuccess('¡Trabajo iniciado! El plazo de entrega ha sido registrado.');
                await onInvitationUpdate?.();
              } else {
                showError(res.error || 'No se pudo iniciar el trabajo');
              }
            }}
            disabled={!canStartWork || isStartingWork}
            className="w-full py-2.5 bg-primary text-inverse text-[10px] font-black rounded-xl uppercase shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isStartingWork ? (
              <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
            ) : (
              <Hammer className="w-4 h-4" />
            )}
            Iniciar trabajo
          </button>
        </div>
      )}

      {myInvitation.status === 'rejected' &&
        !(
          clinicalCase?.assignedTechnicianId &&
          clinicalCase.assignedTechnicianId !== currentUserId
        ) && (
        <div className="bg-error border border-error/20 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-error flex-shrink-0" />
            <span className="text-[10px] font-black text-error uppercase tracking-widest">
              Asignación no continúa
            </span>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Esta asignación ya no está activa en este caso. Gracias por tu disponibilidad.
          </p>
        </div>
      )}

      {myInvitation.status === 'expired' && (
        <div className="rounded-xl border border-warning/30 bg-warning-hl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted">
            El plazo para responder a esta asignación venció
            {myInvitation.expiresAt
              ? ` (${format(new Date(myInvitation.expiresAt), "d MMM yyyy HH:mm", { locale: es })})`
              : ''}.
          </p>
        </div>
      )}

      <AnimatePresence>
        {showRejectAssignment && myInvitation?.id && (
          <UchRejectInvitationDialog
            isOpen={showRejectAssignment}
            invitationId={myInvitation.id}
            onClose={() => setShowRejectAssignment(false)}
            onRejected={async () => {
              setShowRejectAssignment(false);
              showSuccess('Asignación rechazada.');
              dispatchDashboardMetricsRefresh();
              await onInvitationUpdate?.();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
