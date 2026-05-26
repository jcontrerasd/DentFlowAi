'use client';

import { useState, useMemo } from 'react';
import { useDeadlineMs, useRemainingMsUntil } from '@/lib/hooks/useRemainingUntil';
import type { ServerClockAnchor } from '@/lib/deadlineMs';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { acceptProposalAction, rejectInvitationOfferAction } from '@/lib/db/actions/proposal';
import { useToast } from '@/context/ToastContext';
import FocusTrap from '@/components/ui/FocusTrap';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';
import { quoteDisplayFromComparativeOffer } from '@/lib/uchQuoteDisplay';
import { dispatchDashboardMetricsRefresh } from '@/lib/dashboard/dashboardRefresh';

export type ComparativeOfferRow = {
  invitationId: string;
  rank: number;
  totalPriceCLP: number;
  quotedDays: number;
  techNotes: string | null;
  respondedAt: Date | string | null;
  /** Desglose integral (Fase 4.4); nullable cuando no aplica. */
  designPriceCLP?: number | null;
  designDays?: number | null;
  fabricationPriceCLP?: number | null;
  fabricationDays?: number | null;
};

interface ComparativeOffersPanelProps {
  caseId: string;
  caseNumber?: string;
  offers: ComparativeOfferRow[];
  /** Preferir ms fijados desde la página de detalle (una sola fuente). */
  proposalDeadlineMs?: number | null;
  proposalExpiresAt?: string | Date | null;
  serverClockAnchor?: ServerClockAnchor | null;
  onUpdated: () => Promise<void>;
}

export default function ComparativeOffersPanel({
  caseId,
  caseNumber,
  offers,
  proposalDeadlineMs: proposalDeadlineMsProp,
  proposalExpiresAt,
  serverClockAnchor,
  onUpdated,
}: ComparativeOffersPanelProps) {
  const { showSuccess, showError } = useToast();
  const parsedFromIso = useDeadlineMs(proposalExpiresAt ?? null);
  const deadlineMs = useMemo(() => {
    if (
      proposalDeadlineMsProp != null &&
      Number.isFinite(proposalDeadlineMsProp) &&
      proposalDeadlineMsProp > 0
    ) {
      return proposalDeadlineMsProp;
    }
    return parsedFromIso;
  }, [proposalDeadlineMsProp, parsedFromIso]);

  // Solo se usa para bloquear acciones cuando el plazo venció; el reloj visible vive en la
  // cabecera del Centro de control para no duplicarlo dentro del contenido.
  const remaining = useRemainingMsUntil(deadlineMs, serverClockAnchor);
  const invalidDeadline = deadlineMs == null;
  const isExpired = !invalidDeadline && remaining === 0;
  const blockActions = invalidDeadline || isExpired;
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<ComparativeOfferRow | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [acceptFor, setAcceptFor] = useState<ComparativeOfferRow | null>(null);
  const [acceptChecked, setAcceptChecked] = useState(false);

  const handleAccept = async () => {
    if (!acceptFor) return;
    setLoadingId(acceptFor.invitationId);
    const res = await acceptProposalAction(caseId, acceptFor.invitationId);
    setLoadingId(null);
    if (res.success) {
      showSuccess('Oferta aceptada. El laboratorio confirmará el inicio del trabajo.');
      setAcceptFor(null);
      setAcceptChecked(false);
      dispatchDashboardMetricsRefresh();
      await onUpdated();
    } else {
      showError(res.error || 'No se pudo aceptar la oferta');
    }
  };

  const handleReject = async () => {
    if (!rejectFor) return;
    const fb = rejectFeedback.trim();
    if (fb.length < 3) {
      showError('Escribe un comentario para el laboratorio (mín. 3 caracteres).');
      return;
    }
    setLoadingId(rejectFor.invitationId);
    const res = await rejectInvitationOfferAction(caseId, rejectFor.invitationId, fb);
    setLoadingId(null);
    if (res.success) {
      showSuccess(
        res.success && 'closedCase' in res && res.closedCase
          ? 'Rechazaste la última oferta. El caso quedó cerrado.'
          : 'Oferta rechazada.',
      );
      setRejectFor(null);
      setRejectFeedback('');
      dispatchDashboardMetricsRefresh();
      await onUpdated();
    } else {
      showError(res.error || 'No se pudo rechazar la oferta');
    }
  };

  return (
    <>
      <div className="w-full space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Comparativo de ofertas</p>
            {caseNumber && <p className="text-xs text-slate-500">{caseNumber}</p>}
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Las ofertas aparecen ordenadas por mejor precio, plazo y orden de llegada. 
        </p>

        {invalidDeadline ? (
          <p className="text-center text-amber-400 text-xs font-bold">No se pudo leer el plazo de decisión.</p>
        ) : isExpired ? (
          <p className="text-center text-rose-400 text-xs font-bold">La ventana de decisión ha vencido.</p>
        ) : null}

        <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
          {!blockActions && offers.length === 0 ? (
            <p className="text-center text-slate-500 text-[11px] py-6 font-medium">
              Cargando comparativa…
            </p>
          ) : null}
          {offers.map((o) => (
            <motion.div
              key={o.invitationId}
              layout
              className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 flex flex-col gap-3 hover:bg-white/5 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-teal-500 uppercase tracking-widest">
                  Oferta #{o.rank}
                </span>
                <span className="text-[9px] text-slate-500">
                  {(o.respondedAt && new Date(o.respondedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })) ||
                    ''}
                </span>
              </div>
              <UchQuoteBreakdown
                quote={quoteDisplayFromComparativeOffer(o)}
                variant="compact"
                tone="neutral"
              />
              {o.techNotes ? (
                <p className="text-[11px] text-slate-400 italic border-t border-white/5 pt-2">"{o.techNotes}"</p>
              ) : null}

              {!blockActions && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectFeedback('');
                      setRejectFor(o);
                    }}
                    disabled={loadingId === o.invitationId}
                    className="flex-1 py-2 text-[10px] font-black uppercase rounded-xl bg-slate-800 border border-white/10 text-slate-400 hover:border-rose-500/40 hover:text-rose-400 transition-all disabled:opacity-40"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAcceptChecked(false);
                      setAcceptFor(o);
                    }}
                    disabled={loadingId === o.invitationId}
                    className="flex-[2] py-2 text-[10px] font-black uppercase rounded-xl bg-teal-600 text-white hover:bg-teal-500 shadow-lg shadow-teal-900/20 flex items-center justify-center gap-1.5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Elegir oferta
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Modal rechazo — feedback obligatorio */}
      <AnimatePresence>
        {rejectFor && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <FocusTrap onEscape={() => !loadingId && setRejectFor(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="bg-slate-900 border border-rose-500/30 rounded-[2rem] p-8 max-w-md w-full shadow-2xl space-y-4"
              >
                <div className="flex items-center gap-3">
                  <XCircle className="w-7 h-7 text-rose-400" />
                  <h3 className="text-lg font-bold text-white">Rechazar oferta #{rejectFor.rank}</h3>
                </div>
                <p className="text-xs text-slate-500">
                  Este comentario es <strong className="text-white">obligatorio</strong> y lo verá únicamente el laboratorio correspondiente.
                </p>
                <textarea
                  value={rejectFeedback}
                  onChange={(e) => setRejectFeedback(e.target.value.slice(0, 500))}
                  placeholder="Explica por qué no contratas esta oferta…"
                  className="w-full min-h-[100px] bg-slate-800 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:border-rose-500/40 outline-none resize-none"
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={!!loadingId}
                    onClick={() => setRejectFor(null)}
                    className="flex-1 py-3 bg-slate-800 rounded-xl text-[10px] font-black uppercase text-slate-400"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!!loadingId || rejectFeedback.trim().length < 3}
                    onClick={handleReject}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl text-[10px] font-black uppercase text-white disabled:opacity-40"
                  >
                    Confirmar rechazo
                  </button>
                </div>
              </motion.div>
            </FocusTrap>
          </div>
        )}
      </AnimatePresence>

      {/* Modal aceptación */}
      <AnimatePresence>
        {acceptFor && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <FocusTrap onEscape={() => !loadingId && setAcceptFor(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="bg-slate-900 border border-teal-500/30 rounded-[2rem] p-8 max-w-md w-full shadow-2xl space-y-4"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-7 h-7 text-teal-400" />
                  <h3 className="text-lg font-bold text-white">Contratar oferta #{acceptFor.rank}</h3>
                </div>
                <motion.div
                  className="bg-slate-800/50 rounded-2xl p-4 space-y-3"
                  data-testid="uch-accept-offer-quote"
                >
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Detalle de costos y plazos
                  </p>
                  <UchQuoteBreakdown
                    quote={quoteDisplayFromComparativeOffer(acceptFor)}
                    variant="detail"
                    tone="neutral"
                    showCostLabels
                  />
                </motion.div>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => setAcceptChecked((v) => !v)}
                    className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center ${acceptChecked ? 'bg-teal-500 border-teal-500' : 'border-slate-600'}`}
                  >
                    {acceptChecked && <CheckCircle className="w-3 h-3 text-slate-950" />}
                  </button>
                  <span className="text-xs text-slate-400">
                    Entiendo que esta acción Contrata el Servicio a DentFlowAi.
                  </span>
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={!!loadingId}
                    onClick={() => setAcceptFor(null)}
                    className="flex-1 py-3 bg-slate-800 rounded-xl text-[10px] font-black uppercase text-slate-400"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!acceptChecked || !!loadingId}
                    onClick={handleAccept}
                    className="flex-[2] py-3 bg-teal-600 hover:bg-teal-500 rounded-xl text-[10px] font-black uppercase text-white disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {loadingId ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Confirmar
                  </button>
                </div>
              </motion.div>
            </FocusTrap>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
