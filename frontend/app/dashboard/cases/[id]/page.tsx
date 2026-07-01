'use client';

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  FileText,
  AlertCircle,
  Shield,
  Activity,
  Download,
  XCircle,
  Stethoscope,
  Trash2,
  Upload,
  RotateCcw,
  Globe,
} from 'lucide-react';
import { creationInstructionsText } from '@/lib/cases/instructions';
import { maybeGzipForUpload } from '@/lib/uploadCompression';
import {
  getCaseDetails,
  updateClinicalCaseAction,
  addTechnicalCommentAction,
  deleteClinicalCaseAction,
  getSignedUrlAction,
  getUploadUrlAction,
  submitReviewAction,
  approveWorkAction,
  requestRevisionAction,
  resolveFlowRequestAction,
  getCaseEventsAction,
  archiveCaseForUserAction,
  unarchiveCaseForUserAction,
  cloneCaseFromTerminalAction,
  publishCaseAction,
} from '@/lib/db/actions/cases';
import { getCaseDetailActionState } from '@/lib/cases/caseDetailActions';
import { isActiveCaseStatus, isTerminalCaseStatus } from '@/lib/constants/dental';
import CaseDetailManagementBar from '@/components/cases/CaseDetailManagementBar';
import RepublicarModal from '@/components/cases/RepublicarModal';
import PendingPoolBanner from '@/components/cases/PendingPoolBanner';
import CheckInDentistaModal from '@/components/cases/CheckInDentistaModal';
import { POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import { INTERNAL_CASE_STATUSES } from '@/lib/constants/dental';
import Link from 'next/link';
import { startWorkAction } from '@/lib/db/actions/proposal';
import {
  certifyQualityAction,
  requestQualityRevisionAction,
  sendToDentistAction,
} from '@/lib/db/actions/quality';
import { createAnnotationAction, deleteAnnotationAction } from '@/lib/db/actions/annotations';
import { registerFileAction, logFileDownloadAction, deleteCaseFileAction } from '@/lib/db/actions/files';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { logError } from '@/lib/logger';
import { SERVICE_TYPE_LABELS, SERVICE_TYPES, WORK_CATEGORY_LABELS, WORK_TYPE_LABELS } from '@/lib/constants/dental';
import {
  listVitaShadesAction,
  listRestorationTypesAction,
  listDentalMaterialsAction,
  listUrgencyLevelsAction,
  type CatalogOption,
} from '@/lib/db/actions/catalogs';
import { resolveListPriceAction } from '@/lib/db/actions/priceRules';
import DentalViewer3D from '@/components/DentalViewer3D';
import NewAnnotationOverlay from '@/components/cases/NewAnnotationOverlay';
import { TeethSelector } from '@/components/cases/TeethSelector';
import UnifiedCaseHub from '@/components/cases/UnifiedCaseHub';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import type { CaseViewerRole } from '@/lib/cases/qualityStatusMasking';
import CaseViewerStatusStripe from '@/components/cases/CaseViewerStatusStripe';
import type { InvitationStatusForKpi } from '@/lib/dashboard/classifyCaseForDashboardKpi';
import CaseWorkflowStepper from '@/components/cases/CaseWorkflowStepper';
import { DesiredDeliveryPicker } from '@/components/cases/DesiredDeliveryPicker';
import { CaseDesiredDeliveryReadOnly } from '@/components/cases/CaseDesiredDeliveryChip';
import { toLocalDatetimeValue } from '@/lib/desiredDelivery';
import {
  formatDesiredDeliveryForSummary,
  shouldShowListPriceToViewer,
} from '@/lib/cases/caseDeliveryPresentation';
import { CaseServiceTypeBadge, UchHubIcon } from '@/components/cases/CaseFichaHubAndServiceIcons';
import FocusTrap from '@/components/ui/FocusTrap';
import { checkProposalExpiryAction } from '@/lib/db/actions/proposal';
import { dispatchDashboardMetricsRefresh } from '@/lib/dashboard/dashboardRefresh';
import { getMyInvitationForCaseAction } from '@/lib/db/actions/invitations';
import type { InvitationItem } from '@/lib/db/actions/invitations';
import { getCaseHubReadStateAction, markCaseHubReadAction } from '@/lib/db/actions/hubRead';
import { countUnreadNegChannel, countUnreadTechChannel, filterOthersNegChannel, filterOthersTechChannel, type UchUnreadEvent } from '@/lib/uchUnread';
import { dispatchHubUnreadRefresh } from '@/lib/hubUnreadEvents';
import {
  responsibilityAttentionBump,
  isHubInboxSuppressedForCompletedCase,
} from '@/lib/caseResponsibilityAttention';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { normalizedAssignedTechnicianId } from '@/lib/caseViewUtils';
import { useDeadlineMs, useRemainingMsUntil, splitCountdownParts } from '@/lib/hooks/useRemainingUntil';
import { toDeadlineMs, type ServerClockAnchor } from '@/lib/deadlineMs';
import { mergeClinicalCaseUpdate } from '@/lib/clinicalCaseMerge';
import { caseNumberLabel, formatCaseIdAndPac } from '@/lib/cases/caseDisplay';
import { CASE_HUB_TOGGLE_EVENT, type CaseHubToggleDetail } from '@/lib/caseHubToggleEvent';

const TimeCounter = ({ createdAt }: { createdAt: string | Date }) => {
  const getLabel = () => formatDistanceToNow(new Date(createdAt), { locale: es });
  const [elapsed, setElapsed] = useState(getLabel);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(getLabel()), 60_000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return <span className="text-[10px] text-primary/80 font-mono tracking-normal shrink-0">hace {elapsed}</span>;
};

const DAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatCaseDateShort(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = DAYS_ES[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS_ES[d.getMonth()];
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${dd}/${mon}/${yy}, ${hh}:${mm}`;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

function strField(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseTeethFdi(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const t of raw) {
    const n = typeof t === 'number' ? t : typeof t === 'string' ? Number.parseInt(String(t).trim(), 10) : NaN;
    if (Number.isFinite(n)) out.push(n);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function clipText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** Filas del resumen previo a publicar (dentista confirma lo que verán los técnicos a nivel clínico). */
function buildPublishCaseSummaryRows(c: any | null): { label: string; value: string }[] {
  if (!c || c._error) return [];

  const urgencyEs: Record<string, string> = {
    baja: 'Baja',
    normal: 'Normal',
    alta: 'Alta',
    urgente: 'Urgente',
    prioritario: 'Prioritario',
  };
  const complexityEs: Record<string, string> = {
    basico: 'Básico',
    intermedio: 'Intermedio',
    avanzado: 'Avanzado',
    critico: 'Crítico',
  };

  const teeth = parseTeethFdi(c.teeth);
  const piezas = teeth.length ? teeth.join(', ') : '';

  const serviceKey = String(c.serviceType ?? '').toLowerCase();
  const service = serviceKey ? SERVICE_TYPE_LABELS[serviceKey] ?? strField(c.serviceType) : '';

  const urgencyRaw = String(c.urgency ?? '').toLowerCase();
  const urgency = urgencyRaw ? urgencyEs[urgencyRaw] ?? strField(c.urgency) : '';

  const cxRaw = String(c.caseComplexity ?? '').toLowerCase();
  const complexity = cxRaw ? complexityEs[cxRaw] ?? strField(c.caseComplexity) : '';

  const categoryLabel = c.derivedCategory
    ? (WORK_CATEGORY_LABELS[c.derivedCategory as keyof typeof WORK_CATEGORY_LABELS] ?? strField(c.derivedCategory))
    : '';
  const workTypeLabel = c.derivedWorkType
    ? (WORK_TYPE_LABELS[c.derivedWorkType] ?? strField(c.derivedWorkType))
    : '';

  const ponticLabel =
    c.replacesMissingTeeth === true ? 'Sí'
      : c.replacesMissingTeeth === false ? 'No'
        : '';

  const files = Array.isArray(c.files) ? c.files : [];
  const fileHint = files.length ? `${files.length} archivo${files.length === 1 ? '' : 's'}` : '';

  const rows: { label: string; value: string }[] = [
    { label: 'Nombre interno', value: strField(c.internalName) },
    { label: 'ID caso (DF)', value: strField(c.caseNumber) },
    { label: 'ID Paciente', value: strField(c.patientIdAnon) },
    { label: 'Tipo de servicio', value: service },
    { label: 'Restauración', value: strField(c.restorationType) },
    { label: 'Material', value: strField(c.material) },
    { label: 'Piezas', value: piezas },
    { label: 'Pónticos (reemplaza ausentes)', value: ponticLabel },
    { label: 'Categoría operativa', value: categoryLabel },
    { label: 'Tipo de trabajo', value: workTypeLabel },
    { label: 'Escala color', value: strField(c.shade) },
    { label: 'Complejidad', value: complexity },
    { label: 'Urgencia', value: urgency },
    { label: 'Entrega deseada', value: formatDesiredDeliveryForSummary(c.desiredDeliveryAt) },
    { label: 'Archivos', value: fileHint },
  ];

  const listSale = c.listPriceSale != null ? parseFloat(String(c.listPriceSale)) : NaN;
  if (Number.isFinite(listSale) && listSale > 0) {
    rows.push({ label: 'Precio de referencia', value: formatCurrency(listSale) });
  }

  const si = strField(c.specialInstructions);
  const dn = strField(c.doctorNotes);
  if (si && dn && dn !== si) rows.push({ label: 'Notas clínicas', value: clipText(dn, 220) });

  const ch = strField(c.changeSummary);
  if (ch) rows.push({ label: 'Resumen de cambios', value: clipText(ch, 220) });

  return rows.filter(r => r.value.length > 0);
}

function CaseDetailPageContent() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openHubAppliedRef = useRef(false);
  /** Evita reabrir el UCH en cada refetch cuando el técnico ya es ganador (cerrar debe persistir). */
  const techWinnerHubAutoOpenRef = useRef(false);
  const calidadHubAutoOpenRef = useRef(false);
  const { user, userProfile: authUserProfile, isSimulating } = useAuth();
  const { showSuccess: showSuccessToastMessage, showError: showErrorToast } = useToast();
  const userRole = authUserProfile?.role;
  /** Admin real (sin simulación): supervisión con estado canónico del caso. */
  const viewingAsAdmin = userRole === 'admin' && !isSimulating;
  const actingAsDentista = userRole === 'dentista';
  const actingAsTecnico = userRole === 'tecnico';
  const showCaseToolbar = actingAsDentista || viewingAsAdmin;

  const sessionUserId =
    (user as { id?: string; sub?: string } | null)?.id ?? (user as { sub?: string } | null)?.sub ?? null;
  const profileUserId = authUserProfile?.id ?? null;

  const [clinicalCase, setClinicalCase] = useState<any | null>(null);
  const clinicalCaseRef = useRef<any>(null);
  clinicalCaseRef.current = clinicalCase;
  const authSessionSnapRef = useRef<{ user: typeof user; authUserProfile: typeof authUserProfile }>({
    user: null,
    authUserProfile: null,
  });
  authSessionSnapRef.current = { user, authUserProfile };
  const [serverClockAnchor, setServerClockAnchor] = useState<ServerClockAnchor | null>(null);

  const ingestCasePayloadFromServer = useCallback((raw: any) => {
    if (!raw || raw._error) {
      setClinicalCase(raw);
      setServerClockAnchor(null);
      return;
    }
    const serverNowMs = (raw as any).serverNowMs as number | undefined;
    const { serverNowMs: _ignored, ...rest } = raw as any;
    if (typeof serverNowMs === 'number' && Number.isFinite(serverNowMs)) {
      setServerClockAnchor({ serverNowMs, clientPerfAtFetch: performance.now() });
    } else {
      setServerClockAnchor(null);
    }
    setClinicalCase((prev: any) => mergeClinicalCaseUpdate(prev, rest));
  }, []);

  useEffect(() => {
    setServerClockAnchor(null);
  }, [id]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const setActionLoading = (v: boolean, key = 'generic') => setLoadingAction(v ? key : null);

  // Estados para el visor 3D y Archivos
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [visibleSubtypes, setVisibleSubtypes] = useState<Set<string>>(new Set());
  const [layerOpacity, setLayerOpacity] = useState<Record<string, number>>({});

  // Anotaciones
  const [selectedCoords, setSelectedCoords] = useState<{ x: number, y: number, z: number } | null>(null);
  const [localAnnotations, setLocalAnnotations] = useState<any[]>([]);

  // Catálogos UI desde DB
  const [vitaShades, setVitaShades] = useState<CatalogOption[]>([]);
  const [restorationTypes, setRestorationTypes] = useState<CatalogOption[]>([]);
  const [dentalMaterials, setDentalMaterials] = useState<CatalogOption[]>([]);
  const [urgencyLevels, setUrgencyLevels] = useState<CatalogOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [shades, restorations, materials, urgencies] = await Promise.all([
        listVitaShadesAction(),
        listRestorationTypesAction(),
        listDentalMaterialsAction(),
        listUrgencyLevelsAction(),
      ]);
      if (cancelled) return;
      setVitaShades(shades);
      setRestorationTypes(restorations);
      setDentalMaterials(materials);
      setUrgencyLevels(urgencies);
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Staging local de la edición de borrador (Opción B, transaccional).
   * No se toca GCS ni DB hasta que el usuario presiona "Grabar"; "Cancelar" lo descarta todo.
   */
  type StagedFileAdd = {
    tempId: string;
    file: File;
    category: 'scan' | 'design_upload' | 'complementary';
    subType: string;
    previewUrl: string;
    filename: string;
    size: number;
    mimeType: string;
  };
  type StagedAnnotationAdd = {
    tempId: string;
    text: string;
    coordinates: { x: number; y: number; z: number };
    createdAt: string;
  };
  const [stagedFileAdds, setStagedFileAdds] = useState<StagedFileAdd[]>([]);
  const [stagedFileRemovals, setStagedFileRemovals] = useState<Set<string>>(new Set());
  const [stagedAnnotationAdds, setStagedAnnotationAdds] = useState<StagedAnnotationAdd[]>([]);
  const [stagedAnnotationRemovals, setStagedAnnotationRemovals] = useState<Set<string>>(new Set());
  const [newAnnotationText, setNewAnnotationText] = useState('');
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isDownloadingCase, setIsDownloadingCase] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  // Cumplimiento legal (Ley 21.719 / Ley 20.584): declaración del dentista de contar con el
  // consentimiento del paciente, requerida para publicar. Se reinicia cada vez que se abre el modal.
  const [patientConsentChecked, setPatientConsentChecked] = useState(false);
  // v5.0 — pendiente_pool / republicar (modelo de disponibilidad).
  const [republicarOpen, setRepublicarOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInDismissed, setCheckInDismissed] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [, setIsUploading] = useState(false);
  const [, setIsSavingLabNotes] = useState(false);
  const [labNotes, setLabNotes] = useState('');
  const [isHubOpen, setIsHubOpen] = useState(false);
  /** Tras abrir el Centro de control una vez, el panel permanece montado (oculto al cerrar) para no reiniciar cuentas regresivas. */
  const [uchPanelMounted, setUchPanelMounted] = useState(false);
  const [caseEvents, setCaseEvents] = useState<any[]>([]);
  const [viewerSignedImage, setViewerSignedImage] = useState<string | null>(null);
  /** Cursores de lectura del Centro de control (servidor). */
  const [hubServerReads, setHubServerReads] = useState<{
    lastReadTech: Date | null;
    lastReadNeg: Date | null;
  } | null>(null);
  /** Hay más eventos en BD anteriores al lote cargado (paginación UCH). */
  const [uchHasMoreOlder, setUchHasMoreOlder] = useState(false);
  const [myInvitation, setMyInvitation] = useState<InvitationItem | null>(null);
  const [, setIsLoadingEvents] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any | null>(null);
  const [savingChanges, setSavingChanges] = useState(false);
  const [draftListPriceSale, setDraftListPriceSale] = useState<number | null>(null);
  const [draftListPriceChecked, setDraftListPriceChecked] = useState(false);

  const [revisionNotes, setRevisionNotes] = useState('');
  const [, setIsRequestingFlowChange] = useState(false);
  const [flowChangeReason, setFlowChangeReason] = useState('');
  const [flowChangeType, setFlowChangeType] = useState<'pausa' | 'cancelacion' | null>(null);
  const [technicalComment, setTechnicalComment] = useState('');
  const [pendingDeliveryFiles, setPendingDeliveryFiles] = useState<File[]>([]);
  const [, setIsUploadingDelivery] = useState(false);

  const [userRating, setUserRating] = useState(0);
  const [userReview, setUserReview] = useState('');

  const evalDeadlineMs = useDeadlineMs(clinicalCase?.evaluationExpiresAt);
  const evalRemaining = useRemainingMsUntil(evalDeadlineMs, serverClockAnchor);
  const evalExpired = evalDeadlineMs != null && evalRemaining === 0;
  const { hours: evalH, minutes: evalM, seconds: evalS } = splitCountdownParts(
    evalRemaining < 0 ? 0 : evalRemaining,
  );

  const proposalDeadlineMs = useMemo(
    () => toDeadlineMs(clinicalCase?.proposalExpiresAt),
    [
      clinicalCase?.proposalExpiresAt == null
        ? 0
        : typeof clinicalCase.proposalExpiresAt === 'string'
          ? clinicalCase.proposalExpiresAt
          : clinicalCase.proposalExpiresAt instanceof Date
            ? clinicalCase.proposalExpiresAt.getTime()
            : 0,
    ],
  );

  // v5.0 — Etapa 3: plazo de revisión del dentista (lo computa getCaseDetails con la config).
  const reviewDeadlineMs = useMemo(
    () => toDeadlineMs(clinicalCase?.reviewDeadlineAt),
    [
      clinicalCase?.reviewDeadlineAt == null
        ? 0
        : typeof clinicalCase.reviewDeadlineAt === 'string'
          ? clinicalCase.reviewDeadlineAt
          : clinicalCase.reviewDeadlineAt instanceof Date
            ? clinicalCase.reviewDeadlineAt.getTime()
            : 0,
    ],
  );

  // v5.19 — SLA de la etapa de Calidad (lo computa getCaseDetails con la config anclada).
  const qualityReviewDeadlineMs = useMemo(
    () => toDeadlineMs(clinicalCase?.qualityReviewDeadlineAt),
    [
      clinicalCase?.qualityReviewDeadlineAt == null
        ? 0
        : typeof clinicalCase.qualityReviewDeadlineAt === 'string'
          ? clinicalCase.qualityReviewDeadlineAt
          : clinicalCase.qualityReviewDeadlineAt instanceof Date
            ? clinicalCase.qualityReviewDeadlineAt.getTime()
            : 0,
    ],
  );

  const assignedTechnicianIdStr = useMemo(
    () => normalizedAssignedTechnicianId(clinicalCase),
    [clinicalCase?.assignedTechnicianId],
  );
  const viewerIdStr = authUserProfile?.id ? String(authUserProfile.id) : null;

  // v5.19 — El viewer es el revisor de Calidad asignado (active) o el destino de una
  // derivación pendiente (pending_derivation) que aún no ha aceptado.
  const actingAsCalidad =
    String(userRole) === 'calidad' &&
    !!viewerIdStr &&
    (
      (clinicalCase?.qualityReviewerId != null && String(clinicalCase.qualityReviewerId) === viewerIdStr) ||
      !!clinicalCase?.hasPendingDerivationForMe
    );

  // Rol del viewer para presentación de estado (enmascara la etapa de Calidad al dentista).
  const viewerRole: CaseViewerRole = viewingAsAdmin
    ? 'admin'
    : actingAsCalidad
      ? 'calidad'
      : actingAsTecnico
        ? 'tecnico'
        : 'dentista';

  const techOfferRejectedView = useMemo(() => {
    if (viewingAsAdmin || !actingAsTecnico || !viewerIdStr) return false;
    if (assignedTechnicianIdStr === viewerIdStr) return false;
    const otherWon = assignedTechnicianIdStr != null && assignedTechnicianIdStr !== viewerIdStr;
    const invitationRejected = myInvitation?.status === 'rejected';
    return otherWon || invitationRejected;
  }, [viewingAsAdmin, actingAsTecnico, viewerIdStr, assignedTechnicianIdStr, myInvitation?.status]);

  const uchPresentationRole = useMemo<'dentista' | 'tecnico' | undefined>(() => {
    if (viewingAsAdmin) return 'dentista';
    return undefined;
  }, [viewingAsAdmin]);

  // --- LOGICA DE EVENTOS (UCH) ---
  const mergeUchEventsChronological = (olderBatch: any[], current: any[]) => {
    const byId = new Map<string, any>();
    for (const e of olderBatch) {
      if (e?.id) byId.set(String(e.id), e);
    }
    for (const e of current) {
      if (e?.id) byId.set(String(e.id), e);
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || String(a.id).localeCompare(String(b.id)),
    );
  };

  const loadCaseEvents = async () => {
    try {
      setIsLoadingEvents(true);
      const { events, hasMoreOlder, viewerSignedImage: vsi } = await getCaseEventsAction(id as string);
      setCaseEvents(events);
      setUchHasMoreOlder(hasMoreOlder);
      if (vsi) setViewerSignedImage(vsi);
      lastEventCountRef.current = events.length;
    } catch (err) {
      console.error("Error loading events:", err);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const loadOlderUchEvents = async (beforeEventId: string) => {
    const { events: older, hasMoreOlder } = await getCaseEventsAction(id as string, undefined, {
      beforeId: beforeEventId,
    });
    setCaseEvents((prev) => mergeUchEventsChronological(older, prev));
    setUchHasMoreOlder(hasMoreOlder);
  };

  /**
   * Recarga eventos al abrir el hub solo si todavía no se cargaron en el fetch inicial.
   * Antes esto refetcheaba siempre que isHubOpen pasaba a true, duplicando el trabajo del
   * fetch principal (que ya trae los eventos en paralelo con getCaseDetails).
   */
  const eventsLoadedForCaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (caseEvents.length > 0 && clinicalCase?.id) {
      eventsLoadedForCaseRef.current = String(clinicalCase.id);
    }
  }, [caseEvents.length, clinicalCase?.id]);
  useEffect(() => {
    if (!isHubOpen) return;
    const caseIdStr = String(id ?? '');
    if (eventsLoadedForCaseRef.current === caseIdStr) return;
    loadCaseEvents();
  }, [isHubOpen, id]);

  const handleHubAction = async (action: string, data?: any): Promise<boolean> => {
    try {
      if (action === 'start_work') {
        const res = await startWorkAction(id as string);
        if (!res?.success) {
          showErrorToast((res as any)?.error || 'No se pudo iniciar el trabajo');
          return false;
        }
        showSuccessToastMessage("Trabajo iniciado formalmente");
      } else if (action === 'approve_work') {
        const comment = typeof data?.comment === 'string' ? data.comment : '';
        const res = await approveWorkAction(id as string, comment);
        if (res && (res as any).success === false) {
          showErrorToast((res as any).error || 'Error al aprobar diseño');
          return false;
        }
        showSuccessToastMessage('Diseño aprobado');
      } else if (action === 'submit_delivery') {
        // UCH ya hizo el upload y provee los paths resultantes
        const filePaths: string[] = data.filePaths || [];
        const res = await submitReviewAction(id as string, data.notes || '', filePaths);
        if (res?.success) {
          showSuccessToastMessage('Entrega enviada para revisión');
        } else {
          const msg = (res as { error?: string } | undefined)?.error || 'Error al enviar entrega';
          showErrorToast(msg);
          return false;
        }
      } else if (action === 'request_revision') {
        const reason = data?.reason || '';
        if (!reason.trim()) {
          showErrorToast("Indica qué ajustes necesitas antes de enviar.");
          return false;
        }
        const attachments: File[] = Array.isArray(data?.attachments) ? data.attachments : [];
        if (attachments.length > 0) {
          try {
            await uploadComplementaryFiles(attachments, 'revision_reference');
          } catch (uploadErr: any) {
            showErrorToast(uploadErr.message || 'Error al subir adjuntos');
          }
        }
        const res = await requestRevisionAction(id as string, reason);
        if (res.success) {
          showSuccessToastMessage('Ajustes solicitados al técnico');
        } else {
          showErrorToast((res as any)?.error || 'Error al solicitar revisión');
          return false;
        }
      } else if (action === 'certify_quality') {
        const comment = typeof data?.comment === 'string' ? data.comment : '';
        const res = await certifyQualityAction(id as string, comment);
        if (!res?.success) {
          showErrorToast((res as any)?.error || 'Error al certificar la entrega');
          return false;
        }
        showSuccessToastMessage('Entrega certificada. El técnico ya puede enviarla.');
      } else if (action === 'request_quality_revision') {
        const reason = data?.reason || '';
        if (!reason.trim()) {
          showErrorToast('Indica qué ajustes necesita la entrega antes de certificar.');
          return false;
        }
        const qualityAttachments: File[] = Array.isArray(data?.attachments) ? data.attachments : [];
        if (qualityAttachments.length > 0) {
          try {
            await uploadComplementaryFiles(qualityAttachments, 'quality_reference');
          } catch (uploadErr: any) {
            showErrorToast(uploadErr.message || 'Error al subir adjuntos');
          }
        }
        const res = await requestQualityRevisionAction(id as string, reason);
        if (!res?.success) {
          showErrorToast((res as any)?.error || 'Error al solicitar ajustes');
          return false;
        }
        showSuccessToastMessage('Ajustes solicitados al técnico');
      } else if (action === 'send_to_dentist') {
        const res = await sendToDentistAction(id as string);
        if (!res?.success) {
          showErrorToast((res as any)?.error || 'Error al enviar al solicitante');
          return false;
        }
        showSuccessToastMessage('Entrega enviada al solicitante');
      } else if (action === 'rate_work') {
        showSuccessToastMessage("Funcionalidad de valoración en desarrollo.");
      } else if (action === 'resolve_flow') {
        await resolveFlowRequestAction(id as string, data.approved);
        showSuccessToastMessage(data.approved ? "Solicitud aprobada" : "Solicitud rechazada");
      }
      // Refrescar datos
      const updatedCase = await getCaseDetails(id as string);
      if (updatedCase && !(updatedCase as any)._error) ingestCasePayloadFromServer(updatedCase);
      await loadCaseEvents();
      dispatchDashboardMetricsRefresh();
      return true;
    } catch (err) {
      console.error("Error in Hub action:", err);
      showErrorToast("No se pudo procesar la acción");
      return false;
    }
  };
  const unreadTechMessages = useMemo(() => {
    if (!caseEvents?.length || !authUserProfile?.id || !hubServerReads) return 0;
    return countUnreadTechChannel(caseEvents as UchUnreadEvent[], authUserProfile.id, hubServerReads.lastReadTech);
  }, [caseEvents, authUserProfile?.id, hubServerReads]);

  const unreadNegotiationMessages = useMemo(() => {
    if (!caseEvents?.length || !authUserProfile?.id || !hubServerReads) return 0;
    return countUnreadNegChannel(caseEvents as UchUnreadEvent[], authUserProfile.id, hubServerReads.lastReadNeg);
  }, [caseEvents, authUserProfile?.id, hubServerReads]);

  useEffect(() => {
    if (!isHubOpen || !id) return;
    if (clinicalCase?.id && String(clinicalCase.id) !== String(id)) return;
    const now = new Date();
    setHubServerReads({ lastReadTech: now, lastReadNeg: now });
    // Persistir y avisar a la campana/listados para que descuenten al instante.
    void markCaseHubReadAction(id as string).then(() => dispatchHubUnreadRefresh());
  }, [isHubOpen, id, clinicalCase?.id]);

  /** Reconoce los mensajes entrantes mostrados con el UCH abierto: re-marca leído y sincroniza. */
  const acknowledgeNewHubMessages = useCallback(() => {
    if (!id) return;
    const now = new Date();
    setHubServerReads({ lastReadTech: now, lastReadNeg: now });
    void markCaseHubReadAction(id as string).then(() => dispatchHubUnreadRefresh());
  }, [id]);

  /**
   * Polling adaptativo de eventos (no hay realtime). Intervalo base 30s; sube a 60s
   * tras 3 polls consecutivos sin eventos nuevos, vuelve a 30s cuando llegan eventos.
   * Pausa en pestaña oculta para no consumir recursos; se limpia al cerrar/cambiar de caso.
   */
  const pollEmptyCountRef = useRef(0);
  const lastEventCountRef = useRef(0);
  useEffect(() => {
    if (!isHubOpen || !id) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const poll = async () => {
      if (!active) return;
      const prevCount = lastEventCountRef.current;
      await loadCaseEvents();
      const newCount = lastEventCountRef.current;
      if (newCount === prevCount) {
        pollEmptyCountRef.current += 1;
      } else {
        pollEmptyCountRef.current = 0;
      }
      if (!active) return;
      const delay = pollEmptyCountRef.current >= 3 ? 60_000 : 30_000;
      timeoutId = setTimeout(poll, delay);
    };

    const stop = () => {
      active = false;
      if (timeoutId != null) { clearTimeout(timeoutId); timeoutId = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (timeoutId == null && active) timeoutId = setTimeout(poll, 30_000);
      } else {
        if (timeoutId != null) { clearTimeout(timeoutId); timeoutId = null; }
      }
    };

    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      timeoutId = setTimeout(poll, 30_000);
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
    // loadCaseEvents lee `id` (estable) y solo usa setters; deps mínimas evitan reiniciar el poll cada render.
  }, [isHubOpen, id]);

  /**
   * Detecta mensajes nuevos del otro rol y avisa con un toast mientras el UCH está abierto.
   * Funciona para cualquier recarga (polling o acción). Excluye eventos propios → sin falsos positivos.
   */
  const lastOtherMaxMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!authUserProfile?.id) return;
    const others = [
      ...filterOthersTechChannel(caseEvents as UchUnreadEvent[], String(authUserProfile.id)),
      ...filterOthersNegChannel(caseEvents as UchUnreadEvent[], String(authUserProfile.id)),
    ];
    const maxMs = others.reduce((m, e) => Math.max(m, new Date(e.createdAt).getTime() || 0), 0);
    const prev = lastOtherMaxMsRef.current;
    lastOtherMaxMsRef.current = maxMs;
    if (prev === null) return; // primer cálculo: solo fija la línea base, sin avisar
    if (maxMs > prev && isHubOpen) {
      showSuccessToastMessage('Nuevo mensaje en este caso');
    }
  }, [caseEvents, authUserProfile?.id, isHubOpen, showSuccessToastMessage]);

  useEffect(() => {
    openHubAppliedRef.current = false;
    techWinnerHubAutoOpenRef.current = false;
    calidadHubAutoOpenRef.current = false;
    setIsHubOpen(false);
    setHubServerReads(null);
    setUchPanelMounted(false);
    setIsDeleting(false);
    setDeleteInput('');
    lastOtherMaxMsRef.current = null;
  }, [id]);

  useEffect(() => {
    techWinnerHubAutoOpenRef.current = false;
    calidadHubAutoOpenRef.current = false;
  }, [profileUserId]);

  useEffect(() => {
    if (isHubOpen) setUchPanelMounted(true);
  }, [isHubOpen]);

  useEffect(() => {
    if (openHubAppliedRef.current) return;
    if (searchParams.get('openHub') !== '1' || !id) return;
    openHubAppliedRef.current = true;
    setIsHubOpen(true);
    router.replace(`/dashboard/cases/${id}`, { scroll: false });
  }, [searchParams, id, router]);

  const toggleCaseHubOpen = useCallback(() => {
    setIsHubOpen((open) => !open);
  }, []);

  useEffect(() => {
    const onToggleFromList = (ev: Event) => {
      const d = (ev as CustomEvent<CaseHubToggleDetail>).detail;
      if (!d?.caseId || String(d.caseId) !== String(id)) return;
      setIsHubOpen((open) => !open);
    };
    window.addEventListener(CASE_HUB_TOGGLE_EVENT, onToggleFromList);
    return () => window.removeEventListener(CASE_HUB_TOGGLE_EVENT, onToggleFromList);
  }, [id]);

  useEffect(() => {
    const fetchData = async () => {
      const caseIdStr = String(id ?? '');
      const { user: u, authUserProfile: prof } = authSessionSnapRef.current;
      const sameCaseAlreadyShown =
        clinicalCaseRef.current?.id != null && String(clinicalCaseRef.current.id) === caseIdStr;

      // Cambiar de pestaña refresca el objeto `session.user` de NextAuth y antes disparaba este efecto
      // con `loading=true` aunque el caso ya estaba en pantalla; solo bloqueamos UI en carga inicial o cambio de ruta.
      if (!sameCaseAlreadyShown) {
        setLoading(true);
        setHubServerReads(null);
      }

      try {
        if (!u || !prof) {
          return;
        }

        // 1. Obtener Caso desde PostgreSQL
        const c = await getCaseDetails(caseIdStr);

        // S3-03: Verificación lazy de propuesta expirada
        if (c?.status === 'propuestaLista') {
          await checkProposalExpiryAction(caseIdStr);
        }

        ingestCasePayloadFromServer(c);

        // Si el caso no existe, tiene error o no tiene ID válido → redirigir al dashboard
        if (!c || c._error || !c.id) {
          console.warn('[CaseDetail] Caso no encontrado o error:', c?._error);
          router.replace('/dashboard?error=case_not_found');
          return;
        }


        setLocalAnnotations(c.annotations || []);
        setLabNotes(c.labNotes || '');
        setEditForm({
          internalName: c.internalName,
          patientIdAnon: c.patientIdAnon || '',
          urgency: c.urgency ?? '',
          teeth: (c.teeth as number[]) || [],
          // El edit form persiste codes/business_keys, no labels (los selects usan code como value).
          restorationType: c.restorationTypeCode ?? '',
          material: c.materialCode ?? '',
          shade: c.shadeCode ?? '',
          notesEsthetic: c.notesEsthetic || '',
          notesOclusal: c.notesOclusal || '',
          doctorNotes: (c.specialInstructions ?? c.doctorNotes) || '',
          desiredDeliveryAt: toLocalDatetimeValue(c.desiredDeliveryAt),
          status: c.status,
          serviceType: c.serviceType,
          replacesMissingTeeth: c.replacesMissingTeeth ?? null,
        });

        // 2. Las URLs firmadas se resuelven en un useEffect aparte (no bloquean el spinner).

        // 3. Eventos del hub + estado de lectura + invitación (todas independientes → paralelo)
        setIsLoadingEvents(true);
        const fetchAsTecnico = prof.role === 'tecnico';
        const [evPage, rs, invRes] = await Promise.all([
          getCaseEventsAction(caseIdStr),
          getCaseHubReadStateAction(caseIdStr),
          fetchAsTecnico ? getMyInvitationForCaseAction(caseIdStr) : Promise.resolve(null),
        ]);
        setCaseEvents(evPage.events || []);
        setUchHasMoreOlder(evPage.hasMoreOlder);
        if (evPage.viewerSignedImage) setViewerSignedImage(evPage.viewerSignedImage);
        setIsLoadingEvents(false);

        if (rs) {
          setHubServerReads({
            lastReadTech: rs.lastReadTechHubAt ? new Date(rs.lastReadTechHubAt) : null,
            lastReadNeg: rs.lastReadNegHubAt ? new Date(rs.lastReadNegHubAt) : null,
          });
        } else {
          setHubServerReads({ lastReadTech: null, lastReadNeg: null });
        }

        // 4. Invitación del técnico (si aplica)
        if (fetchAsTecnico && invRes) {
          const inv = invRes.data;
          setMyInvitation(inv);
          // Solo auto-abrir una vez por carga/viewer: refetch no debe anular un cierre manual del hub.
          if (
            !techWinnerHubAutoOpenRef.current &&
            normalizedAssignedTechnicianId(c) === String(prof.id) &&
            c?.status !== 'publicado' &&
            c?.status !== 'enEvaluacion'
          ) {
            techWinnerHubAutoOpenRef.current = true;
            setIsHubOpen(true);
          }
        }

        // Auto-abrir hub para Calidad cuando el caso está en etapa de revisión de Calidad.
        if (
          !calidadHubAutoOpenRef.current &&
          prof.role === 'calidad' &&
          c?.status === 'enRevisionCalidad'
        ) {
          calidadHubAutoOpenRef.current = true;
          setIsHubOpen(true);
        }
      } catch (err) {
        logError('Error fetching case detail', err, { caseId: id });
      } finally {
        const snap = authSessionSnapRef.current;
        if (!snap.user) setLoading(false);
        else if (snap.authUserProfile) setLoading(false);
      }
    };
    void fetchData();
  }, [id, sessionUserId, profileUserId, router, ingestCasePayloadFromServer]);

  // Firma de URLs GCS en background: corre en cuanto cambia el listado de archivos del caso,
  // sin bloquear el cierre del spinner "Sincronizando expediente". El visor 3D y la lista de
  // descargas muestran su propio estado vacío hasta que llegan las URLs.
  useEffect(() => {
    const files = clinicalCase?.files as any[] | undefined;
    const caseIdStr = String(id ?? '');
    if (!files?.length) return;
    let cancelled = false;

    (async () => {
      const viewerUrls: Record<string, string> = {};
      const allUrls: Record<string, string> = {};
      const initialVisible = new Set<string>();

      await Promise.all(files.map(async (file: any) => {
        try {
          const signedUrl = await getSignedUrlAction(file.gcsPath);
          if (!signedUrl) return;
          allUrls[file.id] = signedUrl;
          if (file.category === 'scan' || file.category === 'design' || file.category === 'design_upload') {
            const subType = file.subType || 'default';
            viewerUrls[subType] = signedUrl;
            if (subType === 'superior' || subType === 'inferior') {
              initialVisible.add(subType);
            }
          }
        } catch (err) {
          logError('Error getting signed URL', err, { caseId: caseIdStr, filename: file.filename });
        }
      }));

      if (cancelled) return;

      setFileUrls(viewerUrls);
      setDownloadUrls(allUrls);
      setVisibleSubtypes(prev => {
        if (prev.size > 0) return prev;
        if (initialVisible.size > 0) return initialVisible;
        const firstKey = Object.keys(viewerUrls)[0];
        return firstKey ? new Set([firstKey]) : prev;
      });
    })();

    return () => { cancelled = true; };
  }, [id, clinicalCase?.id, clinicalCase?.files]);

  const handleSaveAnnotation = async () => {
    if (!selectedCoords || !newAnnotationText.trim() || !user || !clinicalCase) return;

    const coords = {
      x: Number(selectedCoords.x.toFixed(4)),
      y: Number(selectedCoords.y.toFixed(4)),
      z: Number(selectedCoords.z.toFixed(4))
    };

    // Staging local — se persiste recién al pulsar "Grabar".
    const staged: StagedAnnotationAdd = {
      tempId: `staged-anno-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: newAnnotationText,
      coordinates: coords,
      createdAt: new Date().toISOString(),
    };
    setStagedAnnotationAdds(prev => [staged, ...prev]);
    setSelectedCoords(null);
    setNewAnnotationText('');
    showSuccessToastMessage('Anotación pendiente — usa Grabar para confirmar');
  };

  const handleSaveChanges = async (): Promise<boolean> => {
    if (!editForm || !clinicalCase || !user) return false;

    // Validación: el caso debe quedar con al menos un archivo tras grabar.
    if (clinicalCase.status === 'borrador') {
      const existingKept = ((clinicalCase.files ?? []) as any[])
        .filter((f: any) => !stagedFileRemovals.has(f.id) && f.category !== 'complementary').length;
      const stagedClinical = stagedFileAdds.filter(s => s.category !== 'complementary').length;
      const finalFileCount = existingKept + stagedClinical;
      if (finalFileCount < 1) {
        showErrorToast('El caso debe tener al menos un archivo clínico.');
        return false;
      }
    }

    setSavingChanges(true);
    try {
      const uploaderId = user.id || (user as any).uid;

      // 1) Subir archivos staged a GCS y registrar en DB.
      for (const staged of stagedFileAdds) {
        const folder = staged.category === 'design_upload' ? 'design' : staged.category === 'complementary' ? 'complementary' : 'scans';
        const gcsPath = `organizations/${clinicalCase.organizationId}/cases/${id}/${folder}/${Date.now()}_${staged.filename}`;

        const { body: uploadBody, contentEncoding } = await maybeGzipForUpload(staged.file);
        const uploadUrl = await getUploadUrlAction(
          gcsPath,
          staged.mimeType,
          contentEncoding ? { contentEncoding } : undefined,
        );
        if (!uploadUrl) throw new Error(`No se pudo obtener URL de subida para ${staged.filename}`);

        const res = await fetch(uploadUrl, {
          method: 'PUT',
          body: uploadBody,
          headers: {
            'Content-Type': staged.mimeType,
            ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
          },
        });
        if (!res.ok) throw new Error(`Fallo en la subida de ${staged.filename}`);

        await registerFileAction({
          caseId: id as string,
          organizationId: clinicalCase.organizationId,
          uploaderId,
          filename: staged.filename,
          category: staged.category,
          subType: staged.subType,
          size: staged.size,
          mimeType: staged.mimeType,
          gcsPath,
        });
      }

      // 2) Borrar archivos marcados (cascada implícita de anotaciones).
      const annotationIdsKilledByCascade = new Set<string>();
      if (stagedFileRemovals.size > 0) {
        const willCascadeAll = true; // deleteCaseFileAction borra TODAS las anotaciones del caso por diseño.
        for (const fileId of stagedFileRemovals) {
          const result = await deleteCaseFileAction(fileId);
          if (!result.success) {
            throw new Error(result.error || `No se pudo eliminar el archivo ${fileId}`);
          }
        }
        if (willCascadeAll) {
          ((clinicalCase.annotations ?? []) as any[]).forEach(a => {
            if (a.id) annotationIdsKilledByCascade.add(a.id);
          });
        }
      }

      // 3) Borrar anotaciones marcadas explícitamente que NO se cubrieron por cascada.
      for (const annoId of stagedAnnotationRemovals) {
        if (annotationIdsKilledByCascade.has(annoId)) continue;
        await deleteAnnotationAction(annoId);
      }

      // 4) Crear anotaciones nuevas (después de los borrados para que la cascada no las lleve).
      // En impersonación admin, se debe usar el id del usuario simulado, no el del admin real.
      const annotationAuthorId = authUserProfile?.id || uploaderId;
      for (const staged of stagedAnnotationAdds) {
        await createAnnotationAction({
          caseId: id as string,
          userId: annotationAuthorId,
          text: staged.text,
          coordinates: staged.coordinates,
        });
      }

      // 5) Actualizar campos de texto del row.
      const payload = {
        ...editForm,
        ...(editForm?.desiredDeliveryAt
          ? { desiredDeliveryAt: new Date(editForm.desiredDeliveryAt).toISOString() }
          : {}),
      };
      await updateClinicalCaseAction(id as string, payload);

      // 6) Refetch + regenerar signed URLs (visor 3D / descargas) + revoke previews + limpiar staging.
      const refreshed = await getCaseDetails(id as string);
      if (refreshed && !(refreshed as any)._error) {
        ingestCasePayloadFromServer(refreshed);
        // Sincronizar editForm con los valores del servidor para que isFormDirty
        // quede false sin necesidad de salir y volver a entrar (borrador permanece en edición).
        setEditForm({
          internalName: (refreshed as any).internalName,
          patientIdAnon: (refreshed as any).patientIdAnon || '',
          urgency: (refreshed as any).urgency ?? '',
          teeth: ((refreshed as any).teeth as number[]) || [],
          restorationType: (refreshed as any).restorationTypeCode ?? '',
          material: (refreshed as any).materialCode ?? '',
          shade: (refreshed as any).shadeCode ?? '',
          notesEsthetic: (refreshed as any).notesEsthetic || '',
          notesOclusal: (refreshed as any).notesOclusal || '',
          doctorNotes: ((refreshed as any).specialInstructions ?? (refreshed as any).doctorNotes) || '',
          desiredDeliveryAt: toLocalDatetimeValue((refreshed as any).desiredDeliveryAt),
          status: (refreshed as any).status,
          serviceType: (refreshed as any).serviceType,
          replacesMissingTeeth: (refreshed as any).replacesMissingTeeth ?? null,
        });
        const refreshedFiles = ((refreshed as any).files ?? []) as any[];
        if (refreshedFiles.length > 0) {
          const viewerUrls: Record<string, string> = {};
          const allUrls: Record<string, string> = {};
          await Promise.all(refreshedFiles.map(async (f: any) => {
            try {
              const signed = await getSignedUrlAction(f.gcsPath);
              if (!signed) return;
              allUrls[f.id] = signed;
              if (f.category === 'scan' || f.category === 'design' || f.category === 'design_upload') {
                viewerUrls[f.subType || 'default'] = signed;
              }
            } catch (e) {
              logError('Error refreshing signed URL post-save', e, { caseId: id, filename: f.filename });
            }
          }));
          setFileUrls(viewerUrls);
          setDownloadUrls(allUrls);
          setLocalAnnotations(((refreshed as any).annotations ?? []) as any[]);
        } else {
          setFileUrls({});
          setDownloadUrls({});
          setLocalAnnotations([]);
        }
      }
      stagedFileAdds.forEach(s => URL.revokeObjectURL(s.previewUrl));
      setStagedFileAdds([]);
      setStagedFileRemovals(new Set());
      setStagedAnnotationAdds([]);
      setStagedAnnotationRemovals(new Set());

      if (clinicalCase.status !== 'borrador') {
        setIsEditing(false);
      }
      showSuccessToastMessage('Cambios guardados exitosamente');
      return true;
    } catch (err) {
      logError('Error saving case changes', err, { caseId: id });
      showErrorToast(err instanceof Error && err.message ? err.message : 'Error al guardar los cambios');
      return false;
    } finally {
      setSavingChanges(false);
    }
  };

  const handleCancelEdit = () => {
    if (clinicalCase) {
      setEditForm({
        internalName: clinicalCase.internalName,
        patientIdAnon: clinicalCase.patientIdAnon || '',
        urgency: clinicalCase.urgency ?? '',
        teeth: (clinicalCase.teeth as number[]) || [],
        restorationType: clinicalCase.restorationTypeCode ?? '',
        material: clinicalCase.materialCode ?? '',
        shade: clinicalCase.shadeCode ?? '',
        notesEsthetic: clinicalCase.notesEsthetic || '',
        notesOclusal: clinicalCase.notesOclusal || '',
        doctorNotes: (clinicalCase.specialInstructions ?? clinicalCase.doctorNotes) || '',
        status: clinicalCase.status,
        serviceType: clinicalCase.serviceType
      });
    }
    // Descartar staging local — nada se persistió en server.
    stagedFileAdds.forEach(s => URL.revokeObjectURL(s.previewUrl));
    setStagedFileAdds([]);
    setStagedFileRemovals(new Set());
    setStagedAnnotationAdds([]);
    setStagedAnnotationRemovals(new Set());
    setSelectedCoords(null);
    setNewAnnotationText('');
    setIsEditing(false);
  };

  const handlePublish = async (opts?: { saveFirst?: boolean }) => {
    if (opts?.saveFirst) {
      const saved = await handleSaveChanges();
      if (!saved) return;
    }
    setActionLoading(true, 'publish');
    try {
      const res = await publishCaseAction(id as string, patientConsentChecked);
      if (!res.success) {
        if (res.error === 'Pool de técnicos vacío') {
          showErrorToast('No hay laboratorios disponibles con las habilidades requeridas. Modifica los requisitos o intenta más tarde.');
        } else {
          showErrorToast(res.error || 'Error al publicar el caso');
        }
        return;
      }
      const updatedCase = await getCaseDetails(id as string);
      if (updatedCase && !(updatedCase as any)._error) ingestCasePayloadFromServer(updatedCase);
      else setClinicalCase((prev: any) => ({ ...prev, status: 'enEvaluacion', publishedAt: new Date() }));
      const inPool = (updatedCase as { internalStatus?: string } | null)?.internalStatus === POOL_INTERNAL_STATUS;
      const assigned = (updatedCase as { internalStatus?: string } | null)?.internalStatus === INTERNAL_CASE_STATUSES.ASIGNACION_PENDIENTE;
      showSuccessToastMessage(
        inPool
          ? 'Caso publicado. Buscamos técnicos disponibles para asignarlo.'
          : assigned
            ? 'Caso publicado. Fauchard asignó un técnico; te avisaremos cuando acepte.'
            : 'Caso publicado. Fauchard está procesando la asignación.',
      );
      dispatchDashboardMetricsRefresh();
    } catch (err: any) {
      logError('Error publishing case', err, { caseId: id });
      showErrorToast(err?.message || 'Error al publicar el caso');
    } finally {
      setActionLoading(false);
      setIsPublishing(false);
    }
  };

  const handleDeleteCase = async () => {
    if (deleteInput !== 'ELIMINAR') return;
    const targetCaseId = clinicalCase?.id ? String(clinicalCase.id) : null;
    const routeCaseId = id ? String(id) : null;
    if (!targetCaseId || !routeCaseId || targetCaseId !== routeCaseId) {
      showErrorToast(
        clinicalCase == null
          ? 'Espera a que cargue el caso antes de eliminar.'
          : 'El caso en pantalla no coincide con la URL. Recarga la página e inténtalo de nuevo.',
      );
      return;
    }
    setActionLoading(true, 'delete');
    try {
      const res = await deleteClinicalCaseAction(targetCaseId);
      if (!res.success) {
        showErrorToast(
          (!res.success && 'error' in res ? res.error : null) ||
            'Error al eliminar el caso. Por favor, intenta de nuevo.',
        );
        return;
      }
      setIsDeleting(false);
      router.push('/dashboard/cases');
    } catch (error) {
      logError('Error deleting clinical case', error, { caseId: targetCaseId });
      showErrorToast('Error al eliminar el caso. Por favor, intenta de nuevo.');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSubtype = (subType: string) => {
    const next = new Set(visibleSubtypes);
    if (next.has(subType)) next.delete(subType);
    else next.add(subType);
    setVisibleSubtypes(next);
  };

  const handleOpacityChange = (subType: string, opacity: number) => {
    setLayerOpacity(prev => ({ ...prev, [subType]: opacity }));
  };

  const handleResolveFlowRequest = async (approve: boolean) => {
    setActionLoading(true);
    try {
      const res = await resolveFlowRequestAction(id as string, approve);
      if (res.success) {
        if (res.action === 'approved') {
          setClinicalCase((prev: any) => ({
            ...prev,
            status: res.status,
            pendingActionRequest: null,
            pendingActionActor: null
          }));
        } else {
          setClinicalCase((prev: any) => ({
            ...prev,
            pendingActionRequest: null,
            pendingActionActor: null
          }));
        }
        showSuccessToastMessage('Solicitud procesada');
      } else {
        showErrorToast(res.error || 'Error al procesar la solicitud');
      }
    } catch (error) {
      showErrorToast('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const MAX_CLINICAL_FILES = 3;
  const ALLOWED_CLINICAL_EXTS = ['stl', 'ply', 'obj', 'jpg', 'jpeg', 'png'];

  const MAX_COMPLEMENTARY_FILES = 10;
  const ALLOWED_COMPLEMENTARY_EXTS = ['jpg', 'jpeg', 'png', 'pdf', 'docx', 'stl', 'ply', 'obj'];
  const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

  const uploadComplementaryFiles = async (files: File[], subType: 'general' | 'revision_reference' | 'quality_reference') => {
    if (!clinicalCase || !user) return;
    const uploaderId = (user as any).id || (user as any).uid;
    const folder = subType === 'general' ? 'complementary'
      : subType === 'revision_reference' ? 'revision-attachments'
      : 'quality-attachments';
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_COMPLEMENTARY_EXTS.includes(ext)) throw new Error(`Formato no permitido: ${file.name}`);
      if (file.size > MAX_UPLOAD_SIZE_BYTES) throw new Error(`Archivo demasiado grande: ${file.name}`);
      const gcsPath = `organizations/${clinicalCase.organizationId}/cases/${id}/${folder}/${Date.now()}_${file.name}`;
      const uploadUrl = await getUploadUrlAction(gcsPath, file.type, undefined);
      if (!uploadUrl) throw new Error(`No se pudo obtener URL de subida para ${file.name}`);
      const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!res.ok) throw new Error(`Fallo en la subida de ${file.name}`);
      await registerFileAction({
        caseId: id as string,
        organizationId: clinicalCase.organizationId,
        uploaderId,
        filename: file.name,
        category: 'complementary',
        subType,
        size: file.size,
        mimeType: file.type,
        gcsPath,
      });
    }
  };

  const handleDownloadCase = async () => {
    if (!clinicalCase) return;
    setIsDownloadingCase(true);
    try {
      const [JSZip, { PDFDocument, rgb, StandardFonts }] = await Promise.all([
        import('jszip').then(m => m.default),
        import('pdf-lib'),
      ]);

      const zip = new JSZip();
      const folder1 = zip.folder('1_Caso')!;
      const folder2 = zip.folder('2_Entrega')!;
      const folder3 = zip.folder('3_Adicionales')!;
      // Fecha local explícita para evitar que JSZip use UTC y muestre "hora futura" en Finder
      const zipFileDate = new Date();

      const allFiles: any[] = clinicalCase.files ?? [];

      // 1_Caso — scans (category: scan)
      const scanFiles = allFiles.filter((f: any) => f.category === 'scan' || (!f.category && f.subType && ['superior','inferior','bite'].includes(f.subType)));
      for (const f of scanFiles) {
        try {
          const url = await getSignedUrlAction(f.gcsPath);
          if (!url) continue;
          const blob = await fetch(url).then(r => r.blob());
          folder1.file(f.filename, blob, { date: zipFileDate });
        } catch {}
      }

      // 2_Entrega — última entrega dentista-técnico (no rechazada por calidad)
      const deliveries: any[] = clinicalCase.deliveries ?? [];
      const finalDelivery = [...deliveries]
        .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
        .find((d: any) => d.qualityStatus !== 'rejected');
      if (finalDelivery) {
        const deliveryFiles: string[] = finalDelivery.files ?? [];
        for (const rawEntry of deliveryFiles) {
          try {
            // getCaseDetails ya firmó las URLs — rawEntry es una URL firmada o una ruta GCS
            let fetchUrl: string;
            let fname: string;

            if (rawEntry.startsWith('http')) {
              // Ya es URL firmada: fetchear directamente
              fetchUrl = rawEntry;
              // Extraer nombre del archivo desde el path de la URL (antes del ?)
              const urlPath = new URL(rawEntry).pathname; // ej: /bucket/organizations/.../file.ply
              // Para Firebase Storage, el path incluye %2F codificado en el segmento 'o/'
              const decoded = decodeURIComponent(urlPath);
              fname = decoded.split('/').pop() ?? 'archivo';
            } else {
              // Es ruta GCS sin firmar: pedir URL firmada
              const decoded = decodeURIComponent(rawEntry).split('?')[0];
              const gcsPathMatch = decoded.match(/organizations\/.+/);
              const gcsPath = gcsPathMatch ? gcsPathMatch[0] : decoded;
              const signed = await getSignedUrlAction(gcsPath);
              if (!signed) continue;
              fetchUrl = signed;
              fname = gcsPath.split('/').pop() ?? 'archivo';
            }

            const blob = await fetch(fetchUrl).then(r => r.blob());
            folder2.file(fname, blob, { date: zipFileDate });
          } catch {}
        }
      }

      // 3_Adicionales — complementarios
      const compFiles = allFiles.filter((f: any) => f.category === 'complementary');
      for (const f of compFiles) {
        try {
          const url = await getSignedUrlAction(f.gcsPath);
          if (!url) continue;
          const blob = await fetch(url).then(r => r.blob());
          folder3.file(f.filename, blob, { date: zipFileDate });
        } catch {}
      }

      // PDF informe profesional
      const pdfDoc = await PDFDocument.create();
      const W = 595, H = 842;
      const page = pdfDoc.addPage([W, H]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const TEAL = rgb(0.04, 0.53, 0.53);
      const DARK = rgb(0.08, 0.08, 0.12);
      const MUTED = rgb(0.42, 0.42, 0.48);
      const LIGHT = rgb(0.94, 0.96, 0.96);
      const WHITE = rgb(1, 1, 1);

      const L = 44, R = W - 44;
      const HEADER_H = 80;
      let y = H - 44;

      // ── Logo: fetch and embed ────────────────────────────────────────────
      let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
      try {
        const logoRes = await fetch('/dentflowai.jpg');
        const logoBytes = await logoRes.arrayBuffer();
        logoImage = await pdfDoc.embedPng(new Uint8Array(logoBytes));
      } catch { /* logo no crítico */ }

      // ── Header bar ────────────────────────────────────────────────────────
      page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: TEAL });

      // Logo top-right (56×56 pts con padding)
      const LOGO_SIZE = 56;
      const LOGO_X = W - 44 - LOGO_SIZE;
      const LOGO_Y = H - HEADER_H + (HEADER_H - LOGO_SIZE) / 2;
      if (logoImage) {
        page.drawImage(logoImage, { x: LOGO_X, y: LOGO_Y, width: LOGO_SIZE, height: LOGO_SIZE });
      }

      // Title + case number (left, max width up to logo)
      const caseLabel = clinicalCase.caseNumber ?? '—';
      const genDate = format(new Date(), "dd/MM/yyyy 'a las' HH:mm");
      page.drawText('INFORME DEL CASO', { x: L, y: H - 28, size: 8, font: bold, color: rgb(0.75, 0.97, 0.97) });
      page.drawText(caseLabel, { x: L, y: H - 50, size: 22, font: bold, color: WHITE });
      page.drawText(`Generado el ${genDate}`, { x: L, y: H - 68, size: 8, font, color: rgb(0.75, 0.97, 0.97) });

      y = H - HEADER_H - 16;

      // ── Helper: draw a section heading ─────────────────────────────────────
      const sectionHeading = (label: string) => {
        y -= 6;
        page.drawRectangle({ x: L, y: y - 2, width: R - L, height: 18, color: LIGHT });
        page.drawRectangle({ x: L, y: y - 2, width: 3, height: 18, color: TEAL });
        page.drawText(label.toUpperCase(), { x: L + 8, y: y + 3, size: 8, font: bold, color: TEAL });
        y -= 20;
      };

      // ── Helper: labeled field row ──────────────────────────────────────────
      const field = (label: string, value: string, x = L, colW = R - L) => {
        page.drawText(label + ':', { x, y, size: 8, font: bold, color: MUTED });
        const valX = x + bold.widthOfTextAtSize(label + ': ', 8) + 2;
        const maxW = colW - (valX - x) - 4;
        // Truncate if too long
        let val = value;
        while (val.length > 0 && font.widthOfTextAtSize(val, 9) > maxW) val = val.slice(0, -1);
        if (val !== value) val = val.slice(0, -1) + '…';
        page.drawText(val, { x: valX, y, size: 9, font, color: DARK });
        y -= 15;
      };

      // ── Helper: multiline text block ───────────────────────────────────────
      const multiLine = (text: string, maxWidth: number, fontSize = 9) => {
        const words = text.split(' ');
        let line = '';
        for (const w of words) {
          const test = line ? line + ' ' + w : w;
          if (font.widthOfTextAtSize(test, fontSize) > maxWidth && line) {
            page.drawText(line, { x: L + 8, y, size: fontSize, font, color: DARK });
            y -= fontSize + 4;
            line = w;
          } else { line = test; }
        }
        if (line) { page.drawText(line, { x: L + 8, y, size: fontSize, font, color: DARK }); y -= fontSize + 4; }
      };

      // ── Helper: horizontal rule ────────────────────────────────────────────
      const rule = () => {
        y -= 4;
        page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: rgb(0.88, 0.9, 0.92) });
        y -= 8;
      };

      // ── SECCIÓN 1: IDENTIFICACIÓN ──────────────────────────────────────────
      sectionHeading('Identificación del caso');
      const halfW = (R - L) / 2 - 6;
      const col2X = L + halfW + 12;

      // Row 1: case number | status
      const statusLabels: Record<string, string> = {
        borrador: 'Borrador', enEvaluacion: 'En evaluación', esperandoInicio: 'Esperando inicio',
        enEjecucion: 'En ejecución', enRevision: 'En revisión', completado: 'Completado',
        rechazado: 'Rechazado', cerrado: 'Cerrado', enFabricacion: 'En fabricación',
        disenoAprobado: 'Diseño aprobado', propuestaLista: 'Propuesta lista',
      };
      const statusLabel = statusLabels[clinicalCase.status ?? ''] ?? (clinicalCase.status ?? '—');
      field('Número de caso', caseLabel, L, halfW);
      const savedY1 = y; y = savedY1 + 15;
      field('Estado', statusLabel, col2X, halfW);
      y = savedY1;

      // Row 2: service type | urgency
      const svcLabels: Record<string, string> = { solo_diseno: 'Solo diseño', solo_fabricacion: 'Solo fabricación', integral: 'Diseño + Fabricación' };
      field('Tipo de servicio', svcLabels[clinicalCase.serviceType ?? ''] ?? (clinicalCase.serviceType ?? '—'), L, halfW);
      const savedY2 = y; y = savedY2 + 15;
      field('Urgencia', clinicalCase.urgency ?? '—', col2X, halfW);
      y = savedY2;

      // Row 3: publication date | desired delivery
      const pubDate = clinicalCase.publishedAt ? format(new Date(clinicalCase.publishedAt), 'dd/MM/yyyy') : '—';
      const delDate = clinicalCase.desiredDeliveryAt ? format(new Date(clinicalCase.desiredDeliveryAt), 'dd/MM/yyyy HH:mm') : '—';
      field('Fecha de publicación', pubDate, L, halfW);
      const savedY3 = y; y = savedY3 + 15;
      field('Entrega solicitada', delDate, col2X, halfW);
      y = savedY3;
      rule();

      // ── SECCIÓN 2: PARTES ─────────────────────────────────────────────────
      sectionHeading('Partes del caso');
      field('Solicitante (dentista)', clinicalCase.doctor?.fullName ?? '—');
      if (clinicalCase.patientIdAnon) {
        field('ID de paciente (anon.)', clinicalCase.patientIdAnon, L, halfW);
        if (clinicalCase.internalName) {
          const savedYP = y; y = savedYP + 15;
          field('Nombre interno', clinicalCase.internalName, col2X, halfW);
          y = savedYP;
        }
      }
      rule();

      // ── SECCIÓN 3: PRESCRIPCIÓN CLÍNICA ───────────────────────────────────
      sectionHeading('Prescripción clínica');
      field('Tipo de restauración', clinicalCase.restorationType ?? '—', L, halfW);
      const savedYC = y; y = savedYC + 15;
      field('Material', clinicalCase.material ?? '—', col2X, halfW);
      y = savedYC;
      field('Color VITA (shade)', clinicalCase.shade ?? '—', L, halfW);
      const savedYC2 = y; y = savedYC2 + 15;
      field('Pónticos (reemplaza piezas faltantes)', clinicalCase.replacesMissingTeeth ? 'Sí' : 'No', col2X, halfW);
      y = savedYC2;
      rule();

      // ── SECCIÓN 4: ODONTOGRAMA ────────────────────────────────────────────
      sectionHeading('Piezas dentales comprometidas');
      const teeth: number[] = (clinicalCase.teeth as number[]) ?? [];

      // FDI odontogram layout: 4 quadrants, 8 teeth each
      // Q1: 11-18 (upper right, shown left→right as 18..11)
      // Q2: 21-28 (upper left, shown left→right as 21..28)
      // Q3: 31-38 (lower left, shown left→right as 31..38)
      // Q4: 41-48 (lower right, shown left→right as 48..41)
      const CELL = 22, GAP = 2, MIDGAP = 8;
      const totalW = 8 * CELL + 7 * GAP; // one quadrant width
      const startX = (W - (totalW * 2 + MIDGAP)) / 2;

      y -= 4;
      const oY = y; // top of odontogram

      // Draw one row of 8 teeth
      const drawTeethRow = (quadrantNumbers: number[], rowY: number, labelAbove: boolean) => {
        quadrantNumbers.forEach((num, i) => {
          const cx = startX + i * (CELL + GAP);
          const affected = teeth.includes(num);
          // Box
          page.drawRectangle({ x: cx, y: rowY - CELL, width: CELL, height: CELL, color: affected ? TEAL : LIGHT, borderColor: affected ? TEAL : rgb(0.78, 0.82, 0.86), borderWidth: 0.8, borderOpacity: 1 });
          // Tooth number
          const numStr = String(num);
          const tw = (affected ? bold : font).widthOfTextAtSize(numStr, 7);
          page.drawText(numStr, { x: cx + (CELL - tw) / 2, y: rowY - CELL + 7, size: 7, font: affected ? bold : font, color: affected ? WHITE : MUTED });
        });
      };

      // Upper jaw: Q1 right (18..11) | Q2 left (21..28)
      const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
      const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
      // Lower jaw: Q4 right (48..41) | Q3 left (31..38)
      const lowerRight = [48, 47, 46, 45, 44, 43, 42, 41];
      const lowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];

      drawTeethRow(upperRight, oY, true);
      const upperLeftStart = startX + 8 * (CELL + GAP) + MIDGAP;
      upperLeft.forEach((num, i) => {
        const cx = upperLeftStart + i * (CELL + GAP);
        const affected = teeth.includes(num);
        page.drawRectangle({ x: cx, y: oY - CELL, width: CELL, height: CELL, color: affected ? TEAL : LIGHT, borderColor: affected ? TEAL : rgb(0.78, 0.82, 0.86), borderWidth: 0.8, borderOpacity: 1 });
        const numStr = String(num);
        const tw = (affected ? bold : font).widthOfTextAtSize(numStr, 7);
        page.drawText(numStr, { x: cx + (CELL - tw) / 2, y: oY - CELL + 7, size: 7, font: affected ? bold : font, color: affected ? WHITE : MUTED });
      });

      // Midline separator
      const midX = startX + 8 * (CELL + GAP) + MIDGAP / 2;
      page.drawLine({ start: { x: midX, y: oY + 4 }, end: { x: midX, y: oY - CELL * 2 - 12 }, thickness: 0.8, color: rgb(0.7, 0.75, 0.78), dashArray: [3, 2], dashPhase: 0 });

      // Arch separator (between upper and lower)
      const archY = oY - CELL - 6;
      page.drawLine({ start: { x: startX - 4, y: archY }, end: { x: startX + totalW * 2 + MIDGAP + 4, y: archY }, thickness: 0.5, color: rgb(0.78, 0.82, 0.86), dashArray: [4, 3], dashPhase: 0 });

      const lowerY = archY - 6;
      drawTeethRow(lowerRight, lowerY, false);
      lowerLeft.forEach((num, i) => {
        const cx = upperLeftStart + i * (CELL + GAP);
        const affected = teeth.includes(num);
        page.drawRectangle({ x: cx, y: lowerY - CELL, width: CELL, height: CELL, color: affected ? TEAL : LIGHT, borderColor: affected ? TEAL : rgb(0.78, 0.82, 0.86), borderWidth: 0.8, borderOpacity: 1 });
        const numStr = String(num);
        const tw = (affected ? bold : font).widthOfTextAtSize(numStr, 7);
        page.drawText(numStr, { x: cx + (CELL - tw) / 2, y: lowerY - CELL + 7, size: 7, font: affected ? bold : font, color: affected ? WHITE : MUTED });
      });

      // Quadrant labels (above upper row, below lower row)
      page.drawText('Superior derecho', { x: startX, y: oY + 4, size: 7, font, color: MUTED });
      page.drawText('Superior izquierdo', { x: upperLeftStart, y: oY + 4, size: 7, font, color: MUTED });
      page.drawText('Inferior derecho', { x: startX, y: lowerY - CELL - 4, size: 7, font, color: MUTED });
      page.drawText('Inferior izquierdo', { x: upperLeftStart, y: lowerY - CELL - 4, size: 7, font, color: MUTED });

      // Legend — centrado debajo del odontograma para no solaparse con piezas
      y = lowerY - CELL - 20;
      const legendBaseY = y;
      const legendBlockW = 10 + 4 + font.widthOfTextAtSize('Comprometida', 7) + 20 + 10 + 4 + font.widthOfTextAtSize('Sana', 7);
      const legendStartX = (W - legendBlockW) / 2;
      page.drawRectangle({ x: legendStartX, y: legendBaseY - 9, width: 10, height: 10, color: TEAL });
      page.drawText('Comprometida', { x: legendStartX + 13, y: legendBaseY - 7, size: 7, font, color: MUTED });
      const legend2X = legendStartX + 13 + font.widthOfTextAtSize('Comprometida', 7) + 16;
      page.drawRectangle({ x: legend2X, y: legendBaseY - 9, width: 10, height: 10, color: LIGHT, borderColor: rgb(0.78, 0.82, 0.86), borderWidth: 0.8, borderOpacity: 1 });
      page.drawText('Sana', { x: legend2X + 13, y: legendBaseY - 7, size: 7, font, color: MUTED });
      y -= 16;

      // Tooth list text
      if (teeth.length > 0) {
        const teethStr = `Piezas comprometidas: ${[...teeth].sort((a, b) => a - b).join(', ')}`;
        const teethStrW = font.widthOfTextAtSize(teethStr, 8);
        page.drawText(teethStr, { x: (W - teethStrW) / 2, y, size: 8, font, color: DARK });
        y -= 12;
      }
      rule();

      // ── SECCIÓN 5: INSTRUCCIONES Y NOTAS ─────────────────────────────────
      sectionHeading('Instrucciones clínicas');
      const notes = clinicalCase.specialInstructions ?? clinicalCase.doctorNotes ?? '';
      const notesEsthetic = clinicalCase.notesEsthetic ?? '';
      const notesOclusal = clinicalCase.notesOclusal ?? '';

      if (notes) {
        page.drawText('Notas generales:', { x: L + 8, y, size: 8, font: bold, color: MUTED }); y -= 12;
        multiLine(notes.slice(0, 400), R - L - 16);
        y -= 4;
      }
      if (notesEsthetic) {
        page.drawText('Notas estéticas:', { x: L + 8, y, size: 8, font: bold, color: MUTED }); y -= 12;
        multiLine(notesEsthetic.slice(0, 300), R - L - 16);
        y -= 4;
      }
      if (notesOclusal) {
        page.drawText('Notas oclusales:', { x: L + 8, y, size: 8, font: bold, color: MUTED }); y -= 12;
        multiLine(notesOclusal.slice(0, 300), R - L - 16);
      }
      if (!notes && !notesEsthetic && !notesOclusal) {
        page.drawText('Sin instrucciones adicionales.', { x: L + 8, y, size: 9, font, color: MUTED });
        y -= 14;
      }

      // ── FOOTER ─────────────────────────────────────────────────────────────
      const footerY = 28;
      page.drawLine({ start: { x: L, y: footerY + 14 }, end: { x: R, y: footerY + 14 }, thickness: 0.4, color: rgb(0.85, 0.88, 0.9) });
      page.drawText('DentFlowAI — Documento de uso interno y confidencial. Generado automáticamente.', { x: L, y: footerY, size: 7, font, color: MUTED });
      page.drawText(`${caseLabel} · ${genDate}`, { x: R - bold.widthOfTextAtSize(`${caseLabel} · ${genDate}`, 7), y: footerY, size: 7, font, color: MUTED });

      const pdfBytes = await pdfDoc.save();
      const pdfFileName = `informe_caso_${clinicalCase.caseNumber ?? id}.pdf`;
      zip.file(pdfFileName, pdfBytes, { date: zipFileDate });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const caseNum = clinicalCase.caseNumber ?? id;
      const fileName = `${caseNum}_${format(new Date(), 'yyyyMMdd')}.zip`;
      const downloadUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Error al generar descarga del caso:', err);
      showErrorToast('Error al generar el ZIP del caso');
    } finally {
      setIsDownloadingCase(false);
    }
  };

  const handleClinicalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileObj = e.target.files?.[0];
    e.target.value = '';
    if (!fileObj || !clinicalCase || !user) return;

    const ext = fileObj.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_CLINICAL_EXTS.includes(ext)) {
      showErrorToast('Formato no permitido. Usa STL, PLY, OBJ, JPG o PNG.');
      return;
    }
    if (fileObj.size > 20 * 1024 * 1024) {
      showErrorToast('El archivo supera el límite de 20 MB.');
      return;
    }

    const existingKept = (clinicalCase.files ?? []).filter((f: any) => !stagedFileRemovals.has(f.id) && f.category !== 'complementary').length;
    const totalDisplayed = existingKept + stagedFileAdds.filter(s => s.category !== 'complementary').length;
    if (totalDisplayed >= MAX_CLINICAL_FILES) {
      showErrorToast(`Máximo ${MAX_CLINICAL_FILES} archivos clínicos.`);
      return;
    }

    const category = 'scan' as const;

    // Asignar el próximo slot canónico libre (igual que el wizard de creación).
    const usedSubTypes = new Set<string>([
      ...((clinicalCase.files ?? []) as any[])
        .filter((f: any) => !stagedFileRemovals.has(f.id))
        .map((f: any) => f.subType),
      ...stagedFileAdds.map(s => s.subType),
    ]);
    const slot = (['superior', 'inferior', 'bite'] as const).find(s => !usedSubTypes.has(s));
    if (!slot) {
      showErrorToast('No hay slots disponibles (superior/inferior/bite ocupados).');
      return;
    }
    const subType: string = slot;

    const staged: StagedFileAdd = {
      tempId: `staged-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: fileObj,
      category,
      subType,
      previewUrl: URL.createObjectURL(fileObj),
      filename: fileObj.name,
      size: fileObj.size,
      mimeType: fileObj.type,
    };
    setStagedFileAdds(prev => [...prev, staged]);
    showSuccessToastMessage('Archivo pendiente — usa Grabar para confirmar');
  };

  const handleClinicalFileDelete = (fileId: string) => {
    if (!clinicalCase) return;

    // Las anotaciones 3D están ancladas a la geometría de los scans. Si se elimina cualquier
    // archivo del caso (existente o staged), las anotaciones pierden sentido — limpiamos todas.
    const clearAllAnnotations = () => {
      if (stagedAnnotationAdds.length > 0) setStagedAnnotationAdds([]);
      const existingAnnotationIds = (localAnnotations ?? [])
        .map((a: any) => a.id)
        .filter(Boolean);
      if (existingAnnotationIds.length > 0) {
        setStagedAnnotationRemovals(prev => {
          const next = new Set(prev);
          existingAnnotationIds.forEach((aid: string) => next.add(aid));
          return next;
        });
      }
      setSelectedCoords(null);
      setNewAnnotationText('');
    };

    // ¿Es un staged add? — se descarta sin tocar nada en server.
    const stagedMatch = stagedFileAdds.find(s => s.tempId === fileId);
    if (stagedMatch) {
      URL.revokeObjectURL(stagedMatch.previewUrl);
      setStagedFileAdds(prev => prev.filter(s => s.tempId !== fileId));
      clearAllAnnotations();
      return;
    }

    // Existente → se marca para borrado al grabar.
    setStagedFileRemovals(prev => {
      const next = new Set(prev);
      next.add(fileId);
      return next;
    });
    clearAllAnnotations();
    showSuccessToastMessage('Archivo marcado para eliminar — usa Grabar para confirmar');
  };

  /**
   * Vista mergeada de archivos (existentes - removals + staged adds) para la UI y el visor.
   * Cada item se etiqueta con `staged` para distinguir visualmente y para construir el visor.
   */
  const displayedFiles = useMemo(() => {
    const existing = ((clinicalCase?.files ?? []) as any[])
      .filter((f: any) => !stagedFileRemovals.has(f.id) && f.category !== 'complementary')
      .map((f: any) => ({ ...f, staged: false as const, key: f.id }));
    const added = stagedFileAdds.filter(s => s.category !== 'complementary').map(s => ({
      id: s.tempId,
      key: s.tempId,
      filename: s.filename,
      category: s.category,
      subType: s.subType,
      size: s.size,
      mimeType: s.mimeType,
      gcsPath: null,
      staged: true as const,
      previewUrl: s.previewUrl,
    }));
    return [...existing, ...added];
  }, [clinicalCase?.files, stagedFileRemovals, stagedFileAdds]);

  const displayedAnnotations = useMemo(() => {
    const existing = (localAnnotations ?? []).filter((a: any) => !stagedAnnotationRemovals.has(a.id));
    const added = stagedAnnotationAdds.map(s => ({
      id: s.tempId,
      text: s.text,
      coordinates: s.coordinates,
      createdAt: s.createdAt,
      user: { fullName: authUserProfile?.fullName || (user as any)?.name || 'Yo' },
      staged: true as const,
    }));
    return [...added, ...existing];
  }, [localAnnotations, stagedAnnotationRemovals, stagedAnnotationAdds, user, authUserProfile?.fullName]);

  /**
   * Modelos para el visor 3D: existentes (signed URL) menos removals + staged adds (blob URL).
   * Visibles por defecto: superior+inferior (consistente con el efecto inicial).
   */
  const modelConfig = useMemo(() => {
    const entries: { url: string; subType: string; visible: boolean; opacity: number }[] = [];
    // Existentes (filtrados por removals) que están en fileUrls.
    const removedSubTypes = new Set<string>();
    ((clinicalCase?.files ?? []) as any[]).forEach((f: any) => {
      if (stagedFileRemovals.has(f.id)) {
        if (f.subType) removedSubTypes.add(f.subType);
      }
    });
    const seenSubTypes = new Set<string>();
    Object.entries(fileUrls).forEach(([subType, url]) => {
      if (removedSubTypes.has(subType)) return;
      if (seenSubTypes.has(subType)) return;
      seenSubTypes.add(subType);
      entries.push({
        url,
        subType,
        visible: visibleSubtypes.has(subType),
        opacity: layerOpacity[subType] ?? 1,
      });
    });
    // Staged adds — solo 3D files (STL/PLY/OBJ). El blob URL no contiene filename, así que
    // anexamos un hash con la extensión para que el visor detecte el loader correcto.
    // Usamos el subType canónico (superior/inferior/bite/dentist_design) como label del visor.
    const THREE_D_EXTS = ['stl', 'ply', 'obj'];
    stagedFileAdds.forEach(s => {
      const ext = s.filename.split('.').pop()?.toLowerCase() ?? '';
      if (!THREE_D_EXTS.includes(ext)) return;
      // Si ya hay un entry con este subType (existente no removido), dale uniqueness al staged
      // para evitar colisión de keys en el visor (caso defensivo: la mayoría de veces el slot
      // allocator ya garantiza unicidad).
      let candidate = s.subType;
      if (seenSubTypes.has(candidate)) {
        candidate = `${s.subType}-${s.tempId.slice(-6)}`;
      }
      seenSubTypes.add(candidate);
      entries.push({
        url: `${s.previewUrl}#name.${ext}`,
        subType: candidate,
        visible: true,
        opacity: layerOpacity[candidate] ?? 1,
      });
    });
    return entries;
  }, [fileUrls, visibleSubtypes, layerOpacity, stagedFileAdds, stagedFileRemovals, clinicalCase?.files]);

  const caseStatus = clinicalCase?.status ?? 'borrador';
  const fieldsEditable = caseStatus === 'borrador';
  const canEditForm = isEditing && fieldsEditable && !!editForm;

  useEffect(() => {
    if (!canEditForm || !editForm) {
      setDraftListPriceSale(null);
      setDraftListPriceChecked(false);
      return;
    }
    const { restorationType, material, shade, urgency } = editForm;
    if (!restorationType || !material || !shade || !urgency) {
      setDraftListPriceSale(null);
      setDraftListPriceChecked(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await resolveListPriceAction({
        restorationType,
        material,
        shade,
        urgency,
      });
      if (cancelled) return;
      setDraftListPriceChecked(true);
      setDraftListPriceSale(res.success && res.data?.salePrice != null ? res.data.salePrice : null);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canEditForm, editForm?.restorationType, editForm?.material, editForm?.shade, editForm?.urgency]);

  useEffect(() => {
    setIsEditing(false);
    setEditForm(null);
  }, [clinicalCase?.id]);

  const handleStartEdit = useCallback(() => {
    if (!clinicalCase || !fieldsEditable) return;
    setEditForm({
      ...clinicalCase,
      // Los selects de material/restoration/shade usan code opaco como value;
      // urgency usa label. Sobrescribimos para no copiar los labels de los aliases.
      material: clinicalCase.materialCode ?? '',
      restorationType: clinicalCase.restorationTypeCode ?? '',
      shade: clinicalCase.shadeCode ?? '',
      urgency: clinicalCase.urgency ?? '',
      doctorNotes: (clinicalCase.specialInstructions ?? clinicalCase.doctorNotes) || '',
      desiredDeliveryAt: toLocalDatetimeValue(clinicalCase.desiredDeliveryAt),
      replacesMissingTeeth: clinicalCase.replacesMissingTeeth ?? null,
    });
    setIsEditing(true);
  }, [clinicalCase, fieldsEditable]);

  const formSnapshot = (c: Record<string, unknown> | null | undefined) => {
    if (!c) return '';
    const str = (v: unknown) => (v == null ? '' : String(v));
    return JSON.stringify({
      internalName: str(c.internalName),
      patientIdAnon: str(c.patientIdAnon),
      urgency: str(c.urgency),
      teeth: c.teeth,
      // editForm guarda codes; clinicalCase expone labels pero también codes (*Code).
      restorationType: str(c.restorationTypeCode ?? c.restorationType),
      material: str(c.materialCode ?? c.material),
      shade: str(c.shadeCode ?? c.shade),
      notesEsthetic: str(c.notesEsthetic),
      notesOclusal: str(c.notesOclusal),
      doctorNotes: str(c.specialInstructions ?? c.doctorNotes),
      // Normalizar a formato local datetime para que editForm y clinicalCase coincidan.
      desiredDeliveryAt: toLocalDatetimeValue(c.desiredDeliveryAt as string | Date | null | undefined),
      replacesMissingTeeth: c.replacesMissingTeeth ?? null,
    });
  };

  const isFormDirty =
    canEditForm && clinicalCase
      ? (
          formSnapshot(editForm) !== formSnapshot(clinicalCase) ||
          stagedFileAdds.length > 0 ||
          stagedFileRemovals.size > 0 ||
          stagedAnnotationAdds.length > 0 ||
          stagedAnnotationRemovals.size > 0
        )
      : false;

  const detailActions = useMemo(
    () =>
      getCaseDetailActionState({
        status: caseStatus,
        publishedAt: clinicalCase?.publishedAt,
        role: viewingAsAdmin
          ? 'admin'
          : actingAsDentista
            ? 'dentista'
            : actingAsTecnico
              ? 'tecnico'
              : (userRole ?? 'dentista'),
        isArchivedByUser: !!clinicalCase?.archivedByCurrentUser,
        canDelete: clinicalCase?.canDelete ?? false,
        isFormDirty,
        isEditing,
        invitationStatus: clinicalCase?.myInvitationStatus ?? myInvitation?.status,
        assignedTechnicianId: clinicalCase?.assignedTechnicianId,
        viewerId: authUserProfile?.id ?? null,
        hasListPrice: (() => {
          const sale = clinicalCase?.listPriceSale;
          if (sale == null) return false;
          const n = parseFloat(String(sale));
          return Number.isFinite(n) && n > 0;
        })(),
        hasDesiredDeliveryAt: !!clinicalCase?.desiredDeliveryAt,
      }),
    [
      caseStatus,
      clinicalCase?.publishedAt,
      clinicalCase?.archivedByCurrentUser,
      clinicalCase?.canDelete,
      clinicalCase?.listPriceSale,
      clinicalCase?.desiredDeliveryAt,
      viewingAsAdmin,
      actingAsDentista,
      actingAsTecnico,
      userRole,
      isFormDirty,
      isEditing,
      clinicalCase?.myInvitationStatus,
      myInvitation?.status,
      clinicalCase?.assignedTechnicianId,
      authUserProfile?.id,
    ],
  );

  // v5.0 — caso esperando técnicos en la cola pendiente_pool.
  const isPendingPool = clinicalCase?.internalStatus === POOL_INTERNAL_STATUS;
  const hasPendingAssignment = clinicalCase?.internalStatus === INTERNAL_CASE_STATUSES.ASIGNACION_PENDIENTE;
  const showPendingPoolBanner = isPendingPool && actingAsDentista && !viewingAsAdmin;
  const showPageEvalBanner =
    showCaseToolbar && clinicalCase?.status === 'enEvaluacion' && !isPendingPool;

  // Check-in al dentista: el cron marca pendingPoolCheckinSentAt al 50% del TTL;
  // al entrar al caso le mostramos el modal una vez por sesión.
  useEffect(() => {
    if (showPendingPoolBanner && clinicalCase?.pendingPoolCheckinSentAt && !checkInDismissed) {
      setCheckInOpen(true);
    }
  }, [showPendingPoolBanner, clinicalCase?.pendingPoolCheckinSentAt, checkInDismissed]);

  const isEditingStatus = fieldsEditable && editForm ? editForm.status : caseStatus;

  if (!loading && (!clinicalCase || clinicalCase._error)) {
    const debug = clinicalCase?._debug;

    return (
      <div className="text-center py-20 bg-background min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 bg-error-hl text-error rounded-full flex items-center justify-center mb-6">
          <XCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl text-foreground serif-font">Caso no encontrado</h2>
        <p className="text-faint mt-2 max-w-md mx-auto">
          {clinicalCase?._error === 'NotFound'
            ? "El servidor no encontró el caso con los permisos actuales."
            : "No tenemos registro de este caso o no tienes los permisos necesarios."}
        </p>

        {/* Panel de Diagnóstico Forense */}
        {debug && (
          <div className="mt-8 p-6 bg-surface border border-divider rounded-2xl text-left max-w-2xl w-full">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
              <Shield className="w-3 h-3" /> Reporte Forense del Servidor
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[9px] text-faint uppercase font-bold">Case solicitado:</p>
                <p className="text-[11px] text-foreground font-mono break-all bg-black/30 p-2 rounded border border-divider">{debug.caseId}</p>
              </div>
              <div className="space-y-2">
                <p className="text-[9px] text-faint uppercase font-bold">Identidad Servidor:</p>
                <div className="p-2 bg-black/30 rounded border border-divider space-y-1">
                   <p className="text-[10px] text-foreground"><span className="text-faint">Email:</span> {debug.email}</p>
                   <p className="text-[10px] text-foreground"><span className="text-faint">Role DB:</span> <span className="text-primary font-bold uppercase">{debug.userRoleInDB}</span></p>
                   <p className="text-[10px] text-foreground"><span className="text-faint">Master Key:</span> <span className={debug.isSystemAdmin ? "text-jade" : "text-warning"}>{debug.isSystemAdmin ? "ACTIVA" : "INACTIVA"}</span></p>
                   {debug.message && (
                     <p className="text-[9px] text-error mt-2 bg-error-hl p-2 rounded border border-error/30/10 font-mono italic">
                       Error: {debug.message}
                     </p>
                   )}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-divider flex justify-between items-center text-[9px] text-faint font-bold uppercase tracking-wider">
               <span>Criterio: {debug.criteria}</span>
               <span>DentFlow Forensic v1.0</span>
            </div>
          </div>
        )}
        
        <button 
          onClick={() => router.push('/dashboard')} 
          className="mt-8 text-faint hover:text-foreground font-bold uppercase tracking-widest text-[9px] px-8 py-3 bg-surface border border-divider rounded-full transition-all"
        >
          Volver al Dashboard
        </button>
      </div>
    );
  }

  // Guardia de Carga
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 space-y-4">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 border-4 border-primary/30/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-primary/30 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(20,184,166,0.2)]" />
        </div>
        <p className="text-primary font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Sincronizando Expediente...</p>
      </div>
    );
  }

  // Renderizado Final
  return (
    <div className="space-y-4 animate-fade-in font-sans pb-10 px-4">
      {/* HEADER SECTION — z-index por encima del panel UCH (col. derecha) para que abrir/cerrar responda siempre al clic */}
      <div className="relative z-[450] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} aria-label="Volver" className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-surface-2 border border-divider text-muted hover:bg-surface-off hover:text-foreground hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            {canEditForm ? (
              <input
                className="text-2xl serif-font bg-surface border border-primary/30 rounded-xl px-4 py-1 text-foreground focus:outline-none w-full"
                value={editForm?.internalName}
                onChange={e => setEditForm((prev: any) => ({ ...prev, internalName: e.target.value }))}
              />
            ) : (
              <h1 className="text-2xl serif-font text-foreground uppercase">{clinicalCase?.internalName}</h1>
            )}
            {fieldsEditable && !isEditing && (
              <p className="text-[10px] text-faint/90 mt-1 font-medium normal-case tracking-normal">
                Borrador — pulsa Editar para ajustar los datos clínicos
              </p>
            )}
            {clinicalCase?.copiedFromCaseId && (
              <p className="text-[10px] text-faint mt-1 normal-case tracking-normal">
                Copia del caso{' '}
                {clinicalCase.copiedFromCaseNumber ? (
                  <Link
                    href={`/dashboard/cases/${clinicalCase.copiedFromCaseId}`}
                    className="text-primary/90 hover:text-primary font-semibold"
                  >
                    #{clinicalCase.copiedFromCaseNumber}
                  </Link>
                ) : (
                  <span>#{String(clinicalCase.copiedFromCaseId).slice(0, 8)}</span>
                )}
              </p>
            )}
            {isActiveCaseStatus(caseStatus) && (
              <p className="text-[10px] text-faint/90 mt-1 font-medium normal-case tracking-normal">
                Caso en curso — datos clínicos en solo lectura
              </p>
            )}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {actingAsTecnico && !viewingAsAdmin && viewerIdStr ? (
                <CaseViewerStatusStripe
                  compact
                  input={{
                    caseStatus: String(isEditingStatus ?? ''),
                    assignedTechnicianId: clinicalCase?.assignedTechnicianId ?? null,
                    technicianUserId: viewerIdStr,
                    invitationStatus: (clinicalCase?.myInvitationStatus ??
                      myInvitation?.status ??
                      null) as InvitationStatusForKpi,
                  }}
                />
              ) : (
                <StatusBadge status={isEditingStatus} viewerRole={viewerRole} />
              )}
              {canEditForm && Object.values(SERVICE_TYPES).length > 1 ? (
                <select 
                  value={editForm?.serviceType} 
                  onChange={e => setEditForm((prev: any) => ({ ...prev, serviceType: e.target.value }))}
                  className="bg-surface border border-primary/30 rounded px-2 py-1 text-primary text-[10px] uppercase font-black tracking-widest outline-none"
                >
                  {Object.values(SERVICE_TYPES).map(t => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t] || t}</option>)}
                </select>
              ) : (
                <CaseServiceTypeBadge serviceType={clinicalCase?.serviceType ?? editForm?.serviceType} />
              )}
              <div className="text-[10px] font-bold uppercase tracking-wider text-faint flex items-center gap-1">
                {caseNumberLabel(clinicalCase?.caseNumber) ? (
                  <>
                    <span className="text-primary/90">{caseNumberLabel(clinicalCase?.caseNumber)}</span>
                    <span className="mx-1">·</span>
                  </>
                ) : null}
                <span>PAC:</span>
                {canEditForm ? (
                  <input
                    className="bg-surface border border-primary/30 rounded px-2 py-0.5 text-foreground outline-none w-32"
                    value={editForm?.patientIdAnon}
                    onChange={e => setEditForm((prev: any) => ({ ...prev, patientIdAnon: e.target.value }))}
                  />
                ) : (
                  <span>{clinicalCase?.patientIdAnon ?? '—'}</span>
                )}
              </div>
              {clinicalCase?.internalStatus && authUserProfile?.role === 'admin' && (
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-surface-2 text-muted border border-divider tracking-wider">
                  ⚙ {clinicalCase.internalStatus}
                </span>
              )}
              {(() => {
                const isPublished = Boolean(clinicalCase?.publishedAt);
                const caseDateLabel = formatCaseDateShort(clinicalCase?.publishedAt ?? clinicalCase?.updatedAt);
                const caseDatePrefix = isPublished ? 'F.Publicación' : 'F.Borrador';
                const deliveryDateLabel = formatCaseDateShort(clinicalCase?.desiredDeliveryAt);
                if (!caseDateLabel && !deliveryDateLabel) return null;
                return (
                  <span className="text-[10px] font-mono text-faint normal-case whitespace-nowrap">
                    {caseDateLabel && <><span className="text-faint/70">{caseDatePrefix} :</span> {caseDateLabel}</>}
                    {caseDateLabel && deliveryDateLabel && <span className="text-faint/40 mx-2">·</span>}
                    {deliveryDateLabel && <><span className="text-faint/70">F.Entrega :</span> {deliveryDateLabel}</>}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* BLOQUE DENTISTA / ADMIN (supervisión) */}
          {showCaseToolbar && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 shrink-0">
{/* Botón Centro de Control — solo cuando no es borrador */}
                  {clinicalCase.status !== 'borrador' && (() => {
                    const responsibilityBump =
                      authUserProfile?.id && userRole
                        ? responsibilityAttentionBump({
                            viewerRole: userRole,
                            viewerId: String(authUserProfile.id),
                            currentResponsibility: clinicalCase?.currentResponsibility,
                            assignedTechnicianId: clinicalCase?.assignedTechnicianId,
                            caseStatus: clinicalCase?.status,
                          })
                        : 0;
                    const totalUnread = isHubInboxSuppressedForCompletedCase(clinicalCase?.status)
                      ? 0
                      : unreadTechMessages + unreadNegotiationMessages + responsibilityBump;
                    return (
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleCaseHubOpen();
                          }}
                          className={`relative flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                            isHubOpen
                              ? 'bg-primary border-primary/30 text-inverse hover:bg-primary'
                              : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary hover:text-foreground'
                          }`}
                          aria-label={isHubOpen ? 'Cerrar Centro de control' : 'Abrir Centro de control'}
                        >
                          <UchHubIcon className="h-4 w-4" />
                          <span>Centro de Control</span>
                          {totalUnread > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-error text-inverse text-[9px] font-black rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-sm">
                              {totalUnread}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })()}
              </div>

              <div className="w-px h-8 bg-surface-off mx-2 hidden sm:block" />

              <CaseDetailManagementBar
                actions={detailActions}
                isEditing={isEditing}
                publishModalOpen={isPublishing}
                isDeleting={isDeleting}
                isCloning={isCloning}
                savingChanges={savingChanges}
                onRepublicar={() => setRepublicarOpen(true)}
                onEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
                onSave={() => void handleSaveChanges()}
                onPublishClick={() => {
                  if (isFormDirty) {
                    showErrorToast('Guarda los cambios antes de publicar.');
                    return;
                  }
                  setIsDeleting(false);
                  setPatientConsentChecked(false);
                  setIsPublishing(true);
                }}
                onDeleteClick={() => {
                  setDeleteInput('');
                  setIsDeleting(true);
                  setIsPublishing(false);
                }}
                onArchive={async () => {
                  const res = await archiveCaseForUserAction(id as string);
                  if (res.success) {
                    setClinicalCase((prev: any) => ({ ...prev, archivedByCurrentUser: true }));
                    showSuccessToastMessage('Caso archivado correctamente');
                  } else {
                    showErrorToast(res.error || 'No se pudo archivar el caso');
                  }
                }}
                onUnarchive={async () => {
                  const res = await unarchiveCaseForUserAction(id as string);
                  if (res.success) {
                    setClinicalCase((prev: any) => ({ ...prev, archivedByCurrentUser: false }));
                    showSuccessToastMessage('Caso restaurado en activos');
                  } else {
                    showErrorToast(res.error || 'No se pudo restaurar el caso');
                  }
                }}
                onCreateCopy={async () => {
                  setIsCloning(true);
                  setIsHubOpen(false);
                  setUchPanelMounted(false);
                  try {
                    const res = await cloneCaseFromTerminalAction(id as string);
                    if (res.success && res.newCaseId) {
                      const label =
                        'caseNumber' in res && res.caseNumber
                          ? String(res.caseNumber)
                          : res.newCaseId.slice(0, 8);
                      showSuccessToastMessage(`Copia creada: ${label}`);
                      setClinicalCase(null);
                      setCaseEvents([]);
                      router.replace(`/dashboard/cases/${res.newCaseId}`);
                    } else {
                      showErrorToast(
                        (!res.success && 'error' in res ? res.error : null) ||
                          'No se pudo crear la copia',
                      );
                    }
                  } finally {
                    setIsCloning(false);
                  }
                }}
                onDownloadCase={() => void handleDownloadCase()}
                isDownloadingCase={isDownloadingCase}
              />
            </div>
          )}

          {/* BLOQUE TÉCNICO (no aplica en vista admin pura; sí al simular laboratorio) */}
          {actingAsTecnico && !viewingAsAdmin && (() => {
            const isAssigned = assignedTechnicianIdStr != null;
            const isLoser = !!(viewerIdStr && isAssigned && assignedTechnicianIdStr !== viewerIdStr);
            const isWinner = !!(viewerIdStr && isAssigned && assignedTechnicianIdStr === viewerIdStr);
            const invPending = myInvitation?.status === 'pending';
            const invRejected = myInvitation?.status === 'rejected';
            // Un técnico que participó en el caso (tiene invitación → tiene acceso a esta
            // página) debe poder abrir el Centro de Control en solo lectura para revisar el
            // historial: tanto si su invitación fue rechazada mientras el caso sigue comparando
            // (propuestaLista) como en CUALQUIER estado terminal (completado/rechazado/cerrado),
            // donde puede no haber ganador (rechazado/cerrado) y antes ningún branch aplicaba.
            // Es también donde ve su propio mensaje "Invitación rechazada" + motivo.
            const rejectedCanOpenHub =
              (invRejected && clinicalCase?.status === 'propuestaLista') ||
              isTerminalCaseStatus(clinicalCase?.status);

            let buttonStyles = '';
            let label = '';
            let Icon = Activity;

            if (isLoser) {
              buttonStyles = 'bg-surface-2 text-muted border-divider hover:bg-surface-off';
              label = 'Centro de Control';
              Icon = FileText;
            } else if (isWinner) {
              buttonStyles = 'bg-primary/20 text-primary border-primary/30 hover:bg-primary/30';
              label = 'Centro de Control';
              Icon = Activity;
            } else if (invPending) {
              buttonStyles = 'bg-primary text-inverse shadow-lg shadow-sm hover:bg-primary';
              label = 'Responder asignación';
              Icon = Activity;
            } else if (rejectedCanOpenHub) {
              buttonStyles = 'bg-surface-2 text-muted border-divider hover:bg-surface-off';
              label = 'Centro de Control';
              Icon = FileText;
            } else {
              return null;
            }

            return (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleCaseHubOpen();
                }}
                className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${buttonStyles}`}
                aria-label={
                  label === 'Centro de Control'
                    ? isHubOpen
                      ? 'Cerrar Centro de control'
                      : 'Abrir Centro de control'
                    : isHubOpen
                      ? 'Cerrar panel del caso'
                      : label
                }
              >
                {isWinner && label === 'Centro de Control' ? (
                  <UchHubIcon className="h-4 w-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span>{label}</span>
                {invPending && myInvitation?.compensation != null && (
                  <span className="ml-1 text-[9px] font-mono text-foreground/70">
                    {formatCurrency(myInvitation.compensation)} · {myInvitation.deadlineDays}d
                  </span>
                )}
                {isWinner &&
                  unreadTechMessages > 0 &&
                  !isHubInboxSuppressedForCompletedCase(clinicalCase?.status) && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-error text-inverse text-[8px] font-black rounded-full flex items-center justify-center animate-bounce">
                    {unreadTechMessages}
                  </span>
                )}
              </button>
            );
          })()}

          {/* BLOQUE CALIDAD — botón Centro de Control */}
          {actingAsCalidad && clinicalCase?.status !== 'borrador' && (
            <button
              type="button"
              onClick={toggleCaseHubOpen}
              className={`relative flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30 ${
                isHubOpen
                  ? 'bg-amber-500 border-amber-400/30 text-white hover:bg-amber-500'
                  : 'bg-amber-500/10 border-amber-400/30 text-amber-400 hover:bg-amber-500 hover:text-white'
              }`}
              aria-label={isHubOpen ? 'Cerrar Centro de control' : 'Abrir Centro de control'}
            >
              <UchHubIcon className="h-4 w-4" />
              <span>Centro de Control</span>
            </button>
          )}

          {actingAsTecnico &&
            !showCaseToolbar &&
            (detailActions.archive.visible || detailActions.unarchive.visible) && (
            <CaseDetailManagementBar
              actions={detailActions}
              isEditing={false}
              publishModalOpen={false}
              isDeleting={false}
              isCloning={false}
              savingChanges={false}
              onEdit={() => undefined}
              onCancelEdit={() => undefined}
              onSave={() => undefined}
              onPublishClick={() => undefined}
              onDeleteClick={() => undefined}
              onArchive={async () => {
                const res = await archiveCaseForUserAction(id as string);
                if (res.success) {
                  setClinicalCase((prev: any) => ({ ...prev, archivedByCurrentUser: true }));
                  showSuccessToastMessage('Caso archivado en tu bandeja');
                } else {
                  showErrorToast(res.error || 'No se pudo archivar');
                }
              }}
              onUnarchive={async () => {
                const res = await unarchiveCaseForUserAction(id as string);
                if (res.success) {
                  setClinicalCase((prev: any) => ({ ...prev, archivedByCurrentUser: false }));
                  showSuccessToastMessage('Caso restaurado en activos');
                } else {
                  showErrorToast(res.error || 'No se pudo restaurar');
                }
              }}
              onCreateCopy={() => undefined}
              onDownloadCase={() => void handleDownloadCase()}
              isDownloadingCase={isDownloadingCase}
            />
          )}
        </div>
      </div>

      {/* S3-07: Banner Nudge — REMOVED PER USER REQUEST */}

      {/* v5.0 — Banner pendiente_pool (dentista): buscando técnicos disponibles */}
      {showPendingPoolBanner && (
        <PendingPoolBanner
          caseId={id as string}
          startedAt={clinicalCase?.pendingPoolStartedAt}
          onCancelled={async () => {
            const refreshed = await getCaseDetails(id as string);
            if (refreshed && !(refreshed as any)._error) ingestCasePayloadFromServer(refreshed);
            await loadCaseEvents();
            showSuccessToastMessage('Publicación cancelada. El caso quedó cerrado.');
            dispatchDashboardMetricsRefresh();
          }}
          onError={(msg) => showErrorToast(msg)}
        />
      )}

      {/* v5.0 — Modal republicar caso sin cotizaciones */}
      <RepublicarModal
        isOpen={republicarOpen}
        onClose={() => setRepublicarOpen(false)}
        caseId={id as string}
        caseLabel={clinicalCase?.caseNumber ? `#${clinicalCase.caseNumber}` : undefined}
        onDone={async () => {
          const refreshed = await getCaseDetails(id as string);
          if (refreshed && !(refreshed as any)._error) ingestCasePayloadFromServer(refreshed);
          await loadCaseEvents();
          showSuccessToastMessage('Caso republicado. Estamos buscando técnicos disponibles.');
          dispatchDashboardMetricsRefresh();
        }}
      />

      {/* v5.0 — Check-in al dentista al 50% del TTL en pendiente_pool */}
      <CheckInDentistaModal
        isOpen={checkInOpen}
        onClose={() => { setCheckInOpen(false); setCheckInDismissed(true); }}
        caseId={id as string}
        caseLabel={clinicalCase?.caseNumber ? `#${clinicalCase.caseNumber}` : undefined}
        onCancelled={async () => {
          const refreshed = await getCaseDetails(id as string);
          if (refreshed && !(refreshed as any)._error) ingestCasePayloadFromServer(refreshed);
          await loadCaseEvents();
          showSuccessToastMessage('Publicación cancelada. El caso quedó cerrado.');
          dispatchDashboardMetricsRefresh();
        }}
        onError={(msg) => showErrorToast(msg)}
      />

      {/* Estado en evaluación (asignación directa) — oculto en pendiente_pool */}
      {showPageEvalBanner && (
        <div className="flex items-center gap-4 bg-sky-500/8 border border-sky-500/20 rounded-2xl px-5 py-4">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-sky-400 rounded-full animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-primary">
              {hasPendingAssignment ? 'Esperando aceptación del técnico' : 'Fauchard está asignando tu caso'}
            </p>
            <p className="text-[11px] text-faint mt-0.5">
              {hasPendingAssignment
                ? 'El precio y plazo ya están definidos. Te avisaremos cuando el técnico acepte la asignación.'
                : 'El precio y plazo ya están definidos. Te avisaremos cuando un técnico acepte la asignación.'}
            </p>
          </div>
          {hasPendingAssignment && clinicalCase?.evaluationExpiresAt && !evalExpired && (
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black text-sky-500/60 uppercase tracking-widest mb-0.5">
                Plazo para aceptar la asignación
              </span>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-sm font-black text-foreground tabular-nums">
                  {String(evalH).padStart(2, '0')}:{String(evalM).padStart(2, '0')}:{String(evalS).padStart(2, '0')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WORKFLOW STEPPER */}
      <div className="bg-surface/60 border border-divider rounded-2xl px-6 py-4">
        <CaseWorkflowStepper
          currentStatus={isEditingStatus ?? clinicalCase?.status ?? 'borrador'}
          workDeadline={techOfferRejectedView ? undefined : clinicalCase?.workDeadline}
          variant={techOfferRejectedView ? 'techRejected' : 'case'}
          viewerRole={viewerRole}
          currentResponsibility={clinicalCase?.currentResponsibility ?? null}
        />
      </div>

      {/* Banner de caso republicado (STAB-020) */}
      {clinicalCase?.changeSummary && clinicalCase.status === 'publicado' && (clinicalCase.commercialVersion ?? 1) > 1 && (
        <div className="flex items-start gap-3 bg-warning-hl border border-warning/20 rounded-2xl px-5 py-3.5">
          <RotateCcw className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-black text-warning uppercase tracking-widest mb-0.5">
              Caso republicado — versión {clinicalCase.commercialVersion}
            </p>
            <p className="text-sm text-warning leading-relaxed">{clinicalCase.changeSummary}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="relative group">
            {modelConfig.length > 0 ? (
              <div className="relative h-[320px] sm:h-[450px] lg:h-[600px] w-full overflow-hidden rounded-[1.5rem] bg-surface/40">
                
                <DentalViewer3D
                  models={modelConfig}
                  annotations={displayedAnnotations.map((a: any) => ({
                    ...a,
                    coordinates: typeof a.coordinates === 'string' ? JSON.parse(a.coordinates) : a.coordinates
                  }))}
                  onToggleLayer={toggleSubtype}
                  onOpacityChange={handleOpacityChange}
                  onAnnotate={canEditForm ? setSelectedCoords : undefined}
                  canAnnotate={canEditForm}
                >
                  {selectedCoords && (
                    <NewAnnotationOverlay
                      key={`${selectedCoords.x}-${selectedCoords.y}-${selectedCoords.z}`}
                      context="caseCreation"
                      value={newAnnotationText}
                      onChange={setNewAnnotationText}
                      onCancel={() => setSelectedCoords(null)}
                      onSave={() => void handleSaveAnnotation()}
                      saving={savingAnnotation}
                    />
                  )}
                </DentalViewer3D>
              </div>
            ) : (
              <div className="w-full h-[280px] sm:h-[400px] lg:h-[500px] bg-surface/60 rounded-[1.5rem] border border-divider flex items-center justify-center flex-col gap-4 text-center px-6">
                {canEditForm || (clinicalCase && (clinicalCase.files?.length ?? 0) === 0) ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-warning-hl border border-warning/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-warning" />
                    </div>
                    <h3 className="text-foreground font-semibold">No hay archivos clínicos</h3>
                    <p className="text-xs text-muted max-w-xs">
                      {canEditForm
                        ? 'Carga un archivo (STL, PLY, OBJ, JPG, PNG) usando el botón "Agregar archivo" para visualizarlo aquí.'
                        : 'Este caso no tiene archivos clínicos cargados.'}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-teal-500 rounded-full animate-spin" />
                    <h3 className="text-foreground font-semibold">Cargando modelos 3D...</h3>
                  </>
                )}
              </div>
            )}
          </div>

          <section className="bg-surface shadow-sm border border-divider rounded-[1.5rem] border border-divider/50 bg-surface/40 p-6 flex flex-col items-center">
            <h3 className="text-foreground text-sm uppercase tracking-wide mb-4">Odontograma</h3>
            <TeethSelector
              selectedTeeth={canEditForm ? (editForm?.teeth ?? []) : (clinicalCase?.teeth ?? [])}
              onChange={teeth => setEditForm((p: any) => ({ ...p, teeth }))}
              readOnly={!canEditForm}
            />
          </section>

          {/* Archivos del Caso */}
          {(displayedFiles.length > 0 || canEditForm) && (
            <section className="bg-surface shadow-sm border border-divider rounded-[1.5rem] border border-divider/50 bg-surface/40 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Archivos Clínicos
                </h3>
                {canEditForm && (
                  <span className="text-[10px] text-faint uppercase">
                    {displayedFiles.length}/{MAX_CLINICAL_FILES}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {canEditForm && displayedFiles.length < MAX_CLINICAL_FILES && (
                  <label className="flex items-center justify-center gap-2 p-3 bg-background/40 rounded-xl border border-dashed border-divider hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all text-xs text-muted hover:text-primary">
                    <Upload className="w-4 h-4" />
                    Agregar archivo (STL, PLY, OBJ, JPG, PNG · máx 20 MB)
                    <input
                      type="file"
                      accept=".stl,.ply,.obj,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={handleClinicalFileUpload}
                    />
                  </label>
                )}
                {displayedFiles.map((f: any) => {
                  const url = f.staged ? f.previewUrl : downloadUrls[f.id];
                  return (
                    <div key={f.key} className={`flex items-center justify-between p-3 bg-background/60 rounded-xl border transition-all ${f.staged ? 'border-warning/20' : 'border-divider hover:border-primary/30'}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-primary-hl rounded-lg shrink-0">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-foreground font-bold truncate">{f.filename}</span>
                          <span className="text-[10px] text-faint uppercase">
                            {f.category} • {(f.size / 1024 / 1024).toFixed(2)} MB
                            {f.staged && <span className="ml-2 text-warning font-bold">· Pendiente</span>}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {url && !f.staged && (
                          <a
                            href={url}
                            download={f.filename}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => {
                              if (user?.id && clinicalCase) {
                                logFileDownloadAction({
                                  fileId: f.id,
                                  filename: f.filename,
                                  organizationId: clinicalCase.organizationId,
                                  userId: user.id
                                });
                              }
                            }}
                            aria-label="Descargar archivo"
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary-hl border border-primary/20 text-primary hover:bg-primary hover:text-inverse transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        {canEditForm && (
                          <button
                            type="button"
                            onClick={() => handleClinicalFileDelete(f.id)}
                            disabled={savingChanges}
                            aria-label="Eliminar archivo"
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-error-hl border border-error/20 text-error hover:bg-error hover:text-inverse transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Documentación complementaria — visible en borrador (edición) y para todos en estados activos */}
          {clinicalCase && (() => {
            const compFiles = ((clinicalCase.files ?? []) as any[]).filter((f: any) => f.category === 'complementary');
            const compStaged = stagedFileAdds.filter(s => s.category === 'complementary');
            const totalComp = compFiles.length + compStaged.length;
            const canAddComp = canEditForm && totalComp < MAX_COMPLEMENTARY_FILES;

            const handleCompFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
              const incoming = Array.from(e.target.files ?? []);
              e.target.value = '';
              for (const fileObj of incoming) {
                const ext = fileObj.name.split('.').pop()?.toLowerCase() ?? '';
                if (!ALLOWED_COMPLEMENTARY_EXTS.includes(ext)) { showErrorToast(`Formato no permitido: ${fileObj.name}`); continue; }
                if (fileObj.size > MAX_UPLOAD_SIZE_BYTES) { showErrorToast(`El archivo ${fileObj.name} supera 20 MB.`); continue; }
                if (totalComp >= MAX_COMPLEMENTARY_FILES) { showErrorToast(`Máximo ${MAX_COMPLEMENTARY_FILES} archivos complementarios.`); break; }
                const isDupeExisting = compFiles.some((f: any) => f.filename === fileObj.name && f.size === fileObj.size);
                const isDupeStaged = compStaged.some(s => s.file.name === fileObj.name && s.file.size === fileObj.size);
                if (isDupeExisting || isDupeStaged) { showErrorToast(`"${fileObj.name}" ya fue agregado.`); continue; }
                const staged: StagedFileAdd = {
                  tempId: `comp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
                  file: fileObj,
                  category: 'complementary',
                  subType: 'general',
                  previewUrl: URL.createObjectURL(fileObj),
                  filename: fileObj.name,
                  size: fileObj.size,
                  mimeType: fileObj.type,
                };
                setStagedFileAdds(prev => [...prev, staged]);
              }
              showSuccessToastMessage('Archivos complementarios pendientes — usa Grabar para confirmar');
            };

            if (compFiles.length === 0 && compStaged.length === 0 && !canEditForm) return null;
            return (
              <section className="bg-surface/40 rounded-[1.2rem] p-5 space-y-3 border border-divider">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted">Documentación complementaria</h3>
                  </div>
                  <span className="text-[10px] text-faint">{totalComp}/{MAX_COMPLEMENTARY_FILES}</span>
                </div>
                {canAddComp && (
                  <label className="flex items-center justify-center gap-2 p-3 bg-background/40 rounded-xl border border-dashed border-divider hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all text-xs text-muted hover:text-primary">
                    <Upload className="w-4 h-4" />
                    Agregar documentación (JPG, PNG, PDF, DOCX · máx 20 MB)
                    <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.docx,.stl,.ply,.obj" className="hidden" onChange={handleCompFileUpload} />
                  </label>
                )}
                {(compFiles.length > 0 || compStaged.length > 0) && (
                  <div className="flex flex-col gap-2">
                    {compFiles.map((f: any) => {
                      const url = downloadUrls[f.id];
                      return (
                        <div key={f.id} className="flex items-center justify-between p-3 bg-background/60 rounded-xl border border-divider">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-primary-hl rounded-lg shrink-0"><FileText className="w-4 h-4 text-primary" /></div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-foreground font-bold truncate">{f.filename}</span>
                              <span className="text-[10px] text-faint uppercase">{f.subType} • {(f.size / 1024 / 1024).toFixed(2)} MB</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {url && (
                              <a href={url} download={f.filename} target="_blank" rel="noreferrer" aria-label="Descargar" className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary-hl border border-primary/20 text-primary hover:bg-primary hover:text-inverse transition-colors">
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                            {canEditForm && (
                              <button type="button" onClick={() => handleClinicalFileDelete(f.id)} disabled={savingChanges} aria-label="Eliminar" className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-error-hl border border-error/20 text-error hover:bg-error hover:text-inverse transition-colors disabled:opacity-50">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {compStaged.map((s: StagedFileAdd) => (
                      <div key={s.tempId} className="flex items-center justify-between p-3 bg-background/60 rounded-xl border border-warning/20">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 bg-primary-hl rounded-lg shrink-0"><FileText className="w-4 h-4 text-primary" /></div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs text-foreground font-bold truncate">{s.filename}</span>
                            <span className="text-[10px] text-warning font-bold uppercase">Pendiente · {(s.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                        </div>
                        <button type="button" onClick={() => { URL.revokeObjectURL(s.previewUrl); setStagedFileAdds(prev => prev.filter(x => x.tempId !== s.tempId)); }} aria-label="Quitar" className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-error-hl border border-error/20 text-error hover:bg-error hover:text-inverse transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })()}
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4 relative z-[100]">
          {/* PANEL DE EVALUACIÓN Y CIERRE (DENTISTA) REMOVIDO PARA MOVER A PANEL LATERAL */}

          {/* RESPUESTA A SOLICITUDES (DENTISTA) */}
          {actingAsDentista && clinicalCase?.pendingActionRequest && clinicalCase.pendingActionActor !== user?.id && (
            <section className="bg-warning border border-warning/20 rounded-[1.2rem] p-5 space-y-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-warning" />
                <h3 className="text-foreground font-bold uppercase text-xs">Solicitud del Técnico</h3>
              </div>
              <p className="text-[11px] text-muted">El técnico ha solicitado **{clinicalCase.pendingActionRequest === 'pausa' ? 'PAUSAR' : 'CANCELAR'}** el trabajo.</p>
              <div className="flex gap-3">
                <button onClick={() => handleResolveFlowRequest(false)} className="flex-1 py-3 bg-surface-2 text-foreground text-[10px] font-bold rounded-xl uppercase">Rechazar</button>
                <button onClick={() => handleResolveFlowRequest(true)} className="flex-1 py-3 bg-warning text-inverse text-[10px] font-bold rounded-xl uppercase">Aprobar Solicitud</button>
              </div>
            </section>
          )}

          <div className="relative space-y-6">
            {uchPanelMounted && clinicalCase && (
              <motion.div
                key={`uch-panel-${id}`}
                initial={false}
                animate={{
                  opacity: isHubOpen ? 1 : 0,
                  x: isHubOpen ? 0 : -50,
                }}
                transition={{ duration: 0.2 }}
                className={`absolute right-[calc(100%+1.5rem)] top-0 w-full z-[200] flex flex-col h-[500px] min-h-0 lg:h-[600px] bg-transparent ${
                  !isHubOpen ? 'pointer-events-none select-none' : ''
                }`}
                style={{ visibility: isHubOpen ? 'visible' : 'hidden' }}
                aria-hidden={!isHubOpen}
              >
                <UnifiedCaseHub
                  caseId={id as string}
                  initialEvents={caseEvents}
                  uchHasMoreOlder={uchHasMoreOlder}
                  onLoadOlderUchEvents={loadOlderUchEvents}
                  currentUser={viewerSignedImage ? { ...authUserProfile, image: viewerSignedImage } : authUserProfile}
                  actingAsDentista={actingAsDentista}
                  actingAsTecnico={actingAsTecnico}
                  actingAsCalidad={actingAsCalidad}
                  viewingAsAdmin={viewingAsAdmin}
                  uchPresentationRole={uchPresentationRole}
                  caseStatus={clinicalCase.status}
                  clinicalCase={clinicalCase}
                  myInvitation={myInvitation}
                  techOfferRejectedView={techOfferRejectedView}
                  onInvitationUpdate={async () => {
                    const [invRes, c] = await Promise.all([
                      getMyInvitationForCaseAction(id as string),
                      getCaseDetails(id as string),
                    ]);
                    setMyInvitation(invRes.data);
                    if (c && !(c as any)._error) ingestCasePayloadFromServer(c);
                    await loadCaseEvents();
                  }}
                  onClose={() => setIsHubOpen(false)}
                  onActionTriggered={handleHubAction}
                  proposalDeadlineMs={proposalDeadlineMs}
                  reviewDeadlineMs={reviewDeadlineMs}
                  qualityReviewDeadlineMs={qualityReviewDeadlineMs}
                  serverClockAnchor={serverClockAnchor}
                  newMessageCount={unreadTechMessages + unreadNegotiationMessages}
                  onAcknowledgeNew={acknowledgeNewHubMessages}
                  derivedFromCalidadName={clinicalCase?.derivedFromCalidadName ?? null}
                  hasPendingDerivationForMe={clinicalCase?.hasPendingDerivationForMe ?? false}
                  pendingDerivationFromName={clinicalCase?.pendingDerivationFromName ?? null}
                  pendingDerivationReasonLabel={clinicalCase?.pendingDerivationReasonLabel ?? null}
                  pendingDerivationComment={clinicalCase?.pendingDerivationComment ?? null}
                  hasPendingDerivationOutgoing={clinicalCase?.hasPendingDerivationOutgoing ?? false}
                  myQualityAssignmentStatus={clinicalCase?.myQualityAssignmentStatus ?? null}
                  onDerivationRejected={() => router.push('/dashboard/cases')}
                />
              </motion.div>
            )}

            <section className="bg-surface shadow-sm border border-divider p-0 rounded-[1.2rem] border border-divider/30 overflow-hidden flex flex-col h-[500px] lg:h-[600px]">
              {/* ESPECIFICACIONES */}
              <div className="flex-1 flex-col h-full">
                {true ? (
                  <div className="flex flex-col h-full">
                    <div className="p-6 border-b border-divider flex items-center justify-between bg-surface-off">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary-hl flex items-center justify-center text-primary">
                          <Stethoscope className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Especificaciones del Caso</h3>
                          <p className="text-[9px] text-primary/80 font-bold uppercase tracking-widest">Detalles clínicos y materiales</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto flex-1 p-6 custom-scrollbar space-y-6">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1">
                          <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Restauración</span>
                          {canEditForm ? (
                            <select
                              className="w-full bg-surface border border-primary/30 rounded px-3 py-2 text-foreground text-xs outline-none"
                              value={editForm?.restorationType ?? ''}
                              onChange={e => {
                                const code = e.target.value;
                                const label = restorationTypes.find(t => t.code === code)?.label;
                                setEditForm((prev: any) => ({
                                  ...prev,
                                  restorationType: code,
                                  replacesMissingTeeth: label === 'Puente' ? true : prev.replacesMissingTeeth,
                                }));
                              }}
                            >
                              {restorationTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-foreground font-medium">{clinicalCase?.restorationType}</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Prioridad</span>
                          {canEditForm ? (
                            <select
                              className="w-full bg-surface border border-primary/30 rounded px-3 py-2 text-foreground text-xs outline-none"
                              value={editForm?.urgency ?? ''}
                              onChange={e => setEditForm((prev: any) => ({ ...prev, urgency: e.target.value }))}
                            >
                              {urgencyLevels.map(u => (
                                <option key={u.id} value={u.label}>{u.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-foreground font-medium uppercase tracking-widest">{clinicalCase?.urgency}</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Material</span>
                          {canEditForm ? (
                            <select
                              className="w-full bg-surface border border-primary/30 rounded px-3 py-2 text-foreground text-xs outline-none"
                              value={editForm?.material ?? ''}
                              onChange={e => setEditForm((prev: any) => ({ ...prev, material: e.target.value }))}
                            >
                              <option value="">Seleccione material...</option>
                              {dentalMaterials.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-foreground font-medium">{clinicalCase?.material || 's/n'}</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Color Vita</span>
                          {canEditForm ? (
                            <select
                              className="w-full bg-surface border border-primary/30 rounded px-3 py-2 text-foreground text-xs outline-none"
                              value={editForm?.shade ?? ''}
                              onChange={e => setEditForm((prev: any) => ({ ...prev, shade: e.target.value }))}
                            >
                              {vitaShades.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-primary font-black uppercase">{clinicalCase?.shade}</span>
                          )}
                        </div>
                        <div className="space-y-1 col-span-2">
                          <span className="text-[10px] text-faint uppercase font-black tracking-widest block">
                            ¿Reemplaza dientes ausentes (pónticos)?
                          </span>
                          {canEditForm ? (
                            <>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditForm((prev: any) => ({ ...prev, replacesMissingTeeth: true }))}
                                  className={`flex-1 py-2 rounded-lg border text-[10px] font-bold uppercase ${
                                    editForm?.replacesMissingTeeth === true
                                      ? 'border-primary/40 bg-primary/10 text-primary'
                                      : 'border-divider text-muted'
                                  }`}
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditForm((prev: any) => ({ ...prev, replacesMissingTeeth: false }))}
                                  className={`flex-1 py-2 rounded-lg border text-[10px] font-bold uppercase ${
                                    editForm?.replacesMissingTeeth === false
                                      ? 'border-primary/40 bg-primary/10 text-primary'
                                      : 'border-divider text-muted'
                                  }`}
                                >
                                  No
                                </button>
                              </div>
                              <p className="text-[10px] text-muted mt-1">
                                Distingue coronas múltiples de puentes. Se sugiere automáticamente «Sí» para restauración Puente.
                              </p>
                            </>
                          ) : (
                            <span className="text-xs text-foreground font-medium">
                              {clinicalCase?.replacesMissingTeeth === true
                                ? 'Sí'
                                : clinicalCase?.replacesMissingTeeth === false
                                  ? 'No'
                                  : '—'}
                            </span>
                          )}
                        </div>
                        {(clinicalCase?.derivedCategory || clinicalCase?.derivedWorkType) && (
                          <>
                            <div className="space-y-1">
                              <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Categoría operativa</span>
                              <span className="text-xs text-foreground font-medium">
                                {clinicalCase?.derivedCategory
                                  ? WORK_CATEGORY_LABELS[clinicalCase.derivedCategory as keyof typeof WORK_CATEGORY_LABELS]
                                  : '—'}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Tipo de trabajo</span>
                              <span className="text-xs text-foreground font-medium">
                                {clinicalCase?.derivedWorkType
                                  ? (WORK_TYPE_LABELS[clinicalCase.derivedWorkType] ?? clinicalCase.derivedWorkType)
                                  : '—'}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Complejidad</span>
                              <span className="text-xs text-foreground font-medium capitalize">
                                {clinicalCase?.caseComplexity ?? '—'}
                              </span>
                            </div>
                            {viewingAsAdmin && (
                              <div className="space-y-1">
                                <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Liga (Fauchard)</span>
                                <span className="text-xs text-foreground font-medium capitalize">
                                  {clinicalCase?.caseLeague ?? '—'}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        <div className="space-y-1 col-span-2">
                          <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Entrega deseada</span>
                          {canEditForm ? (
                            <DesiredDeliveryPicker
                              compact
                              value={editForm?.desiredDeliveryAt ?? ''}
                              onChange={(desiredDeliveryAt) => setEditForm((prev: any) => ({ ...prev, desiredDeliveryAt }))}
                            />
                          ) : (
                            <CaseDesiredDeliveryReadOnly value={clinicalCase?.desiredDeliveryAt} />
                          )}
                        </div>
                        {shouldShowListPriceToViewer({ role: userRole, viewingAsAdmin }) &&
                          (clinicalCase?.listPriceSale != null || viewingAsAdmin) && (
                          <div className="space-y-1 col-span-2">
                            <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Precio de referencia</span>
                            {viewingAsAdmin && clinicalCase?.listPriceCost != null ? (
                              <div className="text-xs text-muted space-y-0.5">
                                <p>Costo: {formatCurrency(parseFloat(String(clinicalCase.listPriceCost)))}</p>
                                <p>Fee: {(parseFloat(String(clinicalCase.listPriceFeePercent ?? 0)) * 100).toFixed(1)}%</p>
                                <p className="text-primary font-bold">
                                  Venta: {clinicalCase.listPriceSale != null ? formatCurrency(parseFloat(String(clinicalCase.listPriceSale))) : '—'}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-primary font-bold">
                                {clinicalCase?.listPriceSale != null
                                  ? formatCurrency(parseFloat(String(clinicalCase.listPriceSale)))
                                  : 'No definido'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {canEditForm && draftListPriceChecked && draftListPriceSale == null && clinicalCase?.listPriceSale == null && (
                        <div className="rounded-xl border border-warning/30 bg-warning-hl p-4 flex items-start gap-3 text-warning">
                          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                          <p className="text-sm leading-snug">
                            No hay tarifa para esta combinación. Podrás guardar el borrador, pero no podrás publicar hasta que exista una regla de precio.
                          </p>
                        </div>
                      )}

                      <div className="pt-4 border-t border-divider space-y-4">
                        <div className="space-y-2">
                          <span className="text-[10px] text-faint uppercase font-black tracking-widest block">Instrucciones Especiales</span>
                          <div className="bg-surface p-4 rounded-xl border border-divider space-y-4">
                            {canEditForm ? (
                              <textarea
                                className="w-full bg-background/50 border border-primary/30 rounded-xl px-4 py-3 text-[11px] text-muted outline-none resize-none"
                                rows={3}
                                placeholder="Instrucciones adicionales para el técnico..."
                                value={editForm?.doctorNotes ?? ''}
                                onChange={e => setEditForm((prev: any) => ({ ...prev, doctorNotes: e.target.value }))}
                              />
                            ) : (
                              <div>
                                <p className="text-[11px] text-muted leading-relaxed italic">
                                  {creationInstructionsText(clinicalCase ?? {}) || 'No hay instrucciones adicionales.'}
                                </p>
                              </div>
                            )}
                            
                            <div className="pt-3 border-t border-divider">
                              <span className="text-[9px] text-primary uppercase font-black tracking-widest block mb-1">Notas Estéticas</span>
                              {canEditForm ? (
                                <input
                                  className="w-full bg-background/50 border border-primary/30 rounded-lg px-3 py-2 text-[11px] text-muted outline-none"
                                  placeholder="Translucidez, mamelones, etc."
                                  value={editForm?.notesEsthetic ?? ''}
                                  onChange={e => setEditForm((prev: any) => ({ ...prev, notesEsthetic: e.target.value }))}
                                />
                              ) : (
                                <p className="text-[11px] text-muted leading-relaxed italic">
                                  {clinicalCase?.notesEsthetic?.trim() || 'Sin notas estéticas.'}
                                </p>
                              )}
                            </div>

                            <div className="pt-3 border-t border-divider">
                              <span className="text-[9px] text-primary uppercase font-black tracking-widest block mb-1">Notas Oclusales</span>
                              {canEditForm ? (
                                <input
                                  className="w-full bg-background/50 border border-primary/30 rounded-lg px-3 py-2 text-[11px] text-muted outline-none"
                                  placeholder="Puntos de contacto, guía, etc."
                                  value={editForm?.notesOclusal ?? ''}
                                  onChange={e => setEditForm((prev: any) => ({ ...prev, notesOclusal: e.target.value }))}
                                />
                              ) : (
                                <p className="text-[11px] text-muted leading-relaxed italic">
                                  {clinicalCase?.notesOclusal?.trim() || 'Sin notas oclusales.'}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                ) : (null /* specs is the only view */
                )}
              </div>
            </section>



            <section className="bg-surface shadow-sm border border-divider rounded-[1.5rem] border border-divider/30 flex flex-col min-h-[250px]">
              <div className="p-6 border-b border-divider flex items-center justify-between bg-surface-off">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary-hl flex items-center justify-center text-primary">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Anotaciones 3D</h3>
                    <p className="text-[9px] text-primary/80 font-bold uppercase tracking-widest">{displayedAnnotations.length} notas clínicas registradas</p>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto max-h-[300px]">
                {[...displayedAnnotations].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((a: any) => (
                  <div key={a.id} className={`p-3 bg-surface/40 border rounded-xl ${a.staged ? 'border-warning/20' : 'border-divider/50'}`}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-primary font-bold uppercase">
                        {a.user?.fullName}
                        {a.staged && <span className="ml-2 text-warning">· Pendiente</span>}
                      </span>
                      <span className="text-[9px] text-faint">{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-foreground">{a.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {isCloning && (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-background/70 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-4 px-8 py-10 rounded-[2rem] bg-surface/95 border border-primary/30 shadow-2xl">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-4 border-primary/30/15 rounded-full" />
              <div className="absolute inset-0 border-4 border-primary/30 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-primary">
              Creando copia del caso…
            </p>
            <p className="text-[10px] text-faint text-center max-w-xs">
              Copiando archivos y generando el nuevo borrador
            </p>
          </div>
        </div>
      )}

      {isDeleting && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[20vh] pointer-events-none">
          <FocusTrap onEscape={() => { setIsDeleting(false); setDeleteInput(''); }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-surface/95 backdrop-blur-xl border border-error/20 p-8 rounded-[2.5rem] max-w-sm w-full text-center space-y-6 shadow-[0_50px_100px_rgba(220,38,38,0.3)] pointer-events-auto"
          >
            <div className="w-20 h-20 bg-error-hl rounded-full flex items-center justify-center mx-auto text-error">
              <Trash2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl text-foreground font-bold tracking-tight">¿Eliminar este caso?</h3>
              <p className="text-[11px] text-faint uppercase font-black tracking-widest leading-loose">Esta acción es permanente e irreversible.</p>
              {clinicalCase && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary/90 pt-1">
                  {formatCaseIdAndPac(clinicalCase.caseNumber, clinicalCase.patientIdAnon)}
                </p>
              )}
              {clinicalCase?.copiedFromCaseId && (
                <p className="text-[10px] text-faint normal-case tracking-normal font-medium">
                  Copia del caso{' '}
                  {clinicalCase.copiedFromCaseNumber
                    ? `#${clinicalCase.copiedFromCaseNumber}`
                    : `#${String(clinicalCase.copiedFromCaseId).slice(0, 8)}`}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Escribe <span className="text-error underline">ELIMINAR</span> para confirmar</p>
              <input
                placeholder="Escribe aquí..."
                className="w-full bg-background border border-divider p-4 rounded-2xl text-center text-foreground focus:border-error/30 outline-none transition-all font-bold tracking-[0.2em]"
                onChange={e => setDeleteInput(e.target.value.toUpperCase())}
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                variant="ghost"
                className="flex-1 py-4"
                onClick={() => { setIsDeleting(false); setDeleteInput(''); }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1 py-4"
                loading={loadingAction === 'delete'}
                disabled={deleteInput !== 'ELIMINAR'}
                onClick={handleDeleteCase}
              >
                Eliminar
              </Button>
            </div>
          </motion.div>
          </FocusTrap>
        </div>
      )}




      {/* MODAL DE CONFIRMACIÓN DE PUBLICACIÓN DE CASO (DENTISTA) */}
      {isPublishing && (
        <div className="fixed inset-0 z-[500] flex items-start justify-center p-4 pt-[12vh] bg-background/60 backdrop-blur-sm">
          <FocusTrap onEscape={() => setIsPublishing(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            className="bg-surface/98 backdrop-blur-xl border border-primary/30 p-8 rounded-[2.5rem] max-w-lg w-full shadow-[0_50px_100px_rgba(20,184,166,0.15)] space-y-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-primary-hl rounded-2xl flex items-center justify-center text-primary flex-shrink-0">
                <Globe className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl text-foreground font-bold tracking-tight">Publicar Caso</h3>
                <p className="text-xs text-faint mt-0.5">DentFlowAi asignará un laboratorio según el precio de lista fijado</p>
              </div>
            </div>

            {isFormDirty && (
              <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning-hl px-4 py-3">
                <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-sm text-warning leading-relaxed">
                  Tienes cambios sin guardar. Debes guardarlos antes de publicar el caso.
                </p>
              </div>
            )}

            {!detailActions.publish.enabled && detailActions.publish.disabledReason && (
              <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning-hl px-4 py-3">
                <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-sm text-warning leading-relaxed">{detailActions.publish.disabledReason}</p>
              </div>
            )}

            {/* Resumen del caso (UX-019) */}
            <div className="rounded-2xl border border-divider bg-surface-2 p-4">
              <p className="mb-3 text-[9px] font-bold uppercase tracking-wider text-faint">Resumen del caso</p>
              <div className="max-h-[min(52vh,28rem)] space-y-2.5 overflow-y-auto pr-1">
                {buildPublishCaseSummaryRows(clinicalCase).map(r => (
                  <div key={r.label} className="flex items-start justify-between gap-3 text-xs">
                    <span className="shrink-0 text-faint">{r.label}</span>
                    <span className="max-w-[min(20rem,62%)] text-right font-medium break-words text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cumplimiento legal (Ley 21.719 / Ley 20.584) — declaración del dentista, no firma del paciente */}
            <label className="flex items-start gap-3 rounded-2xl border border-divider bg-surface-2 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={patientConsentChecked}
                onChange={(e) => setPatientConsentChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-primary shrink-0"
              />
              <span className="text-xs text-foreground leading-relaxed">
                Declaro contar con el consentimiento del paciente para el tratamiento de sus datos clínicos
                (Ley 21.719 / Ley 20.584).
              </span>
            </label>

            <div className="flex gap-4">
              <Button variant="ghost" className="flex-1 py-3.5" onClick={() => setIsPublishing(false)}>
                Cancelar
              </Button>
              {isFormDirty ? (
                <Button
                  variant="primary"
                  className="flex-1 py-3.5"
                  loading={loadingAction === 'publish' || savingChanges}
                  disabled={!patientConsentChecked}
                  onClick={() => void handlePublish({ saveFirst: true })}
                >
                  Guardar y publicar
                </Button>
              ) : (
                <Button
                  variant="primary"
                  className="flex-1 py-3.5"
                  loading={loadingAction === 'publish'}
                  disabled={!detailActions.publish.enabled || !patientConsentChecked}
                  onClick={() => void handlePublish()}
                >
                  Publicar ahora
                </Button>
              )}
            </div>
          </motion.div>
          </FocusTrap>
        </div>
      )}






    </div>
  );
}

function CaseDetailPageLoadingFallback() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 space-y-4">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 border-4 border-primary/30/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-primary/30 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(20,184,166,0.2)]" />
      </div>
      <p className="text-primary font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Sincronizando Expediente...</p>
    </div>
  );
}

export default function CaseDetailPage() {
  return (
    <Suspense fallback={<CaseDetailPageLoadingFallback />}>
      <CaseDetailPageContent />
    </Suspense>
  );
}
