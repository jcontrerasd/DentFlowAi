'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, CheckCircle2, Clock, Hammer, Package, Send, Undo2, XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDeadlineMs, useRemainingMsUntil, formatCountdownHMS } from '@/lib/hooks/useRemainingUntil';
import ComparativeOffersPanel from '@/components/cases/ComparativeOffersPanel';
import OfferConditionsBlock from '@/components/cases/OfferConditionsBlock';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';
import { startWorkAction, withdrawQuoteAction } from '@/lib/db/actions/proposal';
import { quoteDisplayFromInvitation } from '@/lib/uchQuoteDisplay';
import type { InvitationItem } from '@/lib/db/actions/invitations';
import type { ServerClockAnchor } from '@/lib/deadlineMs';
import { dispatchDashboardMetricsRefresh } from '@/lib/dashboard/dashboardRefresh';

type ComparativeOffer = {
  invitationId: string;
  rank: number;
  totalPriceCLP: number;
  quotedDays: number;
  techNotes: string | null;
  respondedAt: string | Date | null;
};

export type UchFauchardActionsPanelProps = {
  caseId: string;
  caseStatus: string;
  actingAsDentista: boolean;
  actingAsTecnico: boolean;
  clinicalCase: any;
  myInvitation: InvitationItem | null | undefined;
  comparative: ComparativeOffer[] | undefined;
  currentUserId?: string;
  quotePrice: string;
  setQuotePrice: (v: string) => void;
  quoteDays: number;
  setQuoteDays: (v: number) => void;
  quoteNotes: string;
  setQuoteNotes: (v: string) => void;
  // Desglose obligatorio en casos integrales (Fase 4.3).
  quoteDesignPrice?: string;
  setQuoteDesignPrice?: (v: string) => void;
  quoteDesignDays?: number;
  setQuoteDesignDays?: (v: number) => void;
  quoteFabricationPrice?: string;
  setQuoteFabricationPrice?: (v: string) => void;
  quoteFabricationDays?: number;
  setQuoteFabricationDays?: (v: number) => void;
  isSubmittingQuote: boolean;
  isStartingWork: boolean;
  setIsStartingWork: (v: boolean) => void;
  setQuoteConfirmChecked: (v: boolean | ((p: boolean) => boolean)) => void;
  setShowQuoteConfirm: (v: boolean) => void;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  onInvitationUpdate?: () => Promise<void>;
  onActionTriggered?: (action: string, data?: unknown) => Promise<unknown>;
  onOpenDeliveryInline: () => void;
  showDeliveryShortcut: boolean;
  /** Ms del plazo de propuesta (detalle); prioridad sobre parseo en el panel. */
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
  comparative,
  currentUserId,
  quotePrice,
  setQuotePrice,
  quoteDays,
  setQuoteDays,
  quoteNotes,
  setQuoteNotes,
  quoteDesignPrice = '',
  setQuoteDesignPrice,
  quoteDesignDays = 0,
  setQuoteDesignDays,
  quoteFabricationPrice = '',
  setQuoteFabricationPrice,
  quoteFabricationDays = 0,
  setQuoteFabricationDays,
  isSubmittingQuote,
  isStartingWork,
  setIsStartingWork,
  setQuoteConfirmChecked,
  setShowQuoteConfirm,
  showSuccess,
  showError,
  onInvitationUpdate,
  onActionTriggered,
  onOpenDeliveryInline,
  showDeliveryShortcut,
  proposalDeadlineMs,
  serverClockAnchor,
}: UchFauchardActionsPanelProps) {
  const [isStartingManufacturing, setIsStartingManufacturing] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [withdrawCheckUnderstand, setWithdrawCheckUnderstand] = useState(false);
  const [withdrawCheckConfirm, setWithdrawCheckConfirm] = useState(false);
  const [isWithdrawingQuote, setIsWithdrawingQuote] = useState(false);
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [dispatchCourier, setDispatchCourier] = useState('Interno');
  const [dispatchTracking, setDispatchTracking] = useState('');
  const [isRegisteringDispatch, setIsRegisteringDispatch] = useState(false);

  const canWithdrawQuote =
    actingAsTecnico &&
    myInvitation?.status === 'quoted' &&
    (caseStatus === 'enEvaluacion' || caseStatus === 'propuestaLista');

  const canStartManufacturingFromDesignApproved =
    clinicalCase?.serviceType === 'integral' || Boolean(clinicalCase?.needsFabrication);

  const quoteDeadlineMs = useDeadlineMs(
    myInvitation?.expiresAt && myInvitation.status === 'pending' && caseStatus === 'enEvaluacion'
      ? myInvitation.expiresAt
      : null,
  );
  const quoteRemainingMs = useRemainingMsUntil(quoteDeadlineMs, serverClockAnchor ?? null);

  return (
    <div
      data-testid="uch-case-actions-inline"
      className="rounded-xl border border-divider bg-surface px-3 py-3 space-y-3"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {actingAsDentista && caseStatus === 'propuestaLista' && clinicalCase?.proposalExpiresAt && (
            <div className="w-full">
              <ComparativeOffersPanel
                caseId={caseId}
                caseNumber={clinicalCase?.caseNumber}
                offers={comparative ?? []}
                proposalDeadlineMs={proposalDeadlineMs}
                proposalExpiresAt={clinicalCase.proposalExpiresAt}
                serverClockAnchor={serverClockAnchor}
                onUpdated={async () => {
                  await onInvitationUpdate?.();
                }}
              />
            </div>
          )}
          {actingAsDentista && clinicalCase?.pendingActionRequest && clinicalCase.pendingActionActor !== currentUserId && (
            <div className="w-full flex flex-col gap-2 p-3 bg-warning-hl border border-warning/20 rounded-xl mb-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                <span className="text-[10px] font-black text-foreground uppercase">Solicitud: {clinicalCase.pendingActionRequest}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void onActionTriggered?.('resolve_flow', { approved: false });
                  }}
                  className="flex-1 py-2 bg-surface-2 text-foreground text-[9px] font-bold rounded-lg uppercase"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onActionTriggered?.('resolve_flow', { approved: true });
                  }}
                  className="flex-1 py-2 bg-warning text-inverse text-[9px] font-bold rounded-lg uppercase"
                >
                  Aprobar
                </button>
              </div>
            </div>
          )}
          {actingAsDentista && caseStatus === 'enviado' && (
            <button
              type="button"
              onClick={() => {
                void onActionTriggered?.('confirm_reception');
              }}
              className="flex-1 py-3 bg-jade-hl text-foreground text-[10px] font-bold rounded-xl uppercase hover:bg-jade-hl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Recepción
            </button>
          )}
          {actingAsTecnico && myInvitation && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="w-full space-y-4">
              {myInvitation.expiresAt && myInvitation.status === 'pending' && caseStatus === 'enEvaluacion' && (
                <motion.div className="bg-surface-2/60 border border-divider rounded-xl p-3 space-y-2">
                  <p className="text-[9px] font-black text-warning/70 uppercase tracking-widest">
                    Plazo para enviar tu cotización
                  </p>
                  {quoteRemainingMs >= 0 && (
                    <p className="text-lg font-mono font-black tabular-nums text-warning">
                      {formatCountdownHMS(quoteRemainingMs)}
                    </p>
                  )}
                  <p className="text-[10px] text-warning/90 flex items-center gap-1">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    Hasta el {format(new Date(myInvitation.expiresAt), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
                  </p>
                </motion.div>
              )}
              {myInvitation.status === 'pending' && caseStatus === 'enEvaluacion' && (() => {
                const isIntegral = clinicalCase?.serviceType === 'integral';
                const dp = Number((quoteDesignPrice || '').replace(/\D/g, '')) || 0;
                const fp = Number((quoteFabricationPrice || '').replace(/\D/g, '')) || 0;
                const totalSplitPrice = dp + fp;
                const totalSplitDays = quoteDesignDays + quoteFabricationDays;
                const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
                const splitReady =
                  isIntegral &&
                  dp > 0 &&
                  fp > 0 &&
                  quoteDesignDays > 0 &&
                  quoteFabricationDays > 0;
                const flatReady = !isIntegral && !!quotePrice && quoteDays > 0;
                const disabled = isSubmittingQuote || (isIntegral ? !splitReady : !flatReady);

                return (
                  <div className="space-y-3 bg-surface/40 border border-divider rounded-2xl p-4">
                    {isIntegral ? (
                      <>
                        <p className="text-[10px] text-muted leading-relaxed">
                          Este caso es <strong className="text-primary">integral</strong>: ingresa precio y plazo por separado para diseño y fabricación. El total se calcula automáticamente.
                        </p>

                        <div className="space-y-3 rounded-xl border border-divider p-3">
                          <p className="text-[9px] font-black text-primary uppercase tracking-widest">Diseño</p>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest block mb-1">Precio diseño (CLP)</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Ej: 30000"
                              value={quoteDesignPrice ? new Intl.NumberFormat('es-CL').format(Number(quoteDesignPrice)) : ''}
                              onChange={(e) => setQuoteDesignPrice?.(e.target.value.replace(/\D/g, ''))}
                              className="w-full bg-surface-2 border border-divider rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-primary/30"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest block mb-1">Plazo diseño</label>
                            <select
                              value={quoteDesignDays}
                              onChange={(e) => setQuoteDesignDays?.(Number(e.target.value))}
                              className="w-full bg-surface-2 border border-divider rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/30"
                            >
                              <option value={0} disabled>Selecciona el plazo</option>
                              {[1, 2, 3, 5, 7, 10].map((d) => (
                                <option key={d} value={d}>{d} {d === 1 ? 'día hábil' : 'días hábiles'}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-xl border border-divider p-3">
                          <p className="text-[9px] font-black text-primary uppercase tracking-widest">Fabricación</p>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest block mb-1">Precio fabricación (CLP)</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Ej: 50000"
                              value={quoteFabricationPrice ? new Intl.NumberFormat('es-CL').format(Number(quoteFabricationPrice)) : ''}
                              onChange={(e) => setQuoteFabricationPrice?.(e.target.value.replace(/\D/g, ''))}
                              className="w-full bg-surface-2 border border-divider rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-primary/30"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest block mb-1">Plazo fabricación</label>
                            <select
                              value={quoteFabricationDays}
                              onChange={(e) => setQuoteFabricationDays?.(Number(e.target.value))}
                              className="w-full bg-surface-2 border border-divider rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/30"
                            >
                              <option value={0} disabled>Selecciona el plazo</option>
                              {[1, 2, 3, 5, 7, 10, 15].map((d) => (
                                <option key={d} value={d}>{d} {d === 1 ? 'día hábil' : 'días hábiles'}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="rounded-xl bg-primary-hl border border-primary/30 px-3 py-2 flex justify-between items-center">
                          <span className="text-[10px] font-black text-primary uppercase tracking-widest">Total</span>
                          <span className="text-sm font-black text-primary">
                            {fmtCLP(totalSplitPrice)} · {totalSplitDays} {totalSplitDays === 1 ? 'día hábil' : 'días hábiles'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest block mb-1">Precio (CLP)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Ej: 45000"
                            value={quotePrice ? new Intl.NumberFormat('es-CL').format(Number(quotePrice)) : ''}
                            onChange={(e) => setQuotePrice(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-surface-2 border border-divider rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-primary/30"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest block mb-1">Plazo de entrega</label>
                          <select
                            value={quoteDays}
                            onChange={(e) => setQuoteDays(Number(e.target.value))}
                            className="w-full bg-surface-2 border border-divider rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/30"
                          >
                            <option value={0} disabled>
                              Selecciona el plazo
                            </option>
                            {[1, 2, 3, 5, 7, 10, 15].map((d) => (
                              <option key={d} value={d}>
                                {d} {d === 1 ? 'día hábil' : 'días hábiles'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest block mb-1">
                        Nota (opcional) <span className="font-normal text-faint">{quoteNotes.length}/200</span>
                      </label>
                      <textarea
                        maxLength={200}
                        rows={2}
                        placeholder="Comentario opcional para el dentista..."
                        value={quoteNotes}
                        onChange={(e) => setQuoteNotes(e.target.value)}
                        className="w-full bg-surface-2 border border-divider rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-primary/30 resize-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuoteConfirmChecked(false);
                        setShowQuoteConfirm(true);
                      }}
                      disabled={disabled}
                      className="w-full py-2.5 bg-primary text-inverse text-[10px] font-black rounded-xl uppercase shadow-lg shadow-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      {isSubmittingQuote ? (
                        <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Enviar oferta
                    </button>
                  </div>
                );
              })()}
              {canWithdrawQuote && myInvitation.quotedPrice != null && (
                <div className="rounded-xl border border-divider bg-surface p-3 space-y-3">
                  <p className="text-[9px] font-black text-muted uppercase tracking-widest">Tu oferta enviada</p>
                  <UchQuoteBreakdown
                    quote={quoteDisplayFromInvitation(myInvitation)}
                    variant="compact"
                    tone="neutral"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawCheckUnderstand(false);
                      setWithdrawCheckConfirm(false);
                      setShowWithdrawConfirm(true);
                    }}
                    className="w-full py-2 border border-error/20 text-error hover:bg-error text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2"
                    data-testid="uch-withdraw-quote-open"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Retirar oferta
                  </button>
                </div>
              )}
              {myInvitation.quotedPrice != null &&
                !(myInvitation.status === 'confirmed' && caseStatus === 'aceptadaPendienteInicio') &&
                !canWithdrawQuote && (
                <OfferConditionsBlock invitation={myInvitation} />
              )}
              {myInvitation.status === 'rejected' &&
                !(
                  !myInvitation.dentistRejectionFeedback?.trim() &&
                  clinicalCase?.assignedTechnicianId &&
                  clinicalCase.assignedTechnicianId !== currentUserId
                ) && (
                <div className="bg-error border border-error/20 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-error flex-shrink-0" />
                    <span className="text-[10px] font-black text-error uppercase tracking-widest">
                      {myInvitation.dentistRejectionFeedback?.trim()
                        ? 'Oferta no contratada'
                        : 'Oferta no seleccionada'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    {myInvitation.dentistRejectionFeedback?.trim()
                      ? 'El dentista dejó un comentario sobre tu oferta. Puedes leerlo en el historial de esta conversación.'
                      : 'Tu oferta no continúa en este proceso. Gracias por participar.'}
                  </p>
                </div>
              )}
              {caseStatus === 'aceptadaPendienteInicio' && myInvitation?.status === 'confirmed' && (() => {
                const isSoloFabrication = clinicalCase?.serviceType === 'solo_fabricacion';
                const buttonLabel = isSoloFabrication ? 'Iniciar fabricación' : 'Iniciar trabajo';
                const successMsg = isSoloFabrication
                  ? '¡Fabricación iniciada! El plazo de entrega ha sido registrado.'
                  : '¡Trabajo iniciado! El plazo de entrega ha sido registrado.';
                return (
                  <div className="bg-primary-hl border border-primary/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Hammer className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">El dentista aceptó la propuesta</span>
                    </div>
                    <p className="text-[10px] text-muted leading-relaxed">
                      El dentista ha aceptado la propuesta. Cuando estés listo, confirma el inicio
                      {isSoloFabrication ? ' de la fabricación' : ' del trabajo'}. Esto notificará al dentista y comenzará el conteo de tu plazo comprometido.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsStartingWork(true);
                        const res = await startWorkAction(caseId);
                        setIsStartingWork(false);
                        if (res.success) {
                          showSuccess(successMsg);
                          await onInvitationUpdate?.();
                        } else {
                          showError(res.error || 'Error al iniciar el trabajo');
                        }
                      }}
                      disabled={isStartingWork}
                      className="w-full py-2.5 bg-primary hover:opacity-90 text-inverse text-[10px] font-black uppercase rounded-xl shadow-lg shadow-sm transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      {isStartingWork ? (
                        <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
                      ) : (
                        <Hammer className="w-4 h-4" />
                      )}
                      {buttonLabel}
                    </button>
                  </div>
                );
              })()}
              {myInvitation.status === 'expired' && (
                <div className="bg-error border border-error/20 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-error flex-shrink-0" />
                  <span className="text-[10px] font-bold text-error">Esta invitación ha vencido.</span>
                </div>
              )}
            </motion.div>
          )}
          {actingAsTecnico && caseStatus === 'enRevision' && (
            <div className="w-full py-3 bg-warning-hl border border-warning/20 text-warning text-[10px] font-bold rounded-xl flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              Esperando revisión del dentista…
            </div>
          )}
          {actingAsTecnico && caseStatus === 'disenoAprobado' && (
            <div className="w-full space-y-2">
              <div className="w-full py-3 bg-jade-hl border border-jade/20 text-jade text-[10px] font-bold rounded-xl flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Diseño aprobado por el cliente
              </div>
              {canStartManufacturingFromDesignApproved && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsStartingManufacturing(true);
                    try {
                      await onActionTriggered?.('start_manufacturing');
                    } finally {
                      setIsStartingManufacturing(false);
                    }
                  }}
                  disabled={isStartingManufacturing}
                  className="w-full py-2.5 bg-primary hover:opacity-90 text-inverse text-[10px] font-black uppercase rounded-xl shadow-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {isStartingManufacturing ? (
                    <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
                  ) : (
                    <Hammer className="w-4 h-4" />
                  )}
                  Iniciar fabricación
                </button>
              )}
            </div>
          )}
          {actingAsTecnico && caseStatus === 'enFabricacion' && (
            <button
              type="button"
              data-testid="uch-open-dispatch-form"
              onClick={() => {
                setDispatchCourier('Interno');
                setDispatchTracking('');
                setShowDispatchForm(true);
              }}
              className="w-full py-3 bg-jade-hl text-foreground text-[10px] font-bold rounded-xl uppercase hover:bg-jade-hl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" />
              Registrar despacho
            </button>
          )}
          {showDeliveryShortcut && (
            <button
              type="button"
              onClick={onOpenDeliveryInline}
              className="w-full py-2.5 text-[10px] font-semibold text-primary/90 hover:text-primary border border-primary/20 rounded-xl"
            >
              Ir a entrega de diseño (formulario en el hilo)
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showDispatchForm && actingAsTecnico && caseStatus === 'enFabricacion' && (
          <motion.div
            className="fixed inset-0 z-[310] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-surface border border-jade/20 border-b-0 sm:border-b rounded-t-2xl sm:rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 sm:mx-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="uch-dispatch-form-title"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-jade-hl rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Package className="w-6 h-6 text-jade" />
                </div>
                <h3 id="uch-dispatch-form-title" className="text-xl font-bold text-foreground">
                  Registrar despacho
                </h3>
                <p className="text-sm text-muted">
                  El dentista verá esta referencia en el hilo del caso para hacer seguimiento del envío.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="uch-dispatch-courier"
                    className="text-[10px] font-bold uppercase tracking-wider text-faint"
                  >
                    Transportista / medio
                  </label>
                  <input
                    id="uch-dispatch-courier"
                    type="text"
                    value={dispatchCourier}
                    onChange={(e) => setDispatchCourier(e.target.value)}
                    placeholder="Ej. Interno, Chilexpress, Starken…"
                    className="w-full bg-background border border-divider rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-faint focus:border-jade/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="uch-dispatch-tracking"
                    className="text-[10px] font-bold uppercase tracking-wider text-faint"
                  >
                    Seguimiento del envío
                  </label>
                  <textarea
                    id="uch-dispatch-tracking"
                    data-testid="uch-dispatch-tracking-input"
                    value={dispatchTracking}
                    onChange={(e) => setDispatchTracking(e.target.value)}
                    rows={3}
                    placeholder="Nº de guía, URL de seguimiento o instrucciones para el dentista"
                    className="w-full bg-background border border-divider rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-faint focus:border-jade/20 outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!isRegisteringDispatch) setShowDispatchForm(false);
                  }}
                  disabled={isRegisteringDispatch}
                  className="flex-1 py-3 bg-surface-2 text-muted text-[10px] font-black uppercase rounded-2xl hover:bg-surface-off transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  data-testid="uch-dispatch-confirm"
                  disabled={isRegisteringDispatch || !dispatchTracking.trim()}
                  onClick={async () => {
                    const trackingId = dispatchTracking.trim();
                    if (!trackingId || trackingId.toUpperCase() === 'N/A') {
                      showError('Indica un número de seguimiento, enlace o referencia de despacho.');
                      return;
                    }
                    setIsRegisteringDispatch(true);
                    try {
                      const ok = await onActionTriggered?.('register_dispatch', {
                        courier: dispatchCourier.trim() || 'Interno',
                        trackingId,
                      });
                      // Solo cerrar y limpiar si el server aceptó (no ContactGuard u otro fallo).
                      if (ok) {
                        setShowDispatchForm(false);
                        setDispatchTracking('');
                      }
                    } catch {
                      /* toast en page */
                    } finally {
                      setIsRegisteringDispatch(false);
                    }
                  }}
                  className="flex-1 py-3 bg-jade-hl hover:bg-jade-hl text-foreground text-[10px] font-black uppercase rounded-2xl transition-all disabled:opacity-40"
                >
                  {isRegisteringDispatch ? 'Registrando…' : 'Confirmar despacho'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {showWithdrawConfirm && actingAsTecnico && myInvitation && (
          <motion.div
            className="fixed inset-0 z-[310] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-surface border border-error/20 border-b-0 sm:border-b rounded-t-2xl sm:rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 sm:mx-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="uch-withdraw-quote-title"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-error rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Undo2 className="w-6 h-6 text-error" />
                </div>
                <h3 id="uch-withdraw-quote-title" className="text-xl font-bold text-foreground">
                  Retirar oferta
                </h3>
                <p className="text-sm text-muted">
                  Esta oferta dejará de participar hasta que envíes una nueva (si el plazo lo permite).
                </p>
              </div>

              <div className="bg-surface-2 rounded-2xl p-4">
                <UchQuoteBreakdown
                  quote={quoteDisplayFromInvitation(myInvitation)}
                  variant="compact"
                  tone="neutral"
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={withdrawCheckUnderstand}
                    onChange={(e) => setWithdrawCheckUnderstand(e.target.checked)}
                    className="mt-1 rounded border-divider"
                  />
                  <span className="text-xs text-muted leading-relaxed">
                    Entiendo que <strong className="text-foreground">retiro mi oferta</strong> de este caso y el solicitante dejará de verla en el comparativo.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={withdrawCheckConfirm}
                    onChange={(e) => setWithdrawCheckConfirm(e.target.checked)}
                    className="mt-1 rounded border-divider"
                  />
                  <span className="text-xs text-muted leading-relaxed">
                    <strong className="text-foreground">Confirmo</strong> que deseo retirar esta oferta y podré cotizar de nuevo mientras no venza el plazo de invitación.
                  </span>
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowWithdrawConfirm(false);
                    setWithdrawCheckUnderstand(false);
                    setWithdrawCheckConfirm(false);
                  }}
                  disabled={isWithdrawingQuote}
                  className="flex-1 py-3 bg-surface-2 text-muted text-[10px] font-black uppercase rounded-2xl hover:bg-surface-off transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  data-testid="uch-withdraw-quote-confirm"
                  disabled={isWithdrawingQuote || !withdrawCheckUnderstand || !withdrawCheckConfirm}
                  onClick={async () => {
                    setIsWithdrawingQuote(true);
                    const res = await withdrawQuoteAction(myInvitation.id);
                    setIsWithdrawingQuote(false);
                    if (res.success) {
                      setShowWithdrawConfirm(false);
                      setWithdrawCheckUnderstand(false);
                      setWithdrawCheckConfirm(false);
                      showSuccess('Oferta retirada. Puedes enviar una nueva cotización.');
                      dispatchDashboardMetricsRefresh();
                      await onInvitationUpdate?.();
                    } else {
                      showError(res.error || 'No se pudo retirar la oferta');
                    }
                  }}
                  className="flex-1 py-3 bg-error hover:bg-error text-inverse text-[10px] font-black uppercase rounded-2xl transition-all disabled:opacity-40"
                >
                  {isWithdrawingQuote ? 'Retirando…' : 'Retirar oferta'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
