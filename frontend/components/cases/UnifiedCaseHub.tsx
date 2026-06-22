'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertCircle, Clock, X, XCircle, ArrowUp } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSignedUrlAction } from '@/lib/db/actions/cases';
import { acceptAssignmentAction } from '@/lib/db/actions/assignment';
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
import DeliveryViewer3DModal from '@/components/cases/uch/DeliveryViewer3DModal';
import UchFauchardActionsPanel from '@/components/cases/uch/UchFauchardActionsPanel';
import UchSendToDentistPanel from '@/components/cases/uch/UchSendToDentistPanel';
import QualityIterationHistory from '@/components/cases/uch/QualityIterationHistory';

import { CaseDesiredDeliveryChip } from '@/components/cases/CaseDesiredDeliveryChip';
import { shouldShowDesiredDeliveryInUch } from '@/lib/cases/caseDeliveryPresentation';
import UchRatingPanel from '@/components/cases/uch/UchRatingPanel';
import type { ServerClockAnchor } from '@/lib/deadlineMs';
import { useRemainingMsUntil, formatCountdownHMS } from '@/lib/hooks/useRemainingUntil';
import { POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
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
  /** v5.19 — Viewer es el revisor de Calidad asignado al caso. */
  actingAsCalidad?: boolean;
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
  /** v5.0 — Etapa 3: plazo de revisión del dentista (`enRevision`). */
  reviewDeadlineMs?: number | null;
  /** v5.19 — SLA de la etapa de Calidad (`enRevisionCalidad`). */
  qualityReviewDeadlineMs?: number | null;
  serverClockAnchor?: ServerClockAnchor | null;
  /** Mensajes del otro rol llegados desde que se abrió el hub (badge en cabecera). */
  newMessageCount?: number;
  /** Reconoce los mensajes nuevos (marca leído + sincroniza campana/listados). */
  onAcknowledgeNew?: () => void;
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
  actingAsCalidad = false,
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
  reviewDeadlineMs,
  qualityReviewDeadlineMs,
  serverClockAnchor,
  newMessageCount = 0,
  onAcknowledgeNew,
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

  /**
   * Countdown 3 (v5.0): plazo de revisión del dentista (`enRevision`). Visible para
   * el dentista y el técnico que entregó (ambos en el flujo de revisión) y para admin.
   * Al expirar no hay auto-acción: solo se marca "Respuesta vencida" (§4.2).
   */
  const showReviewWindow =
    caseStatus === 'enRevision' &&
    reviewDeadlineMs != null &&
    (actingAsDentista || actingAsTecnico || viewingAsAdmin);
  const reviewRemainingMs = useRemainingMsUntil(showReviewWindow ? reviewDeadlineMs ?? null : null, serverClockAnchor);
  // `useRemainingMsUntil` clampa a 0 al vencer (solo devuelve -1 si el deadline es
  // null/inválido). Con `showReviewWindow` el deadline es válido (> 0), así que
  // `<= 0` ⇒ vencido (robusto ante cambios del clamp del hook).
  const reviewExpired = showReviewWindow && reviewRemainingMs <= 0;

  /**
   * Countdown de la etapa de Calidad (v5.19, `enRevisionCalidad`). Visible para el revisor
   * de Calidad, el técnico que entregó y admin. Invisible al dentista (no ve la etapa).
   * Al expirar no hay auto-acción: solo escalación por cron.
   */
  const showQualityWindow =
    caseStatus === 'enRevisionCalidad' &&
    qualityReviewDeadlineMs != null &&
    (actingAsCalidad || actingAsTecnico || viewingAsAdmin);
  const qualityRemainingMs = useRemainingMsUntil(showQualityWindow ? qualityReviewDeadlineMs ?? null : null, serverClockAnchor);
  const qualityExpired = showQualityWindow && qualityRemainingMs <= 0;

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
      // Nombre del archivo .zip; la carpeta raíz interna usa el mismo nombre para
      // que al descomprimir quede un único directorio plano (sin la estructura
      // profunda organizations/.../deliveries/).
      const archiveName = `${format(new Date(), 'yyyyMMdd_HHmmss')}_${versionLabel}_${clinicalCase?.caseNumber || 'CASE'}`;
      const folder = zip.folder(archiveName) ?? zip;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const url = await resolveReadableFileUrl(f);
        if (url) {
          const response = await fetch(url);
          const blob = await response.blob();
          const baseName = (() => {
            if (f.startsWith('http://') || f.startsWith('https://')) {
              try {
                // Decodificar primero: las URLs firmadas codifican el path del
                // objeto como un único segmento con `/` → `%2F`. Si no decodificamos
                // antes de split('/'), `baseName` arrastra el path completo y JSZip
                // lo interpreta como subdirectorios.
                const decodedPath = decodeURIComponent(new URL(f).pathname);
                return decodedPath.split('/').pop() || `archivo_${i + 1}`;
              } catch {
                return `archivo_${i + 1}`;
              }
            }
            return f.split('/').pop() || `archivo_${i + 1}`;
          })();
          folder.file(`${String(i + 1).padStart(2, '0')}_${baseName}`, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${archiveName}.zip`;
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
  type PhaseTab = 'todos' | 'asignacion' | 'entrega' | 'calificacion';
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
  const [qualityComment, setQualityComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [viewer3DState, setViewer3DState] = useState<{ deliveryId: string; version: number; files: string[]; dentistNote?: string; readonly?: boolean } | null>(null);
  const [quotePrice, setQuotePrice] = useState('');
  const [quoteDays, setQuoteDays] = useState(0);
  const [quoteFlatUnit, setQuoteFlatUnit] = useState<'dias' | 'horas'>('dias');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
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
    // v2 activo: publicación, asignación directa, inicio de trabajo
    // Legacy: todo el flujo de cotización múltiple y comparativo
    asignacion: [
      'CASO_PUBLICADO', 'CASO_EN_COLA', 'CASO_REPUBLICADO', 'REPUBLICACION',
      'ASIGNACION_ENVIADA', 'ASIGNACION_RECIBIDA', 'ASIGNACION_ACEPTADA',
      'ASIGNACION_RECHAZADA', 'ASIGNACION_EXPIRADA', 'ASIGNACION_REASIGNADA',
      'OFERTA_RECHAZADA_POR_TECNICO', 'TRABAJO_INICIADO',
      'ASIGNACION_CALIDAD', 'CASO_DERIVADO_CALIDAD',
      // Legacy cotización/comparativo
      'INVITACION_RECIBIDA', 'INVITACION_EXPIRADA', 'OFERTA_ENVIADA',
      'PROPUESTA_ACEPTADA', 'OFERTA_ACEPTADA', 'OFERTA_RECHAZADA',
      'OFERTA_GANADORA', 'OFERTA_NO_SELECCIONADA', 'CASO_OFERTAS_TODAS_RECHAZADAS',
      'CASO_SIN_OFERTAS_CERRADO', 'OFERTAS_COMPARATIVAS_LISTAS', 'PROPUESTA_GENERADA',
      'SOLICITUD_CAMBIO_FLUJO', 'SOLICITUD_CAMBIO_FLUJO_RECHAZADA',
      'CASO_PAUSADO', 'CASO_CANCELADO', 'CREACION', 'CASO_CREADO', 'CASO_COPIA',
    ],
    entrega: [
      'REVISION_ENVIADA', 'REVISION_SOLICITADA', 'TRABAJO_APROBADO',
      'REVISION_ENVIADA_CALIDAD', 'REVISION_SOLICITADA_CALIDAD', 'CALIDAD_CERTIFICADA',
      'COMENTARIO_TECNICO', 'REANUDADO',
    ],
    calificacion: [
      'CALIFICACION_ENVIADA',
      'CALIFICACION_ENVIADA_CALIDAD',
    ],
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

  const showDentistEvalBanner =
    (actingAsDentista || viewingAsAdmin) &&
    caseStatus === 'enEvaluacion' &&
    clinicalCase?.internalStatus !== POOL_INTERNAL_STATUS;
  const showDentistPendingStartBanner =
    (actingAsDentista || viewingAsAdmin) && caseStatus === 'aceptadaPendienteInicio';

  const viewerMaySeeOperationalDeadlineUch =
    actingAsDentista || viewingAsAdmin || uchViewerIsAssignedTechnician;
  const uchHeaderShowsWorkDeadline =
    !!clinicalCase?.workDeadline &&
    ['enEjecucion', 'enRevision', 'cambiosEnProceso', 'completado'].includes(
      caseStatus,
    ) &&
    (actingAsDentista || uchViewerIsAssignedTechnician);

  const showUchInlineDeadlineBanner =
    viewerMaySeeOperationalDeadlineUch &&
    ['enEjecucion', 'enRevision', 'cambiosEnProceso'].includes(caseStatus) &&
    !!clinicalCase?.workDeadline &&
    !uchHeaderShowsWorkDeadline;

  const reviewedDims: string[] = Array.isArray(clinicalCase?.myReviewedDimensions)
    ? clinicalCase.myReviewedDimensions
    : [];
  const canRate = actingAsDentista && !!uchAssignedId;
  const showRateDesignPanel =
    canRate &&
    caseStatus === 'completado' &&
    !reviewedDims.includes('design');
  const showQualityRatingPanel =
    actingAsCalidad &&
    caseStatus === 'completado' &&
    !reviewedDims.includes('quality');
  const showAnyRatingPanel = showRateDesignPanel || showQualityRatingPanel;

  const roleScopedEvents = useMemo(
    () =>
      events
        .filter((e) => {
          const visibleTo = (e.payload as any)?.visibleTo;

          if (visibleTo === 'sistema') return false;

          if (viewingAsAdmin) return true;

          // Calidad ve solo eventos de su circuito QA.
          if (actingAsCalidad) {
            const CALIDAD_ALLOWED = new Set([
              CASE_EVENTS.ASIGNACION_CALIDAD,
              CASE_EVENTS.CASO_DERIVADO_CALIDAD,
              CASE_EVENTS.REVISION_ENVIADA_CALIDAD,
              CASE_EVENTS.REVISION_SOLICITADA_CALIDAD,
              CASE_EVENTS.CALIDAD_CERTIFICADA,
              CASE_EVENTS.QUALITY_PLAZO_POR_VENCER,
              CASE_EVENTS.QUALITY_PLAZO_VENCIDO,
              CASE_EVENTS.CALIFICACION_ENVIADA_CALIDAD,
            ]);
            return CALIDAD_ALLOWED.has(e.action as any);
          }

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

            // Calificaciones del dentista: solo el técnico calificado (ganador) las ve.
            // Defensa en profundidad (el servidor ya filtra); fallback al técnico asignado
            // para eventos antiguos sin revieweeId.
            if (e.action === 'CALIFICACION_ENVIADA') {
              const revieweeId =
                ((e.payload as any)?.revieweeId as string | undefined) ??
                clinicalCase?.assignedTechnicianId ??
                null;
              return revieweeId != null && String(revieweeId) === String(selectedTechnicianId);
            }

            if (visibleTo === 'tecnico' && selectedTechnicianId) {
              // Eventos de la etapa QA (qualityScoped): el técnico asignado los ve siempre.
              // Espeja la misma excepción que caseEventsUchFilter.ts línea 72-74.
              if ((e.payload as any)?.qualityScoped) {
                return String(clinicalCase?.assignedTechnicianId) === String(selectedTechnicianId);
              }
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
          (actingAsTecnico &&
            (e.action === 'OFERTA_RECHAZADA' || e.action === 'OFERTA_RECHAZADA_POR_TECNICO')),
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

  // Re-entrega durante el bucle de Calidad: el caso sigue en `enRevisionCalidad` pero la
  // responsabilidad es del técnico (Calidad pidió ajustes). Debe poder volver a entregar.
  const isQualityAdjustmentByTech =
    caseStatus === 'enRevisionCalidad' && clinicalCase?.currentResponsibility === 'tecnico';
  const canTechSubmitDesignDelivery =
    actingAsTecnico &&
    (caseStatus === 'enEjecucion' || caseStatus === 'cambiosEnProceso' || isQualityAdjustmentByTech) &&
    clinicalCase?.assignedTechnicianId === currentUser?.id &&
    !!(clinicalCase?.workStartedAt || clinicalCase?.workDeadline);

  const handleQuoteSubmit = async () => {
    if (!myInvitation) return;
    setIsSubmittingQuote(true);
    const numericPrice = Number(quotePrice.replace(/\D/g, ''));
    if (!numericPrice || numericPrice <= 0) {
      setIsSubmittingQuote(false);
      showError('Ingresa un precio válido mayor a 0');
      return;
    }
    const res = await acceptAssignmentAction(myInvitation.id);
    setIsSubmittingQuote(false);
    if (res.success) {
      showSuccess('Asignación aceptada.');
      dispatchDashboardMetricsRefresh();
      await onInvitationUpdate?.();
    } else {
      showError(res.error || 'Error al aceptar la asignación');
    }
  };

  const comparativeLength = 0;

  const techInvitationPanel =
    !!myInvitation &&
    (
      (caseStatus === 'enEvaluacion' &&
        (myInvitation.status === 'pending' ||
          myInvitation.status === 'expired')) ||
      (caseStatus === 'aceptadaPendienteInicio' && myInvitation.status === 'accepted') ||
      (caseStatus === 'cerrado' && myInvitation.status === 'rejected')
    );

  const pendingDeliveryForReview = useMemo(() => {
    const deliveriesList =
      (clinicalCase?.deliveries as { id?: string; status?: string; files?: string[]; version?: number }[] | undefined) ?? [];
    return deliveriesList.find((d) => d.status === 'pending');
  }, [clinicalCase?.deliveries]);

  // Último rechazo del dentista — disponible para calidad en re-entregas post-ajuste.
  const lastDentistRejection = useMemo(() => {
    if (!actingAsCalidad || caseStatus !== 'enRevisionCalidad') return null;
    type Delivery = { id?: string; status?: string; reviewComment?: string; files?: string[] | unknown; version?: number };
    const deliveriesList = (clinicalCase?.deliveries as Delivery[] | undefined) ?? [];
    const rejected = deliveriesList
      .filter((d) => d.status === 'rejected' && d.reviewComment)
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    const d = rejected[0];
    if (!d?.id || !d.reviewComment) return null;
    return {
      deliveryId: d.id,
      version: d.version ?? 0,
      reason: d.reviewComment,
      files: Array.isArray(d.files) ? (d.files as string[]).filter(Boolean) : [],
    };
  }, [actingAsCalidad, caseStatus, clinicalCase?.deliveries]);

  const includeDelivery = canTechSubmitDesignDelivery;

  const includeCaseActions = computeIncludeCaseActionTimeline({
    actingAsDentista,
    actingAsTecnico,
    viewingAsAdmin,
    caseStatus,
    clinicalCase,
    currentUserId: currentUser?.id,
    myInvitation,
    comparativeLength,
    techInvitationPanel,
    includeDelivery,
    timelineEvents: filteredEvents as { action: string }[],
    proposalExpiresAt: clinicalCase?.proposalExpiresAt,
  });

  const primaryAction = useMemo(
    () => primaryUchActionId({ includeDelivery, includeCaseActions }),
    [includeDelivery, includeCaseActions],
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
      ? 'asignacion'
      : 'entrega';

  const phaseAllowsAction = (actionPhase: PhaseTab) =>
    phaseTab === 'todos' || phaseTab === actionPhase;

  const timelineRows = useMemo(
    () =>
      buildUchTimelineRows({
        events: filteredEvents as unknown as UchCaseEventLite[],
        includeContext: false,
        includeCaseActions: includeCaseActions && phaseAllowsAction(caseActionsPhase),
        includeDelivery: includeDelivery && phaseAllowsAction('entrega'),
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
      includeCaseActions,
      includeDelivery,
      primaryAction,
      comparativeLength,
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
    // El panel de entrega empieza colapsado para que el técnico lo abra explícitamente
    if (primaryAction !== 'delivery') {
      setActionExpanded((prev) => ({ ...prev, [primaryAction]: true }));
    }
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
    <>
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
              {shouldShowDesiredDeliveryInUch(caseStatus, clinicalCase?.workDeadline) &&
                clinicalCase?.desiredDeliveryAt && (
                <div className="mt-2">
                  <CaseDesiredDeliveryChip
                    value={clinicalCase.desiredDeliveryAt}
                    variant="compact"
                  />
                </div>
              )}
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
            {showReviewWindow && (
              <motion.div
                className="flex flex-col items-end gap-0.5"
                aria-label={actingAsTecnico && !actingAsDentista ? 'Plazo de revisión del dentista' : 'Plazo para revisar la entrega'}
                title="Plazo de revisión del dentista (tDentistReviewHours)"
              >
                <span className={`text-[8px] font-black uppercase tracking-widest ${reviewExpired ? 'text-error/80' : 'text-warning/70'}`}>
                  {actingAsTecnico && !actingAsDentista
                    ? (reviewExpired ? 'Esperando — plazo vencido' : 'Revisión del dentista')
                    : (reviewExpired ? 'Respuesta vencida' : 'Plazo para revisar')}
                </span>
                <motion.div
                  data-testid="uch-review-countdown"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${reviewExpired ? 'bg-error-hl border-error/20' : 'bg-warning-hl border-warning/20'}`}
                >
                  <Clock className={`w-3.5 h-3.5 shrink-0 ${reviewExpired ? 'text-error' : 'text-warning'}`} />
                  <span className={`text-[11px] font-mono font-black tabular-nums ${reviewExpired ? 'text-error' : 'text-warning'}`}>
                    {reviewExpired ? 'Vencido' : formatCountdownHMS(reviewRemainingMs)}
                  </span>
                </motion.div>
              </motion.div>
            )}
            {showQualityWindow && (
              <motion.div
                className="flex flex-col items-end gap-0.5"
                aria-label="Plazo de revisión de Calidad"
                title="Plazo de revisión de Calidad (tQualityReviewHours)"
              >
                <span className={`text-[8px] font-black uppercase tracking-widest ${qualityExpired ? 'text-error/80' : 'text-warning/70'}`}>
                  {actingAsTecnico && !actingAsCalidad
                    ? (qualityExpired ? 'Calidad — plazo vencido' : 'Revisión de Calidad')
                    : (qualityExpired ? 'Plazo vencido' : 'Plazo para certificar')}
                </span>
                <motion.div
                  data-testid="uch-quality-countdown"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${qualityExpired ? 'bg-error-hl border-error/20' : 'bg-warning-hl border-warning/20'}`}
                >
                  <Clock className={`w-3.5 h-3.5 shrink-0 ${qualityExpired ? 'text-error' : 'text-warning'}`} />
                  <span className={`text-[11px] font-mono font-black tabular-nums ${qualityExpired ? 'text-error' : 'text-warning'}`}>
                    {qualityExpired ? 'Vencido' : formatCountdownHMS(qualityRemainingMs)}
                  </span>
                </motion.div>
              </motion.div>
            )}
            {newMessageCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = 0;
                  onAcknowledgeNew?.();
                }}
                aria-label={`${newMessageCount} mensaje${newMessageCount === 1 ? '' : 's'} nuevo${newMessageCount === 1 ? '' : 's'} — ir al más reciente`}
                title="Ir a los mensajes nuevos"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary-hl border border-primary/30 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <ArrowUp className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-black tabular-nums">{newMessageCount}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide">Nuevo{newMessageCount === 1 ? '' : 's'}</span>
              </button>
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
                  compensation: myInvitation.compensation,
                  deadlineDays: myInvitation.deadlineDays,
                  deadlineHours: myInvitation.deadlineHours,
                  respondedAt: myInvitation.respondedAt ?? null,
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
                  {(['todos', 'asignacion', 'entrega', 'calificacion'] as PhaseTab[]).map((tab) => {
                    const labels: Record<PhaseTab, string> = {
                      todos: 'Todos',
                      asignacion: 'Asignación',
                      entrega: 'Entrega',
                      calificacion: 'Calificación',
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
                    <p className="text-[10px] text-faint mb-1">Ajuste requerido por el solicitante</p>
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

            {showAnyRatingPanel && (
              <div
                data-testid="uch-rating-panels"
                className="px-3 pt-2 pb-2 space-y-2 flex-shrink-0 border-b border-divider bg-background"
              >
                {showRateDesignPanel && uchAssignedId && (
                  <UchRatingPanel
                    caseId={caseId}
                    revieweeId={uchAssignedId}
                    dimension="design"
                    onRated={async () => { await onInvitationUpdate?.(); }}
                  />
                )}
                {showQualityRatingPanel && (
                  <UchRatingPanel
                    caseId={caseId}
                    dimension="quality"
                    onRated={async () => { await onInvitationUpdate?.(); }}
                  />
                )}
              </div>
            )}

            <div
              ref={scrollRef}
              data-testid="uch-timeline-scroll"
              className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 custom-scrollbar bg-background"
            >

              {/* Historial de rondas para calidad (Fase 3): visible solo para el revisor activo cuando hay más de una entrega. */}
              {actingAsCalidad && caseStatus === 'enRevisionCalidad' && ((clinicalCase?.deliveries as unknown[])?.length ?? 0) > 1 && (
                <QualityIterationHistory
                  deliveries={(clinicalCase?.deliveries as Parameters<typeof QualityIterationHistory>[0]['deliveries']) ?? []}
                  onViewDelivery={(deliveryId, version, files) =>
                    setViewer3DState({ deliveryId, version, files, readonly: true })
                  }
                />
              )}

              {/* Entrega certificada (v5.19): el técnico decide cuándo enviarla al dentista. */}
              {actingAsTecnico && uchViewerIsAssignedTechnician && caseStatus === 'certificadoCalidad' && (
                <UchSendToDentistPanel
                  delivery={pendingDeliveryForReview}
                  onSend={async () => {
                    const ok = await onActionTriggered?.('send_to_dentist');
                    return ok;
                  }}
                />
              )}
              {timelineRows.map((row) => {
                if (row.kind === 'action' && row.id === 'delivery') {
                  return (
                    <div key="uch-action-delivery" className="space-y-1">
                      <UchDeliveryPanel
                        caseId={caseId}
                        organizationId={clinicalCase?.organizationId}
                        qualityGateActive={!!clinicalCase?.qualityGateActive}
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
                        comparative={undefined}
                        currentUserId={currentUser?.id}
                        quotePrice={quotePrice}
                        setQuotePrice={setQuotePrice}
                        quoteDays={quoteDays}
                        setQuoteDays={setQuoteDays}
                        quoteFlatUnit={quoteFlatUnit}
                        setQuoteFlatUnit={setQuoteFlatUnit}
                        quoteNotes={quoteNotes}
                        setQuoteNotes={setQuoteNotes}
                        isSubmittingQuote={isSubmittingQuote}
                        isStartingWork={isStartingWork}
                        setIsStartingWork={setIsStartingWork}
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
                      onView3D={(deliveryId, version, files, dentistNote) =>
                        setViewer3DState({ deliveryId, version, files, dentistNote })
                      }
                      isPendingDelivery={(() => {
                        if (!pendingDeliveryForReview || !actingAsDentista || caseStatus !== 'enRevision') return false;
                        const p = (row.event.payload as Record<string, unknown> | undefined) ?? {};
                        // Match por deliveryId (eventos nuevos) o por versión (eventos legacy sin deliveryId)
                        if (p.deliveryId) return p.deliveryId === pendingDeliveryForReview.id;
                        return p.deliveryVersion === pendingDeliveryForReview.version;
                      })()}
                      onApproveDelivery={async () => {
                        setIsSubmittingReview(true);
                        try {
                          const ok = await onActionTriggered?.('approve_work', { comment: reviewComment });
                          if (ok) setReviewComment('');
                        } finally {
                          setIsSubmittingReview(false);
                        }
                      }}
                      onRequestRevisionDelivery={async () => {
                        if (!reviewComment.trim()) return;
                        setIsSubmittingRevision(true);
                        try {
                          const ok = await onActionTriggered?.('request_revision', { reason: reviewComment });
                          if (ok) setReviewComment('');
                        } finally {
                          setIsSubmittingRevision(false);
                        }
                      }}
                      reviewComment={reviewComment}
                      setReviewComment={setReviewComment}
                      isSubmittingReview={isSubmittingReview}
                      isSubmittingRevision={isSubmittingRevision}
                      caseId={caseId}
                      actingAsCalidad={actingAsCalidad}
                      qualityComment={qualityComment}
                      setQualityComment={setQualityComment}
                      isPendingQualityDelivery={(() => {
                        if (!pendingDeliveryForReview || !actingAsCalidad || caseStatus !== 'enRevisionCalidad') return false;
                        const p = (row.event.payload as Record<string, unknown> | undefined) ?? {};
                        if (p.deliveryId) return p.deliveryId === pendingDeliveryForReview.id;
                        return p.deliveryVersion === pendingDeliveryForReview.version;
                      })()}
                      onCertifyQuality={async (comment) => {
                        const ok = await onActionTriggered?.('certify_quality', { comment });
                        if (ok) setQualityComment('');
                        return ok;
                      }}
                      onQualityRequestChanges={async (reason) => {
                        const ok = await onActionTriggered?.('request_quality_revision', { reason });
                        if (ok) setQualityComment('');
                        return ok;
                      }}
                      onDeriveQuality={() => { onInvitationUpdate?.(); }}
                      dentistRejectionContext={lastDentistRejection ?? undefined}
                      onViewRejectedDelivery={(deliveryId, version, files) =>
                        setViewer3DState({ deliveryId, version, files, readonly: true })
                      }
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
                  <p className="text-xs font-black text-error leading-tight">Caso ya asignado a otro técnico</p>
                  <p className="text-[10px] text-faint mt-0.5">Solo lectura — puedes consultar el historial de asignaciones.</p>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
    {viewer3DState && (
      <DeliveryViewer3DModal
        isOpen
        onClose={() => setViewer3DState(null)}
        deliveryId={viewer3DState.deliveryId}
        deliveryVersion={viewer3DState.version}
        zipFiles={viewer3DState.files}
        caseId={caseId}
        caseNumber={clinicalCase?.caseNumber ?? ''}
        viewerRole={actingAsDentista ? 'dentista' : actingAsTecnico ? 'tecnico' : actingAsCalidad ? 'calidad' : 'admin'}
        dentistNote={viewer3DState.dentistNote}
        canReview={!!(actingAsDentista && caseStatus === 'enRevision' && pendingDeliveryForReview && !viewer3DState?.readonly)}
        canAnnotate={!!(
          !viewer3DState?.readonly &&
          ((actingAsDentista && caseStatus === 'enRevision' && pendingDeliveryForReview) ||
          (actingAsCalidad && caseStatus === 'enRevisionCalidad' && pendingDeliveryForReview))
        )}
        canReviewQuality={!!(actingAsCalidad && caseStatus === 'enRevisionCalidad' && pendingDeliveryForReview && !viewer3DState?.readonly)}
        onApprove={async () => {
          setIsSubmittingReview(true);
          try {
            const ok = await onActionTriggered?.('approve_work', { comment: reviewComment });
            if (ok) { setReviewComment(''); setViewer3DState(null); }
          } finally {
            setIsSubmittingReview(false);
          }
        }}
        onRequestRevision={async () => {
          if (!reviewComment.trim()) return;
          setIsSubmittingRevision(true);
          try {
            const ok = await onActionTriggered?.('request_revision', { reason: reviewComment });
            if (ok) { setReviewComment(''); setViewer3DState(null); }
          } finally {
            setIsSubmittingRevision(false);
          }
        }}
        reviewComment={reviewComment}
        setReviewComment={setReviewComment}
        isSubmittingReview={isSubmittingReview}
        isSubmittingRevision={isSubmittingRevision}
        qualityComment={qualityComment}
        setQualityComment={setQualityComment}
        onDownloadAll={handleDownloadAll}
        downloadingVersionId={downloadingVersionId}
        onCertifyQuality={async (comment) => {
          const ok = await onActionTriggered?.('certify_quality', { comment });
          if (ok) { setQualityComment(''); setViewer3DState(null); }
        }}
        onQualityRequestChanges={async (comment) => {
          if (!comment.trim()) return;
          const ok = await onActionTriggered?.('request_quality_revision', { reason: comment });
          if (ok) setViewer3DState(null);
        }}
        onDeriveQuality={() => { setViewer3DState(null); onInvitationUpdate?.(); }}
      />
    )}
    </>
  );
}
