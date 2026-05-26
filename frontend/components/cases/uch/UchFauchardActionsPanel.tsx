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
      className="rounded-xl border border-white/[0.06] bg-[#111b21]/70 px-3 py-3 space-y-3"
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
            <div className="w-full flex flex-col gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] font-black text-white uppercase">Solicitud: {clinicalCase.pendingActionRequest}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void onActionTriggered?.('resolve_flow', { approved: false });
                  }}
                  className="flex-1 py-2 bg-slate-800 text-white text-[9px] font-bold rounded-lg uppercase"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onActionTriggered?.('resolve_flow', { approved: true });
                  }}
                  className="flex-1 py-2 bg-amber-600 text-white text-[9px] font-bold rounded-lg uppercase"
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
              className="flex-1 py-3 bg-emerald-500 text-white text-[10px] font-bold rounded-xl uppercase hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Recepción
            </button>
          )}
          {actingAsTecnico && myInvitation && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="w-full space-y-4">
              {myInvitation.expiresAt && myInvitation.status === 'pending' && caseStatus === 'enEvaluacion' && (
                <motion.div className="bg-slate-800/60 border border-white/8 rounded-xl p-3 space-y-2">
                  <p className="text-[9px] font-black text-amber-500/70 uppercase tracking-widest">
                    Plazo para enviar tu cotización
                  </p>
                  {quoteRemainingMs >= 0 && (
                    <p className="text-lg font-mono font-black tabular-nums text-amber-200">
                      {formatCountdownHMS(quoteRemainingMs)}
                    </p>
                  )}
                  <p className="text-[10px] text-amber-400/90 flex items-center gap-1">
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
                  <div className="space-y-3 bg-slate-900/40 border border-white/5 rounded-2xl p-4">
                    {isIntegral ? (
                      <>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Este caso es <strong className="text-teal-300">integral</strong>: ingresa precio y plazo por separado para diseño y fabricación. El total se calcula automáticamente.
                        </p>

                        <div className="space-y-3 rounded-xl border border-white/5 p-3">
                          <p className="text-[9px] font-black text-teal-400 uppercase tracking-widest">Diseño</p>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Precio diseño (CLP)</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Ej: 30000"
                              value={quoteDesignPrice ? new Intl.NumberFormat('es-CL').format(Number(quoteDesignPrice)) : ''}
                              onChange={(e) => setQuoteDesignPrice?.(e.target.value.replace(/\D/g, ''))}
                              className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Plazo diseño</label>
                            <select
                              value={quoteDesignDays}
                              onChange={(e) => setQuoteDesignDays?.(Number(e.target.value))}
                              className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50"
                            >
                              <option value={0} disabled>Selecciona el plazo</option>
                              {[1, 2, 3, 5, 7, 10].map((d) => (
                                <option key={d} value={d}>{d} {d === 1 ? 'día hábil' : 'días hábiles'}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-xl border border-white/5 p-3">
                          <p className="text-[9px] font-black text-teal-400 uppercase tracking-widest">Fabricación</p>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Precio fabricación (CLP)</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Ej: 50000"
                              value={quoteFabricationPrice ? new Intl.NumberFormat('es-CL').format(Number(quoteFabricationPrice)) : ''}
                              onChange={(e) => setQuoteFabricationPrice?.(e.target.value.replace(/\D/g, ''))}
                              className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Plazo fabricación</label>
                            <select
                              value={quoteFabricationDays}
                              onChange={(e) => setQuoteFabricationDays?.(Number(e.target.value))}
                              className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50"
                            >
                              <option value={0} disabled>Selecciona el plazo</option>
                              {[1, 2, 3, 5, 7, 10, 15].map((d) => (
                                <option key={d} value={d}>{d} {d === 1 ? 'día hábil' : 'días hábiles'}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="rounded-xl bg-teal-500/10 border border-teal-500/30 px-3 py-2 flex justify-between items-center">
                          <span className="text-[10px] font-black text-teal-300 uppercase tracking-widest">Total</span>
                          <span className="text-sm font-black text-teal-200">
                            {fmtCLP(totalSplitPrice)} · {totalSplitDays} {totalSplitDays === 1 ? 'día hábil' : 'días hábiles'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Precio (CLP)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Ej: 45000"
                            value={quotePrice ? new Intl.NumberFormat('es-CL').format(Number(quotePrice)) : ''}
                            onChange={(e) => setQuotePrice(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Plazo de entrega</label>
                          <select
                            value={quoteDays}
                            onChange={(e) => setQuoteDays(Number(e.target.value))}
                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50"
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
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                        Nota (opcional) <span className="font-normal text-slate-500">{quoteNotes.length}/200</span>
                      </label>
                      <textarea
                        maxLength={200}
                        rows={2}
                        placeholder="Comentario opcional para el dentista..."
                        value={quoteNotes}
                        onChange={(e) => setQuoteNotes(e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50 resize-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuoteConfirmChecked(false);
                        setShowQuoteConfirm(true);
                      }}
                      disabled={disabled}
                      className="w-full py-2.5 bg-teal-500 text-white text-[10px] font-black rounded-xl uppercase shadow-lg shadow-teal-500/20 hover:bg-teal-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
                    >
                      {isSubmittingQuote ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Enviar oferta
                    </button>
                  </div>
                );
              })()}
              {canWithdrawQuote && myInvitation.quotedPrice != null && (
                <div className="rounded-xl border border-white/[0.08] bg-slate-900/50 p-3 space-y-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tu oferta enviada</p>
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
                    className="w-full py-2 border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2"
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
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                      {myInvitation.dentistRejectionFeedback?.trim()
                        ? 'Oferta no contratada'
                        : 'Oferta no seleccionada'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
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
                  <div className="bg-teal-500/10 border border-teal-500/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Hammer className="w-4 h-4 text-teal-400 flex-shrink-0" />
                      <span className="text-[10px] font-black text-teal-400 uppercase tracking-widest">El dentista aceptó la propuesta</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
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
                      className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
                    >
                      {isStartingWork ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Hammer className="w-4 h-4" />
                      )}
                      {buttonLabel}
                    </button>
                  </div>
                );
              })()}
              {myInvitation.status === 'expired' && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span className="text-[10px] font-bold text-rose-400">Esta invitación ha vencido.</span>
                </div>
              )}
            </motion.div>
          )}
          {actingAsTecnico && caseStatus === 'enRevision' && (
            <div className="w-full py-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold rounded-xl flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              Esperando revisión del dentista…
            </div>
          )}
          {actingAsTecnico && caseStatus === 'disenoAprobado' && (
            <div className="w-full space-y-2">
              <div className="w-full py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-xl flex items-center justify-center gap-2">
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
                  className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
                >
                  {isStartingManufacturing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
              className="w-full py-3 bg-emerald-500 text-white text-[10px] font-bold rounded-xl uppercase hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" />
              Registrar despacho
            </button>
          )}
          {showDeliveryShortcut && (
            <button
              type="button"
              onClick={onOpenDeliveryInline}
              className="w-full py-2.5 text-[10px] font-semibold text-teal-300/90 hover:text-teal-200 border border-teal-500/20 rounded-xl"
            >
              Ir a entrega de diseño (formulario en el hilo)
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showDispatchForm && actingAsTecnico && caseStatus === 'enFabricacion' && (
          <motion.div
            className="fixed inset-0 z-[310] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-slate-900 border border-emerald-500/30 border-b-0 sm:border-b rounded-t-2xl sm:rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 sm:mx-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="uch-dispatch-form-title"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Package className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 id="uch-dispatch-form-title" className="text-xl font-bold text-white">
                  Registrar despacho
                </h3>
                <p className="text-sm text-slate-400">
                  El dentista verá esta referencia en el hilo del caso para hacer seguimiento del envío.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="uch-dispatch-courier"
                    className="text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Transportista / medio
                  </label>
                  <input
                    id="uch-dispatch-courier"
                    type="text"
                    value={dispatchCourier}
                    onChange={(e) => setDispatchCourier(e.target.value)}
                    placeholder="Ej. Interno, Chilexpress, Starken…"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="uch-dispatch-tracking"
                    className="text-[10px] font-black uppercase tracking-widest text-slate-500"
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
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 outline-none resize-none"
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
                  className="flex-1 py-3 bg-slate-800 text-slate-400 text-[10px] font-black uppercase rounded-2xl hover:bg-slate-700 transition-all disabled:opacity-50"
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
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase rounded-2xl transition-all disabled:opacity-40"
                >
                  {isRegisteringDispatch ? 'Registrando…' : 'Confirmar despacho'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {showWithdrawConfirm && actingAsTecnico && myInvitation && (
          <motion.div
            className="fixed inset-0 z-[310] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-slate-900 border border-rose-500/30 border-b-0 sm:border-b rounded-t-2xl sm:rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 sm:mx-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="uch-withdraw-quote-title"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Undo2 className="w-6 h-6 text-rose-400" />
                </div>
                <h3 id="uch-withdraw-quote-title" className="text-xl font-bold text-white">
                  Retirar oferta
                </h3>
                <p className="text-sm text-slate-400">
                  Esta oferta dejará de participar hasta que envíes una nueva (si el plazo lo permite).
                </p>
              </div>

              <div className="bg-slate-800/50 rounded-2xl p-4">
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
                    className="mt-1 rounded border-slate-600"
                  />
                  <span className="text-xs text-slate-400 leading-relaxed">
                    Entiendo que <strong className="text-white">retiro mi oferta</strong> de este caso y el solicitante dejará de verla en el comparativo.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={withdrawCheckConfirm}
                    onChange={(e) => setWithdrawCheckConfirm(e.target.checked)}
                    className="mt-1 rounded border-slate-600"
                  />
                  <span className="text-xs text-slate-400 leading-relaxed">
                    <strong className="text-white">Confirmo</strong> que deseo retirar esta oferta y podré cotizar de nuevo mientras no venza el plazo de invitación.
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
                  className="flex-1 py-3 bg-slate-800 text-slate-400 text-[10px] font-black uppercase rounded-2xl hover:bg-slate-700 transition-all disabled:opacity-50"
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
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase rounded-2xl transition-all disabled:opacity-40"
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
