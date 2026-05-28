'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, AlertCircle, Clock, X, Send, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSignedUrlAction } from '@/lib/db/actions/cases';
import { submitQuoteAction } from '@/lib/db/actions/fauchard';
import { dispatchDashboardMetricsRefresh } from '@/lib/dashboard/dashboardRefresh';
import { useToast } from '@/context/ToastContext';
import type { InvitationItem } from '@/lib/db/actions/invitations';
import { normalizedAssignedTechnicianId } from '@/lib/caseViewUtils';
import { creationInstructionsText, latestRejectedDeliveryReviewComment } from '@/lib/cases/instructions';
import { tecnicoSeesVisibleToTecnicoEvent } from '@/lib/uchEventVisibility';
import UchDealSummary from '@/components/cases/uch/UchDealSummary';
import { buildUchTimelineRows, primaryUchActionId } from '@/components/cases/uch/buildUchTimelineRows';
import { computeIncludeCaseActionTimeline } from '@/components/cases/uch/uchHubActionVisibility';
import type { UchActionRowId, UchCaseEventLite } from '@/components/cases/uch/uchTimelineTypes';
import UchEventBubble from '@/components/cases/uch/UchEventBubble';
import UchDeliveryPanel, { newDeliveryEntry } from '@/components/cases/uch/UchDeliveryPanel';
import type { DeliveryFileEntry } from '@/components/cases/uch/UchDeliveryPanel';
import UchDentistReviewPanel from '@/components/cases/uch/UchDentistReviewPanel';
import UchFauchardActionsPanel from '@/components/cases/uch/UchFauchardActionsPanel';
import type { ServerClockAnchor } from '@/lib/deadlineMs';
import { useRemainingMsUntil, formatCountdownHMS } from '@/lib/hooks/useRemainingUntil';
import { splitCasoPublicadoForDentista } from '@/lib/uchCasoPublicadoSplit';
import { maybeGzipForUpload } from '@/lib/uploadCompression';

function uchDeadlineDepMs(value: string | Date | null | undefined): number {
  if (value == null || value === undefined) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

interface CaseEvent {
  id: string;
  /** Autor real del evento (persiste aunque user esté enmascarado como Fauchard en el feed). */
  userId?: string;
  type: 'negociacion' | 'tecnico' | 'sistema';
  action: string;
  content: string;
  payload: any;
  stateChange: any;
  createdAt: string | Date;
  user?: {
    id: string;
    fullName: string;
    role: string;
    image?: string;
  };
}

interface UnifiedCaseHubProps {
  caseId: string;
  initialEvents: CaseEvent[];
  /** Si hay más filas en BD anteriores al evento más antiguo cargado. */
  uchHasMoreOlder?: boolean;
  /** Carga una página anterior de eventos (cursor = id del evento más antiguo actual). */
  onLoadOlderUchEvents?: (beforeEventId: string) => Promise<void>;
  currentUser: any;
  actingAsDentista: boolean;
  actingAsTecnico: boolean;
  /** Admin sin simulación: supervisión (estado real, sin paneles de acción del flujo). */
  viewingAsAdmin?: boolean;
  /** Qué tabla UCH aplicar cuando hace falta forzar dentista vs técnico. */
  uchPresentationRole?: 'dentista' | 'tecnico';
  onClose: () => void;
  onActionTriggered?: (action: string, data?: any) => Promise<any>;
  caseStatus: string;
  clinicalCase: any;
  myInvitation?: InvitationItem | null;
  onInvitationUpdate?: () => Promise<void>;
  /** Técnico perdedor o invitación rechazada: hilo y resumen solo su participación. */
  techOfferRejectedView?: boolean;
  proposalDeadlineMs?: number | null;
  serverClockAnchor?: ServerClockAnchor | null;
}

/** Actividad (chat): más reciente arriba; `id` desempata si `createdAt` coincide. */
function compareCaseEventsNewestFirst(a: CaseEvent, b: CaseEvent): number {
  const tb = new Date(b.createdAt).getTime();
  const ta = new Date(a.createdAt).getTime();
  if (tb !== ta) return tb - ta;
  return b.id.localeCompare(a.id);
}

export default function UnifiedCaseHub({
  caseId,
  initialEvents,
  uchHasMoreOlder = false,
  onLoadOlderUchEvents,
  currentUser,
  actingAsDentista,
  actingAsTecnico,
  viewingAsAdmin = false,
  uchPresentationRole,
  caseStatus,
  clinicalCase,
  myInvitation,
  onInvitationUpdate,
  onClose,
  onActionTriggered,
  techOfferRejectedView = false,
  proposalDeadlineMs,
  serverClockAnchor,
}: UnifiedCaseHubProps) {
  const { showSuccess, showError } = useToast();
  const [events, setEvents] = useState<CaseEvent[]>(initialEvents);
  const [loadingOlderUch, setLoadingOlderUch] = useState(false);

  /**
   * Cuenta regresiva única del UCH: solo aparece para el dentista cuando hay propuesta lista.
   * La fuente (deadline + ancla servidor) viene de la ficha; aquí solo se renderiza.
   */
  const headerCountdownDeadlineMs =
    (actingAsDentista || viewingAsAdmin) && caseStatus === 'propuestaLista'
      ? proposalDeadlineMs ?? null
      : null;
  const headerCountdownRemainingMs = useRemainingMsUntil(headerCountdownDeadlineMs, serverClockAnchor);
  const showHeaderCountdown = headerCountdownDeadlineMs != null && headerCountdownRemainingMs >= 0;

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Para técnico: filtra eventos propios + sistema. Para dentista: todos.
  const selectedTechnicianId = actingAsTecnico ? currentUser?.id : null;

  const resolveReadableFileUrl = async (f: string): Promise<string | null> => {
    if (f.startsWith('https://') || f.startsWith('http://')) return f;
    try {
      return await getSignedUrlAction(f);
    } catch {
      return null;
    }
  };

  const handleDownloadAll = async (eventId: string, versionLabel: string, files: string[]) => {
    if (!files || files.length === 0) return;
    setDownloadingVersionId(eventId);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const url = await resolveReadableFileUrl(f);
        if (url) {
          const response = await fetch(url);
          const blob = await response.blob();
          const baseName = (() => {
            if (f.startsWith('http://') || f.startsWith('https://')) {
              try {
                return decodeURIComponent(new URL(f).pathname.split('/').pop() || `archivo_${i + 1}`);
              } catch {
                return `archivo_${i + 1}`;
              }
            }
            return f.split('/').pop() || `archivo_${i + 1}`;
          })();
          zip.file(`${String(i + 1).padStart(2, '0')}_${baseName}`, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${format(new Date(), 'yyyyMMdd_HHmmss')}_${versionLabel}_${clinicalCase?.caseNumber || 'CASE'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Error downloading files:', err);
    } finally {
      setDownloadingVersionId(null);
    }
  };

  // Estados del formulario de cotización (técnico invitado)
  type PhaseTab = 'todos' | 'propuesta' | 'diseno' | 'produccion';
  const [phaseTab, setPhaseTab] = useState<PhaseTab>('todos');

  useEffect(() => {
    if (techOfferRejectedView) setPhaseTab('todos');
  }, [techOfferRejectedView]);

  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryFiles, setDeliveryFiles] = useState<DeliveryFileEntry[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isSendingDelivery, setIsSendingDelivery] = useState(false);
  const [fileProgress, setFileProgress] = useState<Record<number, number>>({});
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [quotePrice, setQuotePrice] = useState('');
  const [quoteDays, setQuoteDays] = useState(0);
  const [quoteFlatUnit, setQuoteFlatUnit] = useState<'dias' | 'horas'>('dias');
  const [quoteNotes, setQuoteNotes] = useState('');
  // Desglose integral (Fase 4): solo se usan cuando serviceType === 'integral'.
  // Para todos los demás tipos se ignoran y se envía la firma flat tradicional.
  const [quoteDesignPrice, setQuoteDesignPrice] = useState('');
  const [quoteDesignDays, setQuoteDesignDays] = useState(0);
  const [quoteDesignUnit, setQuoteDesignUnit] = useState<'dias' | 'horas'>('dias');
  const [quoteFabricationPrice, setQuoteFabricationPrice] = useState('');
  const [quoteFabricationDays, setQuoteFabricationDays] = useState(0);
  const [quoteFabricationUnit, setQuoteFabricationUnit] = useState<'dias' | 'horas'>('dias');
  // Flete (v4.4): aplica a casos con fabricación. Acepta 0.
  const [quoteShippingPrice, setQuoteShippingPrice] = useState('');
  const [quoteShippingDays, setQuoteShippingDays] = useState(0);
  const [quoteShippingUnit, setQuoteShippingUnit] = useState<'dias' | 'horas'>('dias');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  const [showQuoteConfirm, setShowQuoteConfirm] = useState(false);
  const [quoteConfirmChecked, setQuoteConfirmChecked] = useState(false);
  const [isStartingWork, setIsStartingWork] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState('');

  const [isAcceptingProposal, setIsAcceptingProposal] = useState(false);
  const [isRejectingProposal, setIsRejectingProposal] = useState(false);
  const [proposalRejectReason, setProposalRejectReason] = useState('');
  const [showProposalRejectForm, setShowProposalRejectForm] = useState(false);

  function formatElapsed(date: Date | null | undefined): string {
    if (!date) return '';
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 60) return `hace ${mins} minuto${mins !== 1 ? 's' : ''}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} hora${hours !== 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    return `hace ${days} día${days !== 1 ? 's' : ''}`;
  }

  function formatActivityTimestamp(createdAt: string | Date) {
    return format(new Date(createdAt), 'd MMM yyyy, HH:mm', { locale: es });
  }

  useEffect(() => {
    if (caseStatus !== 'enEvaluacion' || !actingAsDentista) return;
    const update = () => setElapsedLabel(formatElapsed(clinicalCase?.publishedAt));
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [caseStatus, actingAsDentista, clinicalCase?.publishedAt]);

  const PHASE_ACTIONS: Record<string, string[]> = {
    propuesta: [
      'CASO_CREADO',
      /** Alias legacy previo a CASO_CREADO; misma pestaña que borrador. */
      'CREACION',
      'COTIZACION_RECIBIDA',
      'PROPUESTA_ACEPTADA',
      'PROPUESTA_RECHAZADA',
      'CASO_PUBLICADO',
      'OFERTAS_COMPARATIVAS_LISTAS',
      'PROPUESTA_GENERADA',
      'OFERTA_ACEPTADA',
      'OFERTA_RECHAZADA',
      'OFERTA_GANADORA',
      'OFERTA_NO_SELECCIONADA',
      'CASO_OFERTAS_TODAS_RECHAZADAS',
      'CASO_SIN_OFERTAS_CERRADO',
      'INVITACION_RECIBIDA',
      'OFERTA_ENVIADA',
      'INVITACION_EXPIRADA',
      'SOLICITUD_CAMBIO_FLUJO',
      'SOLICITUD_CAMBIO_FLUJO_RECHAZADA',
      'CASO_PAUSADO',
      'CASO_CANCELADO',
    ],
    diseno: [
      'TRABAJO_INICIADO',
      'REVISION_ENVIADA',
      'REVISION_SOLICITADA',
      'TRABAJO_APROBADO',
      'COMENTARIO_TECNICO',
      'REANUDADO',
    ],
    produccion: ['FABRICACION_INICIADA', 'CASO_DESPACHADO', 'RECEPCION_CONFIRMADA'],
  };

  const uchAssignedId = normalizedAssignedTechnicianId(clinicalCase);
  const isLoser =
    !viewingAsAdmin &&
    !!(actingAsTecnico && currentUser?.id && uchAssignedId && uchAssignedId !== String(currentUser.id));

  const uchViewerIsAssignedTechnician =
    actingAsTecnico && !!currentUser?.id && !!uchAssignedId && uchAssignedId === String(currentUser.id);

  const techCreationInstructions =
    uchViewerIsAssignedTechnician && caseStatus === 'cambiosEnProceso'
      ? creationInstructionsText(clinicalCase ?? {})
      : '';
  const techLatestRevisionComment =
    uchViewerIsAssignedTechnician && caseStatus === 'cambiosEnProceso'
      ? latestRejectedDeliveryReviewComment(clinicalCase?.deliveries)
      : null;

  const showTechCreationInstructionsBanner =
    uchViewerIsAssignedTechnician && caseStatus === 'cambiosEnProceso' && techCreationInstructions.length > 0;

  const showTechRevisionFromDeliveryBanner =
    uchViewerIsAssignedTechnician && caseStatus === 'cambiosEnProceso' && !!techLatestRevisionComment;

  const showDentistEvalBanner = (actingAsDentista || viewingAsAdmin) && caseStatus === 'enEvaluacion';
  const showDentistPendingStartBanner =
    (actingAsDentista || viewingAsAdmin) && caseStatus === 'aceptadaPendienteInicio';

  const viewerMaySeeOperationalDeadlineUch =
    actingAsDentista || viewingAsAdmin || uchViewerIsAssignedTechnician;
  const uchHeaderShowsWorkDeadline =
    !!clinicalCase?.workDeadline &&
    ['enEjecucion', 'enRevision', 'cambiosEnProceso', 'disenoAprobado', 'enFabricacion', 'enviado', 'completado'].includes(
      caseStatus,
    ) &&
    (actingAsDentista || uchViewerIsAssignedTechnician);

  const showUchInlineDeadlineBanner =
    viewerMaySeeOperationalDeadlineUch &&
    ['enEjecucion', 'enRevision', 'cambiosEnProceso'].includes(caseStatus) &&
    !!clinicalCase?.workDeadline &&
    !uchHeaderShowsWorkDeadline;

  const roleScopedEvents = useMemo(
    () =>
      events
        .filter((e) => {
          const visibleTo = (e.payload as any)?.visibleTo;

          if (visibleTo === 'sistema') return false;

          if (viewingAsAdmin) return true;

          /** Dentista: ocultar ruido motor comparativo (sigue en pestaña Todos vía otras rutas / servidor). */
          if (actingAsTecnico && techOfferRejectedView && selectedTechnicianId) {
            const invId = (e.payload as any)?.invitationId;
            if (invId) {
              if (!myInvitation?.id || invId !== myInvitation.id) return false;
            }
          }

          if (
            actingAsDentista &&
            (e.action === 'OFERTAS_COMPARATIVAS_LISTAS' || e.action === 'PROPUESTA_GENERADA')
          ) {
            return false;
          }

          if (selectedTechnicianId) {
            if (visibleTo === 'dentista') return false;

            if (visibleTo === 'tecnico' && selectedTechnicianId) {
              const evtInvId = (e.payload as any)?.invitationId;
              if (evtInvId && myInvitation?.id && evtInvId !== myInvitation.id) return false;
              if (
                !tecnicoSeesVisibleToTecnicoEvent({
                  eventUserId: (e.userId ?? e.user?.id) || '',
                  invitationIdFromPayload: evtInvId,
                  viewerTechnicianId: selectedTechnicianId,
                  currentInvitationId: myInvitation?.id ?? null,
                  assignedTechnicianId: clinicalCase?.assignedTechnicianId,
                  doctorId: clinicalCase?.doctorId,
                })
              ) {
                return false;
              }
            }

            if (!visibleTo && e.type !== 'sistema') {
              const isFromMe = e.user?.id === selectedTechnicianId;
              const isTargetedToMe = (e.payload as any)?.technicianId === selectedTechnicianId;
              const isFromDentistToMe =
                clinicalCase?.doctorId &&
                e.user?.id === clinicalCase.doctorId &&
                isTargetedToMe;
              if (!isFromMe && !isTargetedToMe && !isFromDentistToMe) return false;
            }
          }

          if (actingAsTecnico && techOfferRejectedView && selectedTechnicianId && e.type === 'sistema') {
            const p = e.payload as any;
            const invId = p?.invitationId;
            if (!invId) {
              const allowUnscopedSistema = [
                'OFERTA_RECHAZADA',
                'OFERTA_NO_SELECCIONADA',
                'INVITACION_EXPIRADA',
                'CASO_OFERTAS_TODAS_RECHAZADAS',
                'CASO_SIN_OFERTAS_CERRADO',
              ];
              if (!allowUnscopedSistema.includes(e.action)) return false;
            }
          }

          if (actingAsTecnico && techOfferRejectedView && selectedTechnicianId) {
            const assignedStr = normalizedAssignedTechnicianId(clinicalCase);
            const authorId = String((e.userId ?? e.user?.id) || '');
            if (
              assignedStr &&
              authorId &&
              authorId === assignedStr &&
              authorId !== String(selectedTechnicianId)
            ) {
              return false;
            }
          }

          return true;
        })
        .sort(compareCaseEventsNewestFirst),
    [
      events,
      viewingAsAdmin,
      actingAsDentista,
      selectedTechnicianId,
      myInvitation?.id,
      clinicalCase?.doctorId,
      clinicalCase?.assignedTechnicianId,
      actingAsTecnico,
      techOfferRejectedView,
    ],
  );

  /** Técnico: el hilo ya muestra cierre de oferta (perdedor u otro rechazo visible); evita pie duplicado. */
  const timelineHasTechOfferClosureEvent = useMemo(
    () =>
      roleScopedEvents.some(
        (e) =>
          e.action === 'OFERTA_NO_SELECCIONADA' ||
          (actingAsTecnico && e.action === 'OFERTA_RECHAZADA'),
      ),
    [roleScopedEvents, actingAsTecnico],
  );

  /**
   * Para el dentista (incluido admin actuando como dentista), divide el evento legacy
   * "He publicado el caso. Estamos buscando el laboratorio ideal…" en dos burbujas
   * (carril propio + voz Fauchard). Para los demás roles, deja los eventos intactos.
   */
  const presentingAsDentista =
    viewingAsAdmin ||
    uchPresentationRole === 'dentista' ||
    (actingAsDentista && !actingAsTecnico);

  const filteredEvents = useMemo(() => {
    const allowed = phaseTab === 'todos' ? null : (PHASE_ACTIONS[phaseTab] ?? []);
    const list =
      allowed === null
        ? [...roleScopedEvents]
        : roleScopedEvents.filter((e) => allowed.includes(e.action));
    const expanded = presentingAsDentista ? splitCasoPublicadoForDentista(list) : list;
    return expanded.sort(compareCaseEventsNewestFirst);
  }, [roleScopedEvents, phaseTab, presentingAsDentista]);

  /** v1, v2… según orden cronológico real (la lista en pantalla va del más reciente al más antiguo). */
  const revisionVersionMap = useMemo(() => {
    const m = new Map<string, number>();
    let revIdx = 0;
    const chronological = [...filteredEvents].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    chronological.forEach((e) => {
      if (e.action === 'REVISION_ENVIADA') {
        revIdx++;
        m.set(e.id, revIdx);
      }
    });
    return m;
  }, [filteredEvents]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = 0;
  }, [phaseTab]);

  /** Cursor BD: evento más antiguo del lote cargado (orden cronológico). */
  const oldestLoadedEventId = useMemo(() => {
    if (!events.length) return null;
    let oldest = events[0];
    for (let i = 1; i < events.length; i++) {
      const e = events[i];
      const t = new Date(e.createdAt).getTime();
      const ot = new Date(oldest.createdAt).getTime();
      if (t < ot || (t === ot && String(e.id).localeCompare(String(oldest.id)) < 0)) oldest = e;
    }
    return String(oldest.id);
  }, [events]);

  const canTechSubmitDesignDelivery =
    actingAsTecnico &&
    (caseStatus === 'enEjecucion' || caseStatus === 'cambiosEnProceso') &&
    clinicalCase?.assignedTechnicianId === currentUser?.id &&
    !!(clinicalCase?.workStartedAt || clinicalCase?.workDeadline);

  const isIntegralCase = clinicalCase?.serviceType === 'integral';

  const handleQuoteSubmit = async () => {
    if (!myInvitation) return;
    setIsSubmittingQuote(true);

    // Flete (v4.4): aplica si el caso tiene fabricación. Acepta 0.
    const serviceType = (clinicalCase as any)?.serviceType as string | undefined;
    const hasFabrication = serviceType === 'integral' || serviceType === 'solo_fabricacion';
    const shippingPrice = hasFabrication ? Number((quoteShippingPrice || '').replace(/\D/g, '')) || 0 : 0;
    // v4.6 — La unidad determina si el numérico se envía como days u hours.
    const shippingValue = hasFabrication ? (quoteShippingDays ?? 0) : 0;
    const shippingDaysPayload = quoteShippingUnit === 'dias' ? shippingValue : 0;
    const shippingHoursPayload = quoteShippingUnit === 'horas' ? shippingValue : 0;

    if (isIntegralCase) {
      // Caso integral: desglose obligatorio diseño + fabricación.
      const designPrice = Number(quoteDesignPrice.replace(/\D/g, ''));
      const fabricationPrice = Number(quoteFabricationPrice.replace(/\D/g, ''));
      if (!designPrice || designPrice <= 0 || !fabricationPrice || fabricationPrice <= 0) {
        setIsSubmittingQuote(false);
        showError('Ingresa precios válidos para diseño y fabricación');
        return;
      }
      if (!quoteDesignDays || !quoteFabricationDays) {
        setIsSubmittingQuote(false);
        showError('Selecciona los plazos de diseño y fabricación');
        return;
      }
      const res = await submitQuoteAction(myInvitation.id, {
        kind: 'split',
        designPrice,
        ...(quoteDesignUnit === 'horas'
          ? { designHours: quoteDesignDays }
          : { designDays: quoteDesignDays }),
        fabricationPrice,
        ...(quoteFabricationUnit === 'horas'
          ? { fabricationHours: quoteFabricationDays }
          : { fabricationDays: quoteFabricationDays }),
        shippingPrice,
        shippingDays: shippingDaysPayload,
        shippingHours: shippingHoursPayload,
        notes: quoteNotes || undefined,
      });
      setIsSubmittingQuote(false);
      if (res.success) {
        showSuccess('Cotización enviada. Te avisaremos si eres seleccionado.');
        dispatchDashboardMetricsRefresh();
        await onInvitationUpdate?.();
      } else {
        showError(res.error || 'Error al enviar la cotización');
      }
      return;
    }

    // solo_diseno / solo_fabricacion: firma flat tradicional.
    const numericPrice = Number(quotePrice.replace(/\D/g, ''));
    if (!numericPrice || numericPrice <= 0) {
      setIsSubmittingQuote(false);
      showError('Ingresa un precio válido mayor a 0');
      return;
    }
    const res = await submitQuoteAction(myInvitation.id, {
      kind: 'flat',
      price: numericPrice,
      ...(quoteFlatUnit === 'horas'
        ? { deliveryHours: quoteDays }
        : { deliveryDays: quoteDays }),
      ...(hasFabrication
        ? { shippingPrice, shippingDays: shippingDaysPayload, shippingHours: shippingHoursPayload }
        : {}),
      notes: quoteNotes || undefined,
    });
    setIsSubmittingQuote(false);
    if (res.success) {
      showSuccess('Cotización enviada. Te avisaremos si eres seleccionado.');
      dispatchDashboardMetricsRefresh();
      await onInvitationUpdate?.();
    } else {
      showError(res.error || 'Error al enviar la cotización');
    }
  };

  const comparative = (clinicalCase as any)?.comparativeOffers as
    | {
        invitationId: string;
        rank: number;
        totalPriceCLP: number;
        quotedDays: number | null;
        quotedHours?: number | null;
        techNotes: string | null;
        respondedAt: string | Date | null;
        designPriceCLP?: number | null;
        designDays?: number | null;
        designHours?: number | null;
        fabricationPriceCLP?: number | null;
        fabricationDays?: number | null;
        fabricationHours?: number | null;
        shippingPriceCLP?: number | null;
        shippingDays?: number | null;
        shippingHours?: number | null;
      }[]
    | undefined;

  const techInvitationPanel =
    !!myInvitation &&
    (
      (caseStatus === 'enEvaluacion' &&
        (myInvitation.status === 'pending' ||
          myInvitation.status === 'expired' ||
          myInvitation.status === 'quoted')) ||
      (caseStatus === 'propuestaLista' &&
        (myInvitation.status === 'quoted' ||
          myInvitation.status === 'rejected' ||
          myInvitation.status === 'pending')) ||
      (caseStatus === 'cerrado' && myInvitation.status === 'rejected')
    );

  const pendingDeliveryForReview = useMemo(() => {
    const deliveriesList =
      (clinicalCase?.deliveries as { id?: string; status?: string; files?: string[]; version?: number }[] | undefined) ?? [];
    return deliveriesList.find((d) => d.status === 'pending');
  }, [clinicalCase?.deliveries]);

  const includeDelivery = canTechSubmitDesignDelivery;

  const includeCaseActions = computeIncludeCaseActionTimeline({
    actingAsDentista,
    actingAsTecnico,
    viewingAsAdmin,
    caseStatus,
    clinicalCase,
    currentUserId: currentUser?.id,
    myInvitation,
    comparativeLength: comparative?.length ?? 0,
    techInvitationPanel,
    includeDelivery,
    timelineEvents: filteredEvents as { action: string }[],
    proposalExpiresAt: clinicalCase?.proposalExpiresAt,
  });

  const includeDentistReview =
    actingAsDentista && caseStatus === 'enRevision' && !!pendingDeliveryForReview;

  const primaryAction = useMemo(
    () => primaryUchActionId({ includeDentistReview, includeDelivery, includeCaseActions }),
    [includeDentistReview, includeDelivery, includeCaseActions],
  );

  /**
   * Fase de las filas de acción. Cuando el usuario filtra por una pestaña distinta de
   * "todos", las acciones que pertenecen a otra fase no deben aparecer.
   *   - dentist_review / delivery → siempre fase diseño
   *   - case_actions → fase derivada del estado actual del caso
   */
  const caseActionsPhase: PhaseTab =
    caseStatus === 'borrador' ||
    caseStatus === 'enEvaluacion' ||
    caseStatus === 'propuestaLista' ||
    caseStatus === 'publicado'
      ? 'propuesta'
      : caseStatus === 'enFabricacion' || caseStatus === 'enviado' || caseStatus === 'completado'
        ? 'produccion'
        : 'diseno';

  const phaseAllowsAction = (actionPhase: PhaseTab) =>
    phaseTab === 'todos' || phaseTab === actionPhase;

  const timelineRows = useMemo(
    () =>
      buildUchTimelineRows({
        events: filteredEvents as unknown as UchCaseEventLite[],
        includeContext: false,
        includeDentistReview: includeDentistReview && phaseAllowsAction('diseno'),
        includeCaseActions: includeCaseActions && phaseAllowsAction(caseActionsPhase),
        includeDelivery: includeDelivery && phaseAllowsAction('diseno'),
        proposalExpiresAt: clinicalCase?.proposalExpiresAt,
        clinicalUpdatedAt: clinicalCase?.updatedAt,
        workDeadline: clinicalCase?.workDeadline,
        pinActionId: primaryAction,
      }),
    [
      filteredEvents,
      caseStatus,
      phaseTab,
      caseActionsPhase,
      actingAsDentista,
      actingAsTecnico,
      currentUser?.id,
      includeDentistReview,
      includeCaseActions,
      includeDelivery,
      primaryAction,
      comparative?.length ?? 0,
      uchDeadlineDepMs(clinicalCase?.proposalExpiresAt),
      uchDeadlineDepMs(clinicalCase?.updatedAt),
      uchDeadlineDepMs(clinicalCase?.workDeadline),
      clinicalCase?.pendingActionRequest ?? '',
      clinicalCase?.pendingActionActor ?? '',
    ],
  );

  const [actionExpanded, setActionExpanded] = useState<Partial<Record<UchActionRowId, boolean>>>({});
  const primaryInitKeyRef = useRef('');

  useEffect(() => {
    if (!primaryAction) return;
    const k = `${caseId}:${primaryAction}`;
    if (primaryInitKeyRef.current === k) return;
    primaryInitKeyRef.current = k;
    setActionExpanded((prev) => ({ ...prev, [primaryAction]: true }));
  }, [primaryAction, caseId]);

  const resetDeliveryForm = () => {
    setDeliveryNotes('');
    setDeliveryFiles([]);
    setFileProgress({});
  };

  const uploadFileWithProgress = async (file: File, url: string, fileIdx: number): Promise<void> => {
    // Comprime con gzip los modelos 3D (STL/PLY/OBJ); el resto pasa intacto.
    const { body, contentEncoding } = await maybeGzipForUpload(file);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setFileProgress(prev => ({ ...prev, [fileIdx]: Math.round((e.loaded / e.total) * 100) }));
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) { setFileProgress(prev => ({ ...prev, [fileIdx]: 100 })); resolve(); }
        else reject(new Error(`Error ${xhr.status} subiendo ${file.name}`));
      });
      xhr.addEventListener('error', () => reject(new Error(`Error de red subiendo ${file.name}`)));
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type);
      if (contentEncoding) xhr.setRequestHeader('Content-Encoding', contentEncoding);
      xhr.send(body);
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface backdrop-blur-xl border border-divider/30 rounded-3xl shadow-2xl overflow-hidden">
      {/* HEADER */}
      <div className="px-6 pt-4 pb-2 bg-surface-off border-b border-divider">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-primary-hl flex items-center justify-center text-primary border border-primary/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight">Centro de control</h3>
              <p className="text-[10px] text-faint mt-0.5">Actividad del caso — flujo guiado</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showHeaderCountdown && (
              <motion.div
                className="flex flex-col items-end gap-0.5"
                aria-label="Plazo para elegir oferta"
                title="Validez de propuesta (horas configuradas en Fauchard)"
              >
                <span className="text-[8px] font-black text-warning/70 uppercase tracking-widest">
                  Plazo para elegir oferta
                </span>
                <motion.div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-warning-hl border border-warning/20">
                  <Clock className="w-3.5 h-3.5 text-warning shrink-0" />
                  <span className="text-[11px] font-mono font-black tabular-nums text-warning">
                    {formatCountdownHMS(headerCountdownRemainingMs)}
                  </span>
                </motion.div>
              </motion.div>
            )}
            <button
              onClick={onClose}
              aria-label="Cerrar Centro de Control"
              className="w-8 h-8 rounded-full hover:bg-surface-off flex items-center justify-center text-faint hover:text-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <UchDealSummary
          caseStatus={caseStatus}
          actingAsDentista={actingAsDentista}
          actingAsTecnico={actingAsTecnico}
          viewingAsAdmin={viewingAsAdmin}
          currentUserId={currentUser?.id}
          clinicalCase={clinicalCase}
          invitation={
            myInvitation
              ? {
                  quotedPrice: myInvitation.quotedPrice,
                  quotedDays: myInvitation.quotedDays,
                  quotedDesignPrice: myInvitation.quotedDesignPrice,
                  quotedDesignDays: myInvitation.quotedDesignDays,
                  quotedFabricationPrice: myInvitation.quotedFabricationPrice,
                  quotedFabricationDays: myInvitation.quotedFabricationDays,
                  quotedShippingPrice: myInvitation.quotedShippingPrice,
                  quotedShippingDays: myInvitation.quotedShippingDays,
                  respondedAt: myInvitation.respondedAt ?? null,
                  techNotes: myInvitation.techNotes ?? null,
                  status: myInvitation.status,
                }
              : null
          }
          techOfferRejectedView={techOfferRejectedView}
        />
      </div>

      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        <div
            id="uch-panel-actividad"
            role="region"
            aria-label="Actividad del caso"
            className="flex flex-1 flex-col min-h-0 overflow-hidden bg-background"
          >
            <div className="px-4 py-1.5 border-b border-divider flex-shrink-0 bg-surface">
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-wide text-faint flex-shrink-0">Fase</span>
                <div className="flex flex-1 gap-0.5 bg-surface-2 rounded-md p-0.5">
                  {(['todos', 'propuesta', 'diseno', 'produccion'] as PhaseTab[]).map((tab) => {
                    const labels: Record<PhaseTab, string> = {
                      todos: 'Todos',
                      propuesta: 'Propuesta',
                      diseno: 'Diseño',
                      produccion: 'Produc.',
                    };
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setPhaseTab(tab)}
                        className={`flex-1 py-1 rounded text-[10px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                          phaseTab === tab ? 'bg-surface-off text-foreground' : 'text-faint hover:text-muted hover:bg-surface-off/60'
                        }`}
                      >
                        {labels[tab]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {(showTechCreationInstructionsBanner ||
              showTechRevisionFromDeliveryBanner ||
              showDentistEvalBanner ||
              showDentistPendingStartBanner ||
              showUchInlineDeadlineBanner) && (
              <div
                data-testid="uch-inline-alerts"
                className="px-3 pt-2 pb-2 space-y-2 flex-shrink-0 border-b border-divider bg-background"
              >
                {showTechRevisionFromDeliveryBanner && techLatestRevisionComment && (
                  <div className="rounded-lg border-l-2 border-warning/20 bg-surface-off/40 pl-3 pr-2 py-2">
                    <p className="text-[10px] text-faint mb-1">Ajustes solicitados</p>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{techLatestRevisionComment}</p>
                  </div>
                )}
                {showTechCreationInstructionsBanner && (
                  <div className="rounded-lg border-l-2 border-primary/30 bg-surface-off/40 pl-3 pr-2 py-2">
                    <p className="text-[10px] text-faint mb-1">Indicaciones del solicitante</p>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{techCreationInstructions}</p>
                  </div>
                )}
                {showDentistEvalBanner && (
                  <div className="rounded-xl px-3 py-2.5 border border-primary/20 bg-primary-hl flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-primary flex-shrink-0 animate-pulse" />
                    <div>
                      <p className="text-[9px] font-bold text-indigo-200 uppercase tracking-widest">Estamos analizando tu caso</p>
                      {elapsedLabel ? <p className="text-[11px] text-foreground">Publicado {elapsedLabel}</p> : null}
                    </div>
                  </div>
                )}
                {showDentistPendingStartBanner && (
                  <div className="rounded-xl px-3 py-2.5 border border-primary/30/25 bg-primary-hl flex items-start gap-2">
                    <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[9px] font-bold text-primary uppercase tracking-widest">Esperando confirmación de inicio</p>
                      <p className="text-[11px] text-foreground leading-relaxed">
                        Tu aceptación ya está registrada. Cuando el proveedor confirme el inicio del trabajo, verás aquí el avance y el plazo de entrega acordado.
                      </p>
                    </div>
                  </div>
                )}
                {showUchInlineDeadlineBanner && clinicalCase?.workDeadline && (() => {
                  const deadline = new Date(clinicalCase.workDeadline);
                  const hoursLeft = (deadline.getTime() - Date.now()) / 3600000;
                  const isOverdue = hoursLeft < 0;
                  const isAlert = !isOverdue && hoursLeft < 24;
                  const deadlineLabel = deadline.toLocaleDateString('es-CL', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  });
                  const deadlineTime = deadline.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                  if (isOverdue) {
                    return (
                      <div className="rounded-xl px-3 py-2.5 border border-error/20 bg-error flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-error" />
                        <p className="text-[11px] font-semibold text-error">El plazo de entrega ha vencido.</p>
                      </div>
                    );
                  }
                  return (
                    <div
                      className={`rounded-xl px-3 py-2.5 border flex items-center gap-2 ${isAlert ? 'border-warning/20 bg-warning-hl' : 'border-divider bg-surface/35'}`}
                    >
                      <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${isAlert ? 'text-warning' : 'text-faint'}`} />
                      <div className="min-w-0">
                        <p className={`text-[10px] font-medium ${isAlert ? 'text-warning' : 'text-faint'}`}>Plazo de entrega</p>
                        <p className="text-[11px] text-foreground capitalize leading-snug">
                          {deadlineLabel} · {deadlineTime}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div
              ref={scrollRef}
              data-testid="uch-timeline-scroll"
              className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 custom-scrollbar bg-background"
            >
              {timelineRows.map((row) => {
                if (row.kind === 'action' && row.id === 'dentist_review') {
                  return (
                    <div key="uch-action-dentist-review" className="space-y-1">
                      <UchDentistReviewPanel
                        reviewComment={reviewComment}
                        setReviewComment={setReviewComment}
                        isSubmittingReview={isSubmittingReview}
                        isSubmittingRevision={isSubmittingRevision}
                        onRequestRevision={async () => {
                          if (!reviewComment.trim()) return;
                          setIsSubmittingRevision(true);
                          try {
                            const ok = await onActionTriggered?.('request_revision', { reason: reviewComment });
                            // Solo limpiar/colapsar si la acción tuvo éxito.
                            // Si ContactGuard u otro server-side la rechazó, conservar el texto
                            // del dentista y el panel abierto para que pueda corregir.
                            if (ok) {
                              setReviewComment('');
                              setActionExpanded((p) => ({ ...p, dentist_review: false }));
                            }
                          } finally {
                            setIsSubmittingRevision(false);
                          }
                        }}
                        onApprove={async () => {
                          setIsSubmittingReview(true);
                          try {
                            const ok = await onActionTriggered?.('approve_work', { comment: reviewComment });
                            if (ok) {
                              setReviewComment('');
                              setActionExpanded((p) => ({ ...p, dentist_review: false }));
                            }
                          } finally {
                            setIsSubmittingReview(false);
                          }
                        }}
                        onDownloadAll={handleDownloadAll}
                        downloadingVersionId={downloadingVersionId}
                        pendingDelivery={pendingDeliveryForReview}
                        expanded={actionExpanded.dentist_review === true}
                        onToggleExpanded={() => setActionExpanded((p) => ({ ...p, dentist_review: !p.dentist_review }))}
                      />
                    </div>
                  );
                }
                if (row.kind === 'action' && row.id === 'delivery') {
                  return (
                    <div key="uch-action-delivery" className="space-y-1">
                      <UchDeliveryPanel
                        caseId={caseId}
                        organizationId={clinicalCase?.organizationId}
                        deliveryNotes={deliveryNotes}
                        setDeliveryNotes={setDeliveryNotes}
                        deliveryFiles={deliveryFiles}
                        setDeliveryFiles={setDeliveryFiles}
                        fileProgress={fileProgress}
                        setFileProgress={setFileProgress}
                        isUploadingFiles={isUploadingFiles}
                        setIsUploadingFiles={setIsUploadingFiles}
                        isSendingDelivery={isSendingDelivery}
                        setIsSendingDelivery={setIsSendingDelivery}
                        showError={showError}
                        onSubmitDelivery={async ({ notes, filePaths }) => {
                          const ok = await onActionTriggered?.('submit_delivery', { notes, filePaths });
                          // Solo limpiar el formulario si la entrega se envió. Si ContactGuard
                          // bloqueó, conservar notas y archivos para que el técnico corrija.
                          if (ok) resetDeliveryForm();
                        }}
                        onDismiss={resetDeliveryForm}
                        uploadFileWithProgress={uploadFileWithProgress}
                        expanded={actionExpanded.delivery === true}
                        onToggleExpanded={() => setActionExpanded((p) => ({ ...p, delivery: !p.delivery }))}
                      />
                    </div>
                  );
                }
                if (row.kind === 'action' && row.id === 'case_actions') {
                  return (
                    <div key="uch-action-case-actions" className="space-y-1">
                      <UchFauchardActionsPanel
                        caseId={caseId}
                        caseStatus={caseStatus}
                        actingAsDentista={actingAsDentista}
                        actingAsTecnico={actingAsTecnico}
                        clinicalCase={clinicalCase}
                        myInvitation={myInvitation}
                        comparative={comparative}
                        currentUserId={currentUser?.id}
                        quotePrice={quotePrice}
                        setQuotePrice={setQuotePrice}
                        quoteDays={quoteDays}
                        setQuoteDays={setQuoteDays}
                        quoteFlatUnit={quoteFlatUnit}
                        setQuoteFlatUnit={setQuoteFlatUnit}
                        quoteNotes={quoteNotes}
                        setQuoteNotes={setQuoteNotes}
                        quoteDesignPrice={quoteDesignPrice}
                        setQuoteDesignPrice={setQuoteDesignPrice}
                        quoteDesignDays={quoteDesignDays}
                        setQuoteDesignDays={setQuoteDesignDays}
                        quoteDesignUnit={quoteDesignUnit}
                        setQuoteDesignUnit={setQuoteDesignUnit}
                        quoteFabricationPrice={quoteFabricationPrice}
                        setQuoteFabricationPrice={setQuoteFabricationPrice}
                        quoteFabricationDays={quoteFabricationDays}
                        setQuoteFabricationDays={setQuoteFabricationDays}
                        quoteFabricationUnit={quoteFabricationUnit}
                        setQuoteFabricationUnit={setQuoteFabricationUnit}
                        quoteShippingPrice={quoteShippingPrice}
                        setQuoteShippingPrice={setQuoteShippingPrice}
                        quoteShippingDays={quoteShippingDays}
                        setQuoteShippingDays={setQuoteShippingDays}
                        quoteShippingUnit={quoteShippingUnit}
                        setQuoteShippingUnit={setQuoteShippingUnit}
                        isSubmittingQuote={isSubmittingQuote}
                        isStartingWork={isStartingWork}
                        setIsStartingWork={setIsStartingWork}
                        setQuoteConfirmChecked={setQuoteConfirmChecked}
                        setShowQuoteConfirm={setShowQuoteConfirm}
                        showSuccess={showSuccess}
                        showError={showError}
                        onInvitationUpdate={onInvitationUpdate}
                        onActionTriggered={onActionTriggered}
                        onOpenDeliveryInline={() => setActionExpanded((p) => ({ ...p, delivery: true }))}
                        showDeliveryShortcut={canTechSubmitDesignDelivery}
                        proposalDeadlineMs={proposalDeadlineMs}
                        serverClockAnchor={serverClockAnchor}
                      />
                    </div>
                  );
                }
                if (row.kind === 'event') {
                  return (
                    <UchEventBubble
                      key={row.event.id}
                      event={row.event}
                      currentUser={currentUser}
                      actingAsDentista={actingAsDentista}
                      actingAsTecnico={actingAsTecnico}
                      viewingAsAdmin={viewingAsAdmin}
                      uchPresentationRole={uchPresentationRole}
                      revisionVersionMap={revisionVersionMap}
                      formatActivityTimestamp={formatActivityTimestamp}
                      onDownloadRevisionZip={handleDownloadAll}
                      downloadingRevisionZipId={downloadingVersionId}
                    />
                  );
                }
                return null;
              })}
              {uchHasMoreOlder && onLoadOlderUchEvents && oldestLoadedEventId && (
                <div
                  className="flex justify-center py-2 mt-1 border-t border-divider"
                  data-testid="uch-load-older-wrap"
                >
                  <button
                    type="button"
                    data-testid="uch-load-older"
                    disabled={loadingOlderUch}
                    onClick={async () => {
                      setLoadingOlderUch(true);
                      try {
                        await onLoadOlderUchEvents(oldestLoadedEventId);
                      } catch {
                        showError('No se pudo cargar más historial');
                      } finally {
                        setLoadingOlderUch(false);
                      }
                    }}
                    className="text-[11px] font-medium text-primary/90 hover:text-primary hover:bg-surface-off hover:border-border transition-colors duration-150 disabled:opacity-50 py-1.5 px-3 rounded-lg border border-divider bg-surface-off/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    {loadingOlderUch ? 'Cargando…' : 'Cargar historial anterior'}
                  </button>
                </div>
              )}
            </div>

          </div>

          {isLoser && !timelineHasTechOfferClosureEvent && (
            <div className="px-5 py-4 bg-surface border-t border-divider">
              <div className="flex items-center gap-3 bg-error border border-error/20 rounded-2xl px-4 py-3">
                <div className="w-8 h-8 rounded-xl bg-error-hl border border-error/20 flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-4 h-4 text-error" />
                </div>
                <div>
                  <p className="text-xs font-black text-error leading-tight">Caso ya fue Asignado, Gracias por tu Oferta</p>
                  <p className="text-[10px] text-faint mt-0.5">Solo lectura — puedes consultar tu historial de cotizaciones.</p>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Confirmación envío oferta: sheet inferior (no modal centrado) */}
      <AnimatePresence>
        {showQuoteConfirm && (
          <div className="fixed inset-0 z-[300] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-surface border border-primary/30 border-b-0 sm:border-b rounded-t-2xl sm:rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 sm:mx-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="uch-quote-confirm-title"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-primary-hl rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Send className="w-6 h-6 text-primary" />
                </div>
                <h3 id="uch-quote-confirm-title" className="text-xl font-bold text-foreground">Confirmar envío de oferta</h3>
                <p className="text-sm text-muted">Estás a punto de enviar esta oferta:</p>
              </div>

              <div className="bg-surface-2 rounded-2xl p-4 space-y-2">
                {(() => {
                  // v4.4 — Flete (aplica a integral y solo_fabricacion). v4.6 — soporte horas por slot.
                  const serviceType = (clinicalCase as any)?.serviceType as string | undefined;
                  const hasFabrication = serviceType === 'integral' || serviceType === 'solo_fabricacion';
                  const sp = hasFabrication ? Number((quoteShippingPrice || '').replace(/\D/g, '')) || 0 : 0;
                  const sd = hasFabrication ? (quoteShippingDays ?? 0) : 0;
                  const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
                  const slot = (value: number, unit: 'dias' | 'horas') => {
                    if (!value || value <= 0) return '—';
                    if (unit === 'horas') return `${value} ${value === 1 ? 'hora' : 'horas'}`;
                    return `${value} ${value === 1 ? 'día hábil' : 'días hábiles'}`;
                  };

                  if (isIntegralCase) {
                    const dp = Number(quoteDesignPrice.replace(/\D/g, '')) || 0;
                    const fp = Number(quoteFabricationPrice.replace(/\D/g, '')) || 0;
                    const total = dp + fp + sp;
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-faint">Diseño</span>
                          <span className="text-foreground font-bold">{fmt(dp)} · {slot(quoteDesignDays, quoteDesignUnit)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-faint">Fabricación</span>
                          <span className="text-foreground font-bold">{fmt(fp)} · {slot(quoteFabricationDays, quoteFabricationUnit)}</span>
                        </div>
                        {hasFabrication && (
                          <div className="flex justify-between text-sm">
                            <span className="text-faint">Flete <span className="text-[10px]">(sin comisión)</span></span>
                            <span className="text-foreground font-bold">{fmt(sp)} · {slot(sd, quoteShippingUnit)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm pt-2 border-t border-divider mt-2">
                          <span className="text-primary font-bold">Total</span>
                          <span className="text-primary font-bold">{fmt(total)}</span>
                        </div>
                      </>
                    );
                  }

                  // flat (solo_diseno / solo_fabricacion)
                  const flat = Number((quotePrice || '').replace(/\D/g, '')) || 0;
                  const total = flat + sp;
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-faint">Precio</span>
                        <span className="text-foreground font-bold">{fmt(flat)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-faint">Plazo</span>
                        <span className="text-foreground font-bold">{slot(quoteDays, quoteFlatUnit)}</span>
                      </div>
                      {hasFabrication && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-faint">Flete <span className="text-[10px]">(sin comisión)</span></span>
                            <span className="text-foreground font-bold">{fmt(sp)} · {slot(sd, quoteShippingUnit)}</span>
                          </div>
                          <div className="flex justify-between text-sm pt-2 border-t border-divider mt-2">
                            <span className="text-primary font-bold">Total</span>
                            <span className="text-primary font-bold">{fmt(total)}</span>
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
                {quoteNotes && (
                  <div className="text-xs pt-1 border-t border-divider mt-2">
                    <p className="text-faint mb-1">Nota</p>
                    <p className="text-muted italic">"{quoteNotes}"</p>
                  </div>
                )}
              </div>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setQuoteConfirmChecked(v => !v)}
                  className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all ${quoteConfirmChecked ? 'bg-primary border-primary/30' : 'border-divider'}`}
                >
                  {quoteConfirmChecked && <CheckCircle2 className="w-3 h-3 text-inverse" />}
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Entiendo que, una vez enviada, podré <strong className="text-foreground">retirarla desde este centro de control</strong> antes de que el dentista acepte una propuesta, y luego cotizar de nuevo si el plazo lo permite.
                </p>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowQuoteConfirm(false); setQuoteConfirmChecked(false); }}
                  disabled={isSubmittingQuote}
                  className="flex-1 py-3 bg-surface-2 text-muted text-[10px] font-black uppercase rounded-2xl hover:bg-surface-off transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    await handleQuoteSubmit();
                    setShowQuoteConfirm(false);
                    setQuoteConfirmChecked(false);
                  }}
                  disabled={!quoteConfirmChecked || isSubmittingQuote}
                  className="flex-[2] py-3 bg-primary hover:opacity-90 text-inverse text-[10px] font-black uppercase rounded-2xl shadow-lg shadow-sm disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmittingQuote
                    ? <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
                    : <Send className="w-4 h-4" />}
                  Confirmar y enviar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
