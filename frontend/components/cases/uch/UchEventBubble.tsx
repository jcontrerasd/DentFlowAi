'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import {
  Activity, AlertCircle, CheckCircle2, Download, FileText, Hammer, Send, Sparkles, Undo2, User, XCircle,
} from 'lucide-react';
import { resolveUchThreadLane } from '@/lib/uchThreadLane';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { shouldUseUchNeutralSystemPill } from '@/lib/constants/uchEmitterMatrix';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';
import { quoteDisplayFromPayload } from '@/lib/uchQuoteDisplay';
import type { UchCaseEventLite } from './uchTimelineTypes';
import type { UchQuoteBreakdownTone } from '@/components/cases/uch/UchQuoteBreakdown';

function EventOfferQuoteDetail({
  raw,
  tone,
  showCostLabels = false,
  commentLabel,
  emptyComment,
}: {
  raw: Record<string, unknown>;
  tone: UchQuoteBreakdownTone;
  showCostLabels?: boolean;
  commentLabel: string;
  emptyComment: string;
}) {
  const quote = quoteDisplayFromPayload(raw);
  const tn = raw.techNotes;
  const techNotes = typeof tn === 'string' ? tn.trim() : '';
  const detailBorder = tone === 'self' ? 'border-cyan-800/40' : 'border-white/[0.06]';
  const labelMuted = tone === 'self' ? 'text-cyan-100/75' : 'text-slate-500';
  const valueText = tone === 'self' ? 'text-cyan-50/95' : 'text-slate-300/95';

  return (
    <div className={`space-y-2 pt-1 border-t ${detailBorder}`}>
      <UchQuoteBreakdown
        quote={quote}
        variant="detail"
        tone={tone}
        showCostLabels={showCostLabels}
      />
      <div className="space-y-0.5">
        <p className={`text-[10px] font-medium ${labelMuted}`}>{commentLabel}</p>
        {techNotes ? (
          <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${valueText}`}>{techNotes}</p>
        ) : (
          <p className={`text-[11px] italic ${tone === 'self' ? 'text-cyan-200/70' : 'text-slate-500/80'}`}>
            {emptyComment}
          </p>
        )}
      </div>
    </div>
  );
}

type UchEventBubbleProps = {
  event: UchCaseEventLite;
  currentUser: { id?: string } | null | undefined;
  actingAsDentista: boolean;
  /** Permite reglas de carril “propio” simétricas al dentista (comparativo / cierres solo técnico). */
  actingAsTecnico?: boolean;
  viewingAsAdmin?: boolean;
  uchPresentationRole?: 'dentista' | 'tecnico';
  revisionVersionMap: Map<string, number>;
  formatActivityTimestamp: (createdAt: string | Date) => string;
  /** Descarga ZIP de la entrega asociada al evento REVISION_ENVIADA (misma lógica que el hub). */
  onDownloadRevisionZip?: (zipKey: string, versionLabel: string, files: string[]) => void | Promise<void>;
  downloadingRevisionZipId?: string | null;
};

export default function UchEventBubble({
  event,
  currentUser,
  actingAsDentista,
  actingAsTecnico = false,
  viewingAsAdmin = false,
  uchPresentationRole,
  revisionVersionMap,
  formatActivityTimestamp,
  onDownloadRevisionZip,
  downloadingRevisionZipId,
}: UchEventBubbleProps) {
  const payloadVisibleTo = (event.payload as Record<string, unknown> | undefined)?.visibleTo;
  const { lane, showAsFauchard } = resolveUchThreadLane(event, {
    actingAsDentista,
    actingAsTecnico,
    viewingAsAdmin,
    currentUserId: currentUser?.id,
    uchPresentationRole,
  });
  const isSelfLane = lane === 'self';
  /** Bloque de detalle snapshot en cierres comparativa solo técnico (independiente del carril hilo/propio). */
  const isTechComparativeOutcomeDetail =
    !viewingAsAdmin &&
    actingAsTecnico &&
    payloadVisibleTo === 'tecnico' &&
    (event.action === CASE_EVENTS.OFERTA_RECHAZADA ||
      event.action === CASE_EVENTS.OFERTA_NO_SELECCIONADA);

  const isOutcomeNotice =
    event.action === 'OFERTA_NO_SELECCIONADA' ||
    event.action === 'OFERTA_RECHAZADA';

  /** Píldora gris solo para ruido interno allowlist (ver `UCH_NEUTRAL_SYSTEM_PILL_ALLOWLIST`). */
  const isNeutralSystemPill =
    lane === 'thread' &&
    !showAsFauchard &&
    shouldUseUchNeutralSystemPill({
      eventType: event.type,
      eventAction: event.action,
      isOutcomeNotice,
    });

  const isInvitationReceivedQuote = event.action === CASE_EVENTS.INVITACION_RECIBIDA;

  const isRightLane = isSelfLane;
  const showHeaderAsYou = isSelfLane && !showAsFauchard;

  const showFauchardSystemTimestamp = isNeutralSystemPill;
  const showAvatarHeader = !isNeutralSystemPill;

  const bubbleFauchardBase =
    'bg-[#2a3942] border border-amber-500/20 text-[#e9edef] px-3 py-2 rounded-2xl rounded-tl-sm';
  /** Carril propio del viewer (incl. voz Fauchard enmascarada): distinto del verde legacy. */
  const bubbleSelfBase =
    'bg-[#0d3d42] border border-cyan-500/30 text-[#e9edef] px-3 py-2 rounded-2xl rounded-tr-sm shadow-sm';

  let bubbleShell: string;
  if (isNeutralSystemPill) {
    bubbleShell =
      'bg-[#2a3942]/90 border border-amber-500/15 text-slate-300/95 text-[10px] py-1.5 px-3 rounded-full self-start max-w-[min(100%,24rem)]';
  } else if (isOutcomeNotice) {
    bubbleShell = isSelfLane
      ? `${bubbleSelfBase} max-w-[min(100%,24rem)] shadow-sm`
      : `${bubbleFauchardBase} max-w-[min(100%,24rem)] shadow-sm`;
  } else if (isSelfLane) {
    bubbleShell = bubbleSelfBase;
  } else {
    bubbleShell = bubbleFauchardBase;
  }

  return (
    <motion.div
      key={event.id}
      data-testid={`uch-activity-event-${event.id}`}
      data-uch-lane={isRightLane ? 'self' : 'thread'}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex flex-col w-full ${isRightLane ? 'items-end' : 'items-start'}${isInvitationReceivedQuote ? ' pl-4' : ''}`}
    >
      {showFauchardSystemTimestamp && (
        <span className="text-[10px] text-slate-500 mb-1 tabular-nums self-start">
          {formatActivityTimestamp(event.createdAt)}
        </span>
      )}
      {showAvatarHeader && (
        <div
          className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mb-1 max-w-[78%] ${
            isRightLane ? 'flex-row-reverse justify-end' : ''
          }`}
        >
          <div className="w-5 h-5 rounded-full bg-slate-800 border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
            {showAsFauchard ? (
              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
            ) : event.user?.image && (event.user.image.startsWith('http') || event.user.image.startsWith('/')) ? (
              <Image src={event.user.image} alt="" width={20} height={20} className="w-full h-full object-cover" unoptimized={event.user.image.startsWith('http')} />
            ) : (
              <User className="w-2.5 h-2.5 text-slate-500" />
            )}
          </div>
          <span className="text-[10px] font-semibold text-slate-500">
            {showHeaderAsYou ? 'Yo' : showAsFauchard ? 'Fauchard' : (event.user?.fullName || 'Usuario')}
          </span>
          <span className="text-[10px] text-slate-600 tabular-nums">
            {formatActivityTimestamp(event.createdAt)}
          </span>
        </div>
      )}

      <div className={`relative max-w-[78%] transition-all ${bubbleShell}`}>
        <div className="space-y-2">
          <>
            {!['TRABAJO_INICIADO', 'REVISION_ENVIADA', 'REVISION_SOLICITADA', 'TRABAJO_APROBADO', 'COMENTARIO_TECNICO', CASE_EVENTS.OFERTA_ENVIADA, CASE_EVENTS.OFERTA_RETIRADA].includes(event.action) &&
              !isOutcomeNotice &&
              event.content && (
              <p className="text-xs leading-relaxed whitespace-pre-wrap">{event.content}</p>
            )}
          </>

          {isOutcomeNotice && event.content?.trim() && (
            <div className="space-y-1.5">
              <div
                className={`flex items-center gap-2 ${
                  isSelfLane ? 'text-cyan-100/90' : 'text-slate-400'
                }`}
              >
                <XCircle
                  className={`w-3.5 h-3.5 flex-shrink-0 ${isSelfLane ? 'text-cyan-200/80' : 'text-rose-400/55'}`}
                />
                <span className="text-[11px] font-semibold tracking-tight">
                  {event.action === CASE_EVENTS.OFERTA_RECHAZADA && actingAsDentista
                    ? 'Oferta rechazada'
                    : event.action === CASE_EVENTS.OFERTA_NO_SELECCIONADA && actingAsDentista && payloadVisibleTo === 'dentista'
                      ? 'Oferta no seleccionada'
                      : 'Otra oferta fue elegida'}
                </span>
              </div>
              <p
                className={`text-[11px] leading-relaxed whitespace-pre-wrap pl-5 ${
                  isSelfLane ? 'text-cyan-50/95' : 'text-slate-400/95'
                }`}
              >
                {event.content}
              </p>
              {((event.action === CASE_EVENTS.OFERTA_RECHAZADA && actingAsDentista) ||
                (event.action === CASE_EVENTS.OFERTA_NO_SELECCIONADA &&
                  actingAsDentista &&
                  payloadVisibleTo === 'dentista')) &&
                (() => {
                  const raw =
                    event.payload && typeof event.payload === 'object'
                      ? (event.payload as Record<string, unknown>)
                      : {};
                  return (
                    <div className="pl-5 pt-1.5 mt-1">
                      <EventOfferQuoteDetail
                        raw={raw}
                        tone={isSelfLane ? 'self' : 'thread'}
                        showCostLabels
                        commentLabel="Comentario del oferente"
                        emptyComment="Sin comentario del oferente."
                      />
                    </div>
                  );
                })()}
              {(() => {
                if (event.action !== 'OFERTA_RECHAZADA' || actingAsDentista) return null;
                const raw = (event.payload as { feedbackDentista?: unknown } | null)?.feedbackDentista;
                const fb = typeof raw === 'string' ? raw.trim() : '';
                if (!fb) return null;
                const detailBorder = isSelfLane ? 'border-cyan-800/40' : 'border-white/[0.06]';
                const labelMuted = isSelfLane ? 'text-cyan-100/75' : 'text-slate-500';
                const valueText = isSelfLane ? 'text-cyan-50/95' : 'text-slate-300/95';
                return (
                  <div className={`pl-5 pt-1.5 mt-1 space-y-0.5 border-t ${detailBorder}`}>
                    <p className={`text-[10px] font-medium ${labelMuted}`}>Comentario del solicitante</p>
                    <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${valueText}`}>{fb}</p>
                  </div>
                );
              })()}
              {event.action === CASE_EVENTS.OFERTA_NO_SELECCIONADA &&
                actingAsTecnico &&
                isTechComparativeOutcomeDetail &&
                (() => {
                  const raw =
                    event.payload && typeof event.payload === 'object'
                      ? (event.payload as Record<string, unknown>)
                      : {};
                  const q = quoteDisplayFromPayload(raw);
                  if (q.totalPrice == null && q.totalDays == null && !q.techNotes) return null;
                  return (
                    <div className="pl-5 pt-1.5 mt-1">
                      <EventOfferQuoteDetail
                        raw={raw}
                        tone={isSelfLane ? 'self' : 'thread'}
                        showCostLabels
                        commentLabel="Tu comentario en la oferta"
                        emptyComment="Sin comentario en la oferta."
                      />
                    </div>
                  );
                })()}
            </div>
          )}

          {event.action === CASE_EVENTS.OFERTA_ENVIADA && (
            <div className={`space-y-1.5 ${isSelfLane ? 'text-cyan-100' : 'text-teal-100/95'}`}>
              <div className="flex items-center gap-2">
                <Send className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-[11px] font-bold">Cotización enviada</span>
              </div>
              {event.content?.trim() ? (
                <p
                  className={`text-[11px] leading-relaxed whitespace-pre-wrap ${
                    isSelfLane ? 'text-cyan-50/95' : 'text-slate-200/95'
                  }`}
                >
                  {event.content}
                </p>
              ) : null}
              <EventOfferQuoteDetail
                raw={
                  event.payload && typeof event.payload === 'object'
                    ? (event.payload as Record<string, unknown>)
                    : {}
                }
                tone={isSelfLane ? 'self' : 'thread'}
                showCostLabels={actingAsDentista}
                commentLabel={
                  actingAsDentista ? 'Comentario del oferente' : 'Comentario para el solicitante'
                }
                emptyComment={
                  actingAsDentista ? 'Sin comentario del oferente.' : 'Sin comentario en la oferta.'
                }
              />
            </div>
          )}

          {event.action === CASE_EVENTS.OFERTA_RETIRADA && (
            <div className={`space-y-1.5 ${isSelfLane ? 'text-cyan-100' : 'text-rose-100/95'}`}>
              <div className="flex items-center gap-2">
                <Undo2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-[11px] font-bold">Oferta retirada</span>
              </div>
              {event.content?.trim() ? (
                <p
                  className={`text-[11px] leading-relaxed whitespace-pre-wrap ${
                    isSelfLane ? 'text-cyan-50/95' : 'text-slate-200/95'
                  }`}
                >
                  {event.content}
                </p>
              ) : null}
              <EventOfferQuoteDetail
                raw={
                  event.payload && typeof event.payload === 'object'
                    ? (event.payload as Record<string, unknown>)
                    : {}
                }
                tone={isSelfLane ? 'self' : 'thread'}
                commentLabel="Comentario que tenía la oferta"
                emptyComment="Sin comentario en la oferta."
              />
            </div>
          )}

          {(() => {
            const files = (event.payload as { files?: string[] } | null)?.files;
            if (!Array.isArray(files) || files.length === 0 || event.action === 'REVISION_ENVIADA') return null;
            return (
              <p
                className={`text-[10px] flex items-center gap-1.5 mt-1 ${
                  isSelfLane ? 'text-cyan-100/75' : 'text-slate-400'
                }`}
              >
                <Download className="w-3 h-3 opacity-80" />
                {files.length} archivo{files.length !== 1 ? 's' : ''} adjunto{files.length !== 1 ? 's' : ''}
              </p>
            );
          })()}

          {event.action === 'COMENTARIO_TECNICO' && (
            <div className="space-y-1">
              <p className={`text-[10px] font-medium ${isSelfLane ? 'text-cyan-100/75' : 'text-slate-400'}`}>
                Comentario del técnico
              </p>
              {event.content?.trim() ? (
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{event.content}</p>
              ) : (
                <p className="text-[10px] text-slate-500 italic">Sin texto.</p>
              )}
            </div>
          )}

          {event.action === 'TRABAJO_INICIADO' && (
            <div className={`space-y-1.5 ${isSelfLane ? 'text-cyan-100' : 'text-amber-100/95'}`}>
              <div className="flex items-center gap-2">
                <Hammer className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-[11px] font-bold">{actingAsDentista ? 'Laboratorio en ejecución' : 'Diseño iniciado'}</span>
              </div>
              {event.content && (
                <p
                  className={`text-[11px] leading-relaxed whitespace-pre-wrap pl-5 ${
                    isSelfLane ? 'text-[#e9edef]/95' : 'text-slate-200/95'
                  }`}
                >
                  {event.content}
                </p>
              )}
            </div>
          )}
          {event.action === 'REVISION_ENVIADA' && (() => {
            const payload = (event.payload ?? {}) as { deliveryVersion?: number; files?: string[] };
            const deliveryVersion =
              payload.deliveryVersion ?? revisionVersionMap.get(event.id) ?? 1;
            const files = Array.isArray(payload.files) ? payload.files.filter(Boolean) : [];
            const zipKey = `rev-${event.id}`;
            const canDownload = !!onDownloadRevisionZip && files.length > 0;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-teal-300">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-[11px] font-bold">Entrega v{deliveryVersion} enviada a revisión</span>
                </div>
                {event.content?.trim() ? (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-medium text-slate-500">Comentario con la entrega</p>
                    <p className="text-[11px] text-[#e9edef]/95 leading-relaxed whitespace-pre-wrap">{event.content}</p>
                  </div>
                ) : null}
                {canDownload ? (
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t ${
                      isSelfLane ? 'border-cyan-800/45' : 'border-white/[0.08]'
                    }`}
                  >
                    <span className={`text-[10px] ${isSelfLane ? 'text-cyan-100/85' : 'text-slate-400'}`}>
                      v{deliveryVersion} · {files.length} archivo{files.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => void onDownloadRevisionZip(zipKey, `v${deliveryVersion}`, files)}
                      disabled={downloadingRevisionZipId === zipKey}
                      className={`text-[11px] font-medium whitespace-nowrap disabled:opacity-40 inline-flex items-center gap-1 shrink-0 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-400/40 rounded-sm ${
                        isSelfLane
                          ? 'text-cyan-200/95 hover:text-cyan-100'
                          : 'text-teal-400/90 hover:text-teal-300'
                      }`}
                    >
                      {downloadingRevisionZipId === zipKey ? (
                        <Activity className="w-3 h-3 animate-spin" aria-hidden />
                      ) : (
                        <Download className="w-3 h-3" aria-hidden />
                      )}
                      Descargar v{deliveryVersion} (ZIP)
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })()}
          {event.action === 'REVISION_SOLICITADA' && (() => {
            const payload = (event.payload ?? {}) as Record<string, unknown>;
            const adjustmentText = [event.content, payload.comentarioDelSolicitante, payload.reason]
              .map((t) => (typeof t === 'string' ? t.trim() : ''))
              .find((t) => t.length > 0) ?? '';
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-[11px] font-bold">Ajustes solicitados</span>
                </div>
                <p className="text-[10px] font-medium text-slate-500">Detalle del ajuste</p>
                {adjustmentText ? (
                  <p className="text-xs text-[#e9edef]/95 leading-relaxed whitespace-pre-wrap">{adjustmentText}</p>
                ) : (
                  <p className="text-[10px] text-slate-500 italic">Sin descripción de ajuste.</p>
                )}
              </div>
            );
          })()}
          {event.action === 'TRABAJO_APROBADO' && (() => {
            const raw = event.content?.trim() ?? '';
            const marker = '\n\nComentario:\n';
            const splitIdx = raw.indexOf(marker);
            const intro =
              splitIdx >= 0 ? raw.slice(0, splitIdx).trim() : raw;
            const fromMarker =
              splitIdx >= 0 ? raw.slice(splitIdx + marker.length).trim() : '';
            const payload = (event.payload ?? {}) as Record<string, unknown>;
            const payloadComment =
              typeof payload.dentistApprovalComment === 'string'
                ? payload.dentistApprovalComment.trim()
                : '';
            const commentBody = fromMarker || payloadComment;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-[11px] font-bold">Diseño aprobado</span>
                </div>
                {intro ? (
                  <p className="text-[11px] leading-relaxed whitespace-pre-wrap pl-5 text-slate-200/95">{intro}</p>
                ) : null}
                {commentBody ? (
                  <div className="pl-5 space-y-0.5">
                    <p className="text-[10px] font-medium text-slate-500">
                      {actingAsDentista && isSelfLane ? 'Tu comentario' : 'Comentario del solicitante'}
                    </p>
                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-200/95">{commentBody}</p>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </div>
      </div>
    </motion.div>
  );
}
