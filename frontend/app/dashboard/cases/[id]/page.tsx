'use client';

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  FileText,
  User,
  CheckCircle,
  AlertCircle,
  Shield,
  Activity,
  Download,
  XCircle,
  Stethoscope,
  Layers,
  Edit,
  Trash2,
  Upload,
  Eye,
  Save,
  RotateCcw,
  X,
  Globe,
  Star,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
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
  requestFlowChangeAction,
  resolveFlowRequestAction,
  resumeWorkAction,
  transitionToManufacturingAction,
  registerDispatchAction,
  confirmReceptionAction,
  submitUserRatingAction,
  getCaseEventsAction,
  archiveCaseForUserAction,
  unarchiveCaseForUserAction,
  cloneCaseFromTerminalAction,
  publishCaseAction,
} from '@/lib/db/actions/cases';
import { getCaseDetailActionState } from '@/lib/cases/caseDetailActions';
import { isActiveCaseStatus } from '@/lib/constants/dental';
import CaseDetailManagementBar from '@/components/cases/CaseDetailManagementBar';
import Link from 'next/link';
import { startWorkAction } from '@/lib/db/actions/proposal';
import { createAnnotationAction, deleteAnnotationAction } from '@/lib/db/actions/annotations';
import { registerFileAction, logFileDownloadAction, deleteCaseFileAction } from '@/lib/db/actions/files';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { logError } from '@/lib/logger';
import { SERVICE_TYPE_LABELS, SERVICE_TYPES } from '@/lib/constants/dental';
import {
  listVitaShadesAction,
  listRestorationTypesAction,
  listDentalMaterialsAction,
  listUrgencyLevelsAction,
  type CatalogOption,
} from '@/lib/db/actions/catalogs';
import DentalViewer3D from '@/components/DentalViewer3D';
import { TeethSelector } from '@/components/cases/TeethSelector';
import STLThumbnail from '@/components/cases/STLThumbnail';
import UnifiedCaseHub from '@/components/cases/UnifiedCaseHub';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import CaseViewerStatusStripe from '@/components/cases/CaseViewerStatusStripe';
import type { InvitationStatusForKpi } from '@/lib/dashboard/classifyCaseForDashboardKpi';
import CaseWorkflowStepper from '@/components/cases/CaseWorkflowStepper';
import { CaseServiceTypeBadge, UchHubIcon } from '@/components/cases/CaseFichaHubAndServiceIcons';
import FocusTrap from '@/components/ui/FocusTrap';
import { checkProposalExpiryAction } from '@/lib/db/actions/proposal';
import { dispatchDashboardMetricsRefresh } from '@/lib/dashboard/dashboardRefresh';
import { getMyInvitationForCaseAction } from '@/lib/db/actions/invitations';
import type { InvitationItem } from '@/lib/db/actions/invitations';
import { getCaseHubReadStateAction, markCaseHubReadAction } from '@/lib/db/actions/hubRead';
import { countUnreadNegChannel, countUnreadTechChannel, type UchUnreadEvent } from '@/lib/uchUnread';
import {
  responsibilityAttentionBump,
  isHubInboxSuppressedForCompletedCase,
} from '@/lib/caseResponsibilityAttention';
import { formatDistanceToNow } from 'date-fns';
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

  return <span className="text-[10px] text-teal-200/80 font-mono tracking-normal shrink-0">hace {elapsed}</span>;
};

const formatDate = (dateValue: string | Date) => {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

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
    { label: 'Escala color', value: strField(c.shade) },
    { label: 'Complejidad', value: complexity },
    { label: 'Urgencia', value: urgency },
    { label: 'Archivos', value: fileHint },
  ];

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
  const actionLoading = loadingAction !== null;
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
    category: 'scan' | 'design_upload';
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
  const [isDeliveryManagementOpen, setIsDeliveryManagementOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteInput, setDeleteInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingLabNotes, setIsSavingLabNotes] = useState(false);
  const [labNotes, setLabNotes] = useState('');
  const [isHubOpen, setIsHubOpen] = useState(false);
  /** Tras abrir el Centro de control una vez, el panel permanece montado (oculto al cerrar) para no reiniciar cuentas regresivas. */
  const [uchPanelMounted, setUchPanelMounted] = useState(false);
  const [caseEvents, setCaseEvents] = useState<any[]>([]);
  /** Cursores de lectura del Centro de control (servidor). */
  const [hubServerReads, setHubServerReads] = useState<{
    lastReadTech: Date | null;
    lastReadNeg: Date | null;
  } | null>(null);
  /** Hay más eventos en BD anteriores al lote cargado (paginación UCH). */
  const [uchHasMoreOlder, setUchHasMoreOlder] = useState(false);
  const [myInvitation, setMyInvitation] = useState<InvitationItem | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any | null>(null);
  const [savingChanges, setSavingChanges] = useState(false);

  const [revisionNotes, setRevisionNotes] = useState('');
  const [isRequestingFlowChange, setIsRequestingFlowChange] = useState(false);
  const [flowChangeReason, setFlowChangeReason] = useState('');
  const [flowChangeType, setFlowChangeType] = useState<'pausa' | 'cancelacion' | null>(null);
  const [technicalComment, setTechnicalComment] = useState('');
  const [pendingDeliveryFiles, setPendingDeliveryFiles] = useState<File[]>([]);
  const [isUploadingDelivery, setIsUploadingDelivery] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const assignedTechnicianIdStr = useMemo(
    () => normalizedAssignedTechnicianId(clinicalCase),
    [clinicalCase?.assignedTechnicianId],
  );
  const viewerIdStr = authUserProfile?.id ? String(authUserProfile.id) : null;

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
      const { events, hasMoreOlder } = await getCaseEventsAction(id as string);
      setCaseEvents(events);
      setUchHasMoreOlder(hasMoreOlder);
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

  useEffect(() => {
    if (isHubOpen) {
      loadCaseEvents();
    }
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
        const res = await requestRevisionAction(id as string, reason);
        if (res.success) {
          showSuccessToastMessage('Ajustes solicitados al técnico');
        } else {
          showErrorToast((res as any)?.error || 'Error al solicitar revisión');
          return false;
        }
      } else if (action === 'start_manufacturing') {
        const res = await transitionToManufacturingAction(id as string);
        if (!res.success) {
          const msg = (res as { error?: string }).error || 'No se pudo iniciar fabricación';
          showErrorToast(msg);
          return false;
        }
        showSuccessToastMessage('Fabricación iniciada');
      } else if (action === 'register_dispatch') {
        const courier =
          typeof data?.courier === 'string' && data.courier.trim()
            ? data.courier.trim()
            : 'Interno';
        const trackingId =
          typeof data?.trackingId === 'string' ? data.trackingId.trim() : '';
        if (!trackingId || trackingId.toUpperCase() === 'N/A') {
          showErrorToast(
            'Indica un número de seguimiento, enlace o referencia de despacho.',
          );
          return false;
        }
        const res = await registerDispatchAction(id as string, { courier, trackingId });
        if (!res.success) {
          const msg = (res as { error?: string }).error || 'Error al registrar despacho';
          showErrorToast(msg);
          return false;
        }
        showSuccessToastMessage('Información de despacho registrada');
      } else if (action === 'confirm_reception') {
        const res = await confirmReceptionAction(id as string);
        if (!res?.success) {
          showErrorToast((res as any)?.error || 'No se pudo confirmar la recepción');
          return false;
        }
        showSuccessToastMessage("Recepción confirmada");
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
  const deliveries = clinicalCase?.deliveries || [];

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
    void markCaseHubReadAction(id as string);
  }, [isHubOpen, id, clinicalCase?.id]);

  useEffect(() => {
    openHubAppliedRef.current = false;
    techWinnerHubAutoOpenRef.current = false;
    setIsHubOpen(false);
    setHubServerReads(null);
    setUchPanelMounted(false);
    setIsDeleting(false);
    setDeleteInput('');
  }, [id]);

  useEffect(() => {
    techWinnerHubAutoOpenRef.current = false;
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
          status: c.status,
          serviceType: c.serviceType
        });

        // 2. Obtener URLs Firmadas para el Visor 3D y Descargas Generales
        if (c?.files?.length) {
          const viewerUrls: Record<string, string> = {};
          const allUrls: Record<string, string> = {};
          const initialVisible = new Set<string>();

          await Promise.all(c.files.map(async (file: any) => {
            try {
              const signedUrl = await getSignedUrlAction(file.gcsPath);
              if (signedUrl) {
                // Guardar la URL firmada para la lista de descargas
                allUrls[file.id] = signedUrl;
                
                // Si es un archivo compatible con el visor 3D, lo agregamos al diccionario del visor
                // Visor: escaneos, diseños del técnico y archivo de diseño del dentista en solo_fabricacion (design_upload).
                if (file.category === 'scan' || file.category === 'design' || file.category === 'design_upload') {
                  const subType = file.subType || 'default';
                  viewerUrls[subType] = signedUrl;
                  if (subType === 'superior' || subType === 'inferior') {
                    initialVisible.add(subType);
                  }
                }
              }
            } catch (err) {
              logError('Error getting signed URL', err, { caseId: caseIdStr, filename: file.filename });
            }
          }));

          setFileUrls(viewerUrls);
          setDownloadUrls(allUrls);
          if (initialVisible.size === 0 && Object.keys(viewerUrls).length > 0) {
            initialVisible.add(Object.keys(viewerUrls)[0]);
          }
          setVisibleSubtypes(initialVisible);
        }

        // 3. Obtener Eventos del Hub (página amplia + flag para cargar anteriores)
        setIsLoadingEvents(true);
        const evPage = await getCaseEventsAction(caseIdStr);
        setCaseEvents(evPage.events || []);
        setUchHasMoreOlder(evPage.hasMoreOlder);
        setIsLoadingEvents(false);

        const rs = await getCaseHubReadStateAction(caseIdStr);
        if (rs) {
          setHubServerReads({
            lastReadTech: rs.lastReadTechHubAt ? new Date(rs.lastReadTechHubAt) : null,
            lastReadNeg: rs.lastReadNegHubAt ? new Date(rs.lastReadNegHubAt) : null,
          });
        } else {
          setHubServerReads({ lastReadTech: null, lastReadNeg: null });
        }

        // 4. Invitación del técnico (si aplica)
        const fetchAsTecnico = prof.role === 'tecnico';
        if (fetchAsTecnico) {
          const invRes = await getMyInvitationForCaseAction(caseIdStr);
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
        .filter((f: any) => !stagedFileRemovals.has(f.id)).length;
      const finalFileCount = existingKept + stagedFileAdds.length;
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
        const folder = staged.category === 'design_upload' ? 'design' : 'scans';
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
      await updateClinicalCaseAction(id as string, editForm);

      // 6) Refetch + regenerar signed URLs (visor 3D / descargas) + revoke previews + limpiar staging.
      const refreshed = await getCaseDetails(id as string);
      if (refreshed && !(refreshed as any)._error) {
        ingestCasePayloadFromServer(refreshed);
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

  const handleStatusUpdate = async (newStatus: 'borrador' | 'publicado') => {
    setActionLoading(true, newStatus === 'publicado' ? 'publish' : 'withdraw');
    try {
      await updateClinicalCaseAction(id as string, { status: newStatus });
      setClinicalCase((prev: any) => ({ ...prev, status: newStatus }));

      // Sincronizamos el estado en el formulario de edición si está abierto
      if (editForm) {
        setEditForm((prev: any) => ({ ...prev, status: newStatus }));
      }

      showSuccessToastMessage(newStatus === 'publicado' ? 'Caso publicado exitosamente' : 'Caso retirado a borrador');

      setIsPublishing(false);
    } catch (err) {
      logError('Error updating status', err, { caseId: id, status: newStatus });
      showErrorToast('Error al actualizar el estado del caso');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublish = async (opts?: { saveFirst?: boolean }) => {
    if (opts?.saveFirst) {
      const saved = await handleSaveChanges();
      if (!saved) return;
    }
    setActionLoading(true, 'publish');
    try {
      const res = await publishCaseAction(id as string);
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
      showSuccessToastMessage('Caso enviado a evaluación. DentFlowAi está seleccionando el laboratorio.');
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

  const handleSaveLabNotes = async () => {
    if (!clinicalCase) return;
    setIsSavingLabNotes(true);
    try {
      await updateClinicalCaseAction(id as string, { labNotes: labNotes });
      setClinicalCase((prev: any) => prev ? ({ ...prev, labNotes }) : prev);
      showSuccessToastMessage('Oferta retirada');
    } catch (error) {
      showErrorToast('Error al guardar las notas de laboratorio');
    } finally {
      setIsSavingLabNotes(false);
    }
  };

  const handleStartWork = async () => {
    setActionLoading(true, 'start_work');
    try {
      const res = await startWorkAction(id as string);
      if (res.success) {
        setClinicalCase((prev: any) => {
          const newHistory = {
            action: 'TRABAJO_INICIADO',
            timestamp: new Date().toISOString(),
            userName: authUserProfile?.fullName || 'Técnico',
            comment: 'El laboratorio ha iniciado formalmente la producción.',
            metadata: { technicianId: authUserProfile?.id }
          };
          return {
            ...prev,
            status: 'enEjecucion'
          };
        });
        showSuccessToastMessage('Diseño iniciado');
      } else {
        showErrorToast('Error al iniciar el trabajo');
      }
    } catch (error) {
      showErrorToast('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTechnicalIteration = async (mode: 'comment' | 'delivery' | 'revision') => {
    if (!clinicalCase) return;
    if (mode === 'comment' && !technicalComment.trim()) return;
    if (mode === 'revision' && !technicalComment.trim()) {
      showErrorToast('Debes explicar por qué solicitas cambios');
      return;
    }
    if (mode === 'delivery' && pendingDeliveryFiles.length === 0) {
      showErrorToast('Debes adjuntar al menos un archivo de entrega');
      return;
    }

    setIsUploadingDelivery(true);
    try {
      if (mode === 'comment' || mode === 'revision') {
        const res = await addTechnicalCommentAction(id as string, technicalComment, mode === 'revision');
        if (res.success) {
          showSuccessToastMessage(mode === 'revision' ? 'Cambios solicitados' : 'Comentario enviado');
          setTechnicalComment('');
          const updatedCase = await getCaseDetails(id as string);
          if (updatedCase && !(updatedCase as any)._error) ingestCasePayloadFromServer(updatedCase);
        }
      } else if (mode === 'delivery') {
        const uploadedPaths: string[] = [];
        for (const fileObj of pendingDeliveryFiles) {
          const fileName = `organizations/${clinicalCase.organizationId}/cases/${id}/deliveries/v${(clinicalCase.deliveries?.length || 0) + 1}/${Date.now()}_${fileObj.name}`;
          const { body: uploadBody, contentEncoding } = await maybeGzipForUpload(fileObj);
          const uploadUrl = await getUploadUrlAction(
            fileName,
            fileObj.type,
            contentEncoding ? { contentEncoding } : undefined,
          );
          if (!uploadUrl) throw new Error("No se pudo obtener la URL de subida");
          await fetch(uploadUrl, {
            method: 'PUT',
            body: uploadBody,
            headers: {
              'Content-Type': fileObj.type,
              ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
            },
          });
          uploadedPaths.push(fileName);
        }

        const res = await submitReviewAction(id as string, technicalComment || 'Nueva versión de entrega', uploadedPaths);
        if (res.success) {
          showSuccessToastMessage('Entrega enviada');
          setTechnicalComment('');
          setPendingDeliveryFiles([]);
          const updatedCase = await getCaseDetails(id as string);
          if (updatedCase && !(updatedCase as any)._error) ingestCasePayloadFromServer(updatedCase);
        }
      }
    } catch (error) {
      console.error("Technical iteration error:", error);
      showErrorToast('Error en la operación técnica');
    } finally {
      setIsUploadingDelivery(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!revisionNotes.trim()) {
      showErrorToast('Por favor, indica qué ajustes son necesarios.');
      return;
    }
    setActionLoading(true, 'request_revision');
    try {
      const res = await requestRevisionAction(id as string, revisionNotes);
      if (res.success) {
        const refreshed = await getCaseDetails(id as string);
        if (refreshed && !(refreshed as any)._error) {
          ingestCasePayloadFromServer(refreshed);
        } else {
          setClinicalCase((prev: any) => (prev ? { ...prev, status: 'enEjecucion' } : prev));
        }
        setRevisionNotes('');
        showSuccessToastMessage('Ajustes solicitados al técnico');
      } else {
        showErrorToast('Error al solicitar revisión');
      }
    } catch (error) {
      showErrorToast('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestFlowChange = async () => {
    if (!flowChangeType || !flowChangeReason.trim()) {
      showErrorToast('Debes indicar el motivo del cambio.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await requestFlowChangeAction(id as string, flowChangeType, flowChangeReason);
      if (res.success) {
        setClinicalCase((prev: any) => ({
          ...prev,
          pendingActionRequest: flowChangeType,
          pendingActionActor: user?.id
        }));
        setIsRequestingFlowChange(false);
        setFlowChangeReason('');
        showSuccessToastMessage('Solicitud de cambio enviada');
      } else {
        showErrorToast('Error al solicitar el cambio');
      }
    } catch (error) {
      showErrorToast('Error de conexión');
    } finally {
      setActionLoading(false);
    }
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

  const handleResumeWork = async () => {
    setActionLoading(true);
    try {
      const res = await resumeWorkAction(id as string, 'El trabajo se ha reanudado satisfactoriamente.');
      if (res.success) {
        setClinicalCase((prev: any) => ({ ...prev, status: 'enEjecucion' }));
        showSuccessToastMessage('Trabajo reanudado');
      } else {
        showErrorToast('Error al reanudar el trabajo');
      }
    } catch (error) {
      showErrorToast('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartManufacturing = async () => {
    setActionLoading(true);
    try {
      const res = await transitionToManufacturingAction(id as string);
      if (res.success) {
        setClinicalCase((prev: any) => ({
          ...prev,
          status: 'enFabricacion',
          completedAt: null,
          currentResponsibility: 'tecnico',
        }));
        showSuccessToastMessage('Iniciado proceso de fabricación física');
      } else {
        showErrorToast(res.error || 'Error al iniciar fabricación');
      }
    } catch (error) {
      showErrorToast('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterDispatch = async (courier: string, trackingId: string) => {
    setActionLoading(true);
    try {
      const res = await registerDispatchAction(id as string, { courier, trackingId });
      if (res.success) {
        setClinicalCase((prev: any) => ({ 
          ...prev, 
          status: 'enviado',
          dispatchInfo: { courier, trackingId, dispatchedAt: new Date().toISOString() }
        }));
        showSuccessToastMessage('Información de despacho registrada');
      } else {
        showErrorToast(res.error || 'Error al registrar despacho');
      }
    } catch (error) {
      showErrorToast('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReception = async () => {
    setActionLoading(true);
    try {
      const res = await confirmReceptionAction(id as string);
      if (res.success) {
        setClinicalCase((prev: any) => ({ ...prev, status: 'recibido' }));
        showSuccessToastMessage('Recepción confirmada. ¡Trabajo entregado!');
      } else {
        showErrorToast(res.error || 'Error al confirmar recepción');
      }
    } catch (error) {
      showErrorToast('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (userRating === 0) {
      showErrorToast('Por favor selecciona una calificación');
      return;
    }
    setActionLoading(true);
    try {
      const revieweeId = actingAsDentista ? assignedTechnicianIdStr : clinicalCase.doctorId;
      const res = await submitUserRatingAction({ caseId: id as string, revieweeId: revieweeId as string, rating: userRating, comment: userReview });
      if (res.success) {
        setClinicalCase((prev: any) => ({ ...prev, status: 'completado', rating: userRating, review: userReview }));
        showSuccessToastMessage('¡Gracias por tu evaluación! Caso finalizado.');
      } else {
        showErrorToast(res.error || 'Error al enviar evaluación');
      }
    } catch (error) {
      showErrorToast('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    setActionLoading(true);
    try {
      await updateClinicalCaseAction(id as string, { status: newStatus });
      setClinicalCase((prev: any) => prev ? ({ ...prev, status: newStatus }) : prev);
      showSuccessToastMessage('Estado actualizado');
    } catch (error) {
      showErrorToast('Error al actualizar el estado del caso');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDesignUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clinicalCase || !user) return;

    setIsUploading(true);
    try {
      const gcsPath = `organizations/${clinicalCase.organizationId}/cases/${id}/designs/${Date.now()}_${file.name}`;

      const { body: uploadBody, contentEncoding } = await maybeGzipForUpload(file);
      const uploadUrl = await getUploadUrlAction(
        gcsPath,
        file.type,
        contentEncoding ? { contentEncoding } : undefined,
      );
      if (!uploadUrl) throw new Error("No se pudo obtener URL de subida");

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        body: uploadBody,
        headers: {
          'Content-Type': file.type,
          ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
        },
      });

      if (!res.ok) throw new Error("Fallo en la subida a GCS");

      await registerFileAction({
        caseId: id as string,
        organizationId: clinicalCase.organizationId,
        uploaderId: user.id || (user as any).uid,
        filename: file.name,
        category: 'design',
        subType: 'final_design',
        size: file.size,
        mimeType: file.type,
        gcsPath: gcsPath
      });

      const updatedCase = await getCaseDetails(id as string);
      if (updatedCase && !(updatedCase as any)._error) ingestCasePayloadFromServer(updatedCase);
      showSuccessToastMessage('Archivo registrado correctamente');
    } catch (error) {
      logError('Error uploading design', error, { caseId: id });
      showErrorToast('Error al subir el diseño');
    } finally {
      setIsUploading(false);
    }
  };

  const MAX_CLINICAL_FILES = 3;
  const ALLOWED_CLINICAL_EXTS = ['stl', 'ply', 'obj', 'jpg', 'jpeg', 'png'];

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

    const existingKept = (clinicalCase.files ?? []).filter((f: any) => !stagedFileRemovals.has(f.id)).length;
    const totalDisplayed = existingKept + stagedFileAdds.length;
    if (totalDisplayed >= MAX_CLINICAL_FILES) {
      showErrorToast(`Máximo ${MAX_CLINICAL_FILES} archivos clínicos.`);
      return;
    }

    const isSoloFab = clinicalCase.serviceType === 'solo_fabricacion';
    const category: 'scan' | 'design_upload' = isSoloFab ? 'design_upload' : 'scan';

    // Asignar el próximo slot canónico libre (igual que el wizard de creación).
    const usedSubTypes = new Set<string>([
      ...((clinicalCase.files ?? []) as any[])
        .filter((f: any) => !stagedFileRemovals.has(f.id))
        .map((f: any) => f.subType),
      ...stagedFileAdds.map(s => s.subType),
    ]);
    let subType: string;
    if (isSoloFab) {
      subType = 'dentist_design';
      if (usedSubTypes.has(subType)) {
        showErrorToast('Ya existe un archivo de diseño para este caso.');
        return;
      }
    } else {
      const slot = (['superior', 'inferior', 'bite'] as const).find(s => !usedSubTypes.has(s));
      if (!slot) {
        showErrorToast('No hay slots disponibles (superior/inferior/bite ocupados).');
        return;
      }
      subType = slot;
    }

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
      .filter((f: any) => !stagedFileRemovals.has(f.id))
      .map((f: any) => ({ ...f, staged: false as const, key: f.id }));
    const added = stagedFileAdds.map(s => ({
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
    });
    setIsEditing(true);
  }, [clinicalCase, fieldsEditable]);

  const formSnapshot = (c: Record<string, unknown> | null | undefined) => {
    if (!c) return '';
    return JSON.stringify({
      internalName: c.internalName,
      patientIdAnon: c.patientIdAnon,
      urgency: c.urgency,
      teeth: c.teeth,
      restorationType: c.restorationType,
      material: c.material,
      shade: c.shade,
      notesEsthetic: c.notesEsthetic,
      notesOclusal: c.notesOclusal,
      doctorNotes: c.specialInstructions ?? c.doctorNotes,
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
      }),
    [
      caseStatus,
      clinicalCase?.publishedAt,
      clinicalCase?.archivedByCurrentUser,
      clinicalCase?.canDelete,
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

  const isEditingStatus = fieldsEditable && editForm ? editForm.status : caseStatus;

  const canToggleEdit = actingAsDentista;

  if (!loading && (!clinicalCase || clinicalCase._error)) {
    const debug = clinicalCase?._debug;

    return (
      <div className="text-center py-20 bg-slate-950 min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6">
          <XCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl text-white serif-font">Caso no encontrado</h2>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">
          {clinicalCase?._error === 'NotFound'
            ? "El servidor no encontró el caso con los permisos actuales."
            : "No tenemos registro de este caso o no tienes los permisos necesarios."}
        </p>

        {/* Panel de Diagnóstico Forense */}
        {debug && (
          <div className="mt-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl text-left max-w-2xl w-full">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-teal-500 mb-4 flex items-center gap-2">
              <Shield className="w-3 h-3" /> Reporte Forense del Servidor
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[9px] text-slate-500 uppercase font-bold">Case solicitado:</p>
                <p className="text-[11px] text-white font-mono break-all bg-black/30 p-2 rounded border border-white/5">{debug.caseId}</p>
              </div>
              <div className="space-y-2">
                <p className="text-[9px] text-slate-500 uppercase font-bold">Identidad Servidor:</p>
                <div className="p-2 bg-black/30 rounded border border-white/5 space-y-1">
                   <p className="text-[10px] text-white"><span className="text-slate-500">Email:</span> {debug.email}</p>
                   <p className="text-[10px] text-white"><span className="text-slate-500">Role DB:</span> <span className="text-teal-400 font-bold uppercase">{debug.userRoleInDB}</span></p>
                   <p className="text-[10px] text-white"><span className="text-slate-500">Master Key:</span> <span className={debug.isSystemAdmin ? "text-green-500" : "text-amber-500"}>{debug.isSystemAdmin ? "ACTIVA" : "INACTIVA"}</span></p>
                   {debug.message && (
                     <p className="text-[9px] text-red-400 mt-2 bg-red-500/5 p-2 rounded border border-red-500/10 font-mono italic">
                       Error: {debug.message}
                     </p>
                   )}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] text-slate-600 font-black uppercase tracking-widest">
               <span>Criterio: {debug.criteria}</span>
               <span>DentFlow Forensic v1.0</span>
            </div>
          </div>
        )}
        
        <button 
          onClick={() => router.push('/dashboard')} 
          className="mt-8 text-slate-500 hover:text-white font-bold uppercase tracking-widest text-[9px] px-8 py-3 bg-slate-900 border border-slate-800 rounded-full transition-all"
        >
          Volver al Dashboard
        </button>
      </div>
    );
  }

  // Guardia de Carga
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 space-y-4">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 border-4 border-teal-500/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-teal-500 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(20,184,166,0.2)]" />
        </div>
        <p className="text-teal-500 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Sincronizando Expediente...</p>
      </div>
    );
  }

  // Renderizado Final
  return (
    <div className="space-y-4 animate-fade-in font-sans pb-10 px-4">
      {/* HEADER SECTION — z-index por encima del panel UCH (col. derecha) para que abrir/cerrar responda siempre al clic */}
      <div className="relative z-[450] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} aria-label="Volver" className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            {canEditForm ? (
              <input
                className="text-2xl serif-font bg-slate-900/50 border border-teal-500/30 rounded-xl px-4 py-1 text-white focus:outline-none w-full"
                value={editForm?.internalName}
                onChange={e => setEditForm((prev: any) => ({ ...prev, internalName: e.target.value }))}
              />
            ) : (
              <h1 className="text-2xl serif-font text-white uppercase">{clinicalCase?.internalName}</h1>
            )}
            {fieldsEditable && !isEditing && (
              <p className="text-[10px] text-slate-500/90 mt-1 font-medium normal-case tracking-normal">
                Borrador — pulsa Editar para ajustar los datos clínicos
              </p>
            )}
            {clinicalCase?.copiedFromCaseId && (
              <p className="text-[10px] text-slate-500 mt-1 normal-case tracking-normal">
                Copia del caso{' '}
                {clinicalCase.copiedFromCaseNumber ? (
                  <Link
                    href={`/dashboard/cases/${clinicalCase.copiedFromCaseId}`}
                    className="text-teal-500/90 hover:text-teal-400 font-semibold"
                  >
                    #{clinicalCase.copiedFromCaseNumber}
                  </Link>
                ) : (
                  <span>#{String(clinicalCase.copiedFromCaseId).slice(0, 8)}</span>
                )}
              </p>
            )}
            {isActiveCaseStatus(caseStatus) && (
              <p className="text-[10px] text-slate-500/90 mt-1 font-medium normal-case tracking-normal">
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
                <StatusBadge status={isEditingStatus} />
              )}
              {canEditForm ? (
                <select 
                  value={editForm?.serviceType} 
                  onChange={e => setEditForm((prev: any) => ({ ...prev, serviceType: e.target.value }))}
                  className="bg-slate-900 border border-teal-500/30 rounded px-2 py-1 text-teal-400 text-[10px] uppercase font-black tracking-widest outline-none"
                >
                  {Object.values(SERVICE_TYPES).map(t => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t] || t}</option>)}
                </select>
              ) : (
                <CaseServiceTypeBadge serviceType={clinicalCase?.serviceType} />
              )}
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                {caseNumberLabel(clinicalCase?.caseNumber) ? (
                  <>
                    <span className="text-teal-500/90">{caseNumberLabel(clinicalCase?.caseNumber)}</span>
                    <span className="mx-1">·</span>
                  </>
                ) : null}
                <span>PAC:</span>
                {canEditForm ? (
                  <input
                    className="bg-slate-900 border border-teal-500/30 rounded px-2 py-0.5 text-white outline-none w-32"
                    value={editForm?.patientIdAnon}
                    onChange={e => setEditForm((prev: any) => ({ ...prev, patientIdAnon: e.target.value }))}
                  />
                ) : (
                  <span>{clinicalCase?.patientIdAnon ?? '—'}</span>
                )}
              </div>
              {clinicalCase?.internalStatus && authUserProfile?.role === 'admin' && (
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 border border-slate-700 tracking-wider">
                  ⚙ {clinicalCase.internalStatus}
                </span>
              )}
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
                          className={`relative flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40 ${
                            isHubOpen
                              ? 'bg-teal-600 border-teal-500 text-white hover:bg-teal-500'
                              : 'bg-teal-600/10 border-teal-500/30 text-teal-400 hover:bg-teal-600 hover:text-white'
                          }`}
                          aria-label={isHubOpen ? 'Cerrar Centro de control' : 'Abrir Centro de control'}
                        >
                          <UchHubIcon className="h-4 w-4" />
                          <span>Centro de Control</span>
                          {totalUnread > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-rose-900/50">
                              {totalUnread}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })()}
              </div>

              <div className="w-px h-8 bg-white/10 mx-2 hidden sm:block" />

              <CaseDetailManagementBar
                actions={detailActions}
                isEditing={isEditing}
                publishModalOpen={isPublishing}
                isDeleting={isDeleting}
                isCloning={isCloning}
                savingChanges={savingChanges}
                onEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
                onSave={() => void handleSaveChanges()}
                onPublishClick={() => {
                  setIsDeleting(false);
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
              />
            </div>
          )}

          {/* BLOQUE TÉCNICO (no aplica en vista admin pura; sí al simular laboratorio) */}
          {actingAsTecnico && !viewingAsAdmin && (() => {
            const isAssigned = assignedTechnicianIdStr != null;
            const isLoser = !!(viewerIdStr && isAssigned && assignedTechnicianIdStr !== viewerIdStr);
            const isWinner = !!(viewerIdStr && isAssigned && assignedTechnicianIdStr === viewerIdStr);
            const invPending = myInvitation?.status === 'pending';
            const invQuoted = myInvitation?.status === 'quoted';
            const invRejected = myInvitation?.status === 'rejected';
            const rejectedCanOpenHub =
              invRejected &&
              (clinicalCase?.status === 'propuestaLista' || clinicalCase?.status === 'cerrado');

            let buttonStyles = '';
            let label = '';
            let Icon = Activity;

            if (isLoser) {
              buttonStyles = 'bg-slate-800 text-slate-400 border-slate-700/50 hover:bg-slate-700';
              label = 'Centro de Control';
              Icon = FileText;
            } else if (isWinner) {
              buttonStyles = 'bg-teal-600/20 text-teal-400 border-teal-500/30 hover:bg-teal-600/30';
              label = 'Centro de Control';
              Icon = Activity;
            } else if (invPending) {
              buttonStyles = 'bg-teal-600 text-white shadow-lg shadow-teal-900/20 hover:bg-teal-500';
              label = 'Enviar Oferta';
              Icon = Activity;
            } else if (invQuoted) {
              buttonStyles = 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20';
              label = 'Cotización Enviada';
              Icon = Clock;
            } else if (rejectedCanOpenHub) {
              buttonStyles = 'bg-slate-800 text-slate-400 border-slate-700/50 hover:bg-slate-700';
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
                className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40 ${buttonStyles}`}
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
                {invQuoted && myInvitation?.quotedPrice && (
                  <span className="ml-1 text-[9px] font-mono text-white/70">
                    {formatCurrency(myInvitation.quotedPrice)} · {myInvitation.quotedDays}d
                  </span>
                )}
                {isWinner &&
                  unreadTechMessages > 0 &&
                  !isHubInboxSuppressedForCompletedCase(clinicalCase?.status) && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-600 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-bounce">
                    {unreadTechMessages}
                  </span>
                )}
              </button>
            );
          })()}

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
            />
          )}
        </div>
      </div>

      {/* S3-07: Banner Nudge — REMOVED PER USER REQUEST */}

      {/* Estado "En Evaluación" para el dentista */}
      {showCaseToolbar && clinicalCase?.status === 'enEvaluacion' && (
        <div className="flex items-center gap-4 bg-sky-500/8 border border-sky-500/20 rounded-2xl px-5 py-4">
          <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-sky-300">Tu caso está siendo evaluado</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Faucard está seleccionando el laboratorio más adecuado. Recibirás una propuesta pronto.</p>
          </div>
          {clinicalCase?.evaluationExpiresAt && !evalExpired && (
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black text-sky-500/60 uppercase tracking-widest mb-0.5">
                Plazo para recibir cotizaciones
              </span>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-sm font-black text-white tabular-nums">
                  {String(evalH).padStart(2, '0')}:{String(evalM).padStart(2, '0')}:{String(evalS).padStart(2, '0')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WORKFLOW STEPPER */}
      <div className="bg-slate-900/60 border border-white/5 rounded-2xl px-6 py-4">
        <CaseWorkflowStepper
          currentStatus={isEditingStatus ?? clinicalCase?.status ?? 'borrador'}
          serviceType={clinicalCase?.serviceType}
          workDeadline={techOfferRejectedView ? undefined : clinicalCase?.workDeadline}
          variant={techOfferRejectedView ? 'techRejected' : 'case'}
        />
      </div>

      {/* Banner de caso republicado (STAB-020) */}
      {clinicalCase?.changeSummary && clinicalCase.status === 'publicado' && (clinicalCase.commercialVersion ?? 1) > 1 && (
        <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/25 rounded-2xl px-5 py-3.5">
          <RotateCcw className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-0.5">
              Caso republicado — versión {clinicalCase.commercialVersion}
            </p>
            <p className="text-sm text-amber-200/70 leading-relaxed">{clinicalCase.changeSummary}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="relative group">
            {modelConfig.length > 0 ? (
              <div className="relative h-[320px] sm:h-[450px] lg:h-[600px] w-full overflow-hidden rounded-[1.5rem] bg-slate-900/40">
                {/* WATERMARK ESTADO LICITACIÓN — solo si ya se aceptó (no en propuestaLista) */}
                {assignedTechnicianIdStr != null && clinicalCase?.status !== 'propuestaLista' && (
                  <div className="absolute top-10 -left-14 z-50 pointer-events-none transform -rotate-45 w-64 text-center drop-shadow-xl">
                    {(actingAsDentista || (viewerIdStr != null && assignedTechnicianIdStr === viewerIdStr)) ? (
                      <div className="bg-teal-600/90 text-white font-black uppercase text-[10px] tracking-[0.2em] py-1.5 shadow-lg shadow-teal-900/50 backdrop-blur-sm border-y border-teal-400/30">
                        OFERTA ACEPTADA
                      </div>
                    ) : (
                      <div className="bg-rose-600/90 text-white font-black uppercase text-[10px] tracking-[0.2em] py-1.5 shadow-lg shadow-rose-900/50 backdrop-blur-sm border-y border-rose-400/30">
                        OFERTA RECHAZADA
                      </div>
                    )}
                  </div>
                )}
                
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
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className="absolute bottom-6 left-6 right-6 lg:left-1/4 lg:right-1/4 bg-slate-900/95 backdrop-blur-xl border border-white/10 p-5 rounded-3xl shadow-2xl z-50 flex flex-col md:flex-row items-center gap-4"
                    >
                      <div className="flex-1 w-full">
                        <p className="text-[10px] text-teal-400 font-bold uppercase tracking-widest mb-2">Nueva Anotación</p>
                        <input
                          autoFocus
                          value={newAnnotationText}
                          onChange={(e) => setNewAnnotationText(e.target.value)}
                          className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                          placeholder="Tu observación aquí..."
                        />
                      </div>
                      <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => setSelectedCoords(null)} className="p-3 bg-slate-800 text-slate-400 rounded-xl"><X className="w-5 h-5" /></button>
                        <button
                          onClick={handleSaveAnnotation}
                          disabled={savingAnnotation || !newAnnotationText.trim()}
                          className="flex-1 px-6 bg-teal-600 text-white rounded-xl font-bold"
                        >
                          {savingAnnotation ? "..." : "Guardar"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </DentalViewer3D>
              </div>
            ) : (
              <div className="w-full h-[280px] sm:h-[400px] lg:h-[500px] bg-slate-900/60 rounded-[1.5rem] border border-slate-800 flex items-center justify-center flex-col gap-4 text-center px-6">
                {canEditForm || (clinicalCase && (clinicalCase.files?.length ?? 0) === 0) ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-amber-400" />
                    </div>
                    <h3 className="text-white font-semibold">No hay archivos clínicos</h3>
                    <p className="text-xs text-slate-400 max-w-xs">
                      {canEditForm
                        ? 'Carga un archivo (STL, PLY, OBJ, JPG, PNG) usando el botón "Agregar archivo" para visualizarlo aquí.'
                        : 'Este caso no tiene archivos clínicos cargados.'}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
                    <h3 className="text-white font-semibold">Cargando modelos 3D...</h3>
                  </>
                )}
              </div>
            )}
          </div>

          <section className="glass-effect rounded-[1.5rem] border border-slate-800/50 bg-slate-900/40 p-6 flex flex-col items-center">
            <h3 className="text-white text-sm uppercase tracking-wide mb-4">Odontograma</h3>
            <TeethSelector
              selectedTeeth={canEditForm ? (editForm?.teeth ?? []) : (clinicalCase?.teeth ?? [])}
              onChange={teeth => canEditForm && setEditForm((p: any) => ({ ...p, teeth }))}
            />
          </section>

          {/* Archivos del Caso */}
          {(displayedFiles.length > 0 || canEditForm) && (
            <section className="glass-effect rounded-[1.5rem] border border-slate-800/50 bg-slate-900/40 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white text-sm uppercase tracking-wide flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-400" />
                  Archivos Clínicos
                </h3>
                {canEditForm && (
                  <span className="text-[10px] text-slate-500 uppercase">
                    {displayedFiles.length}/{MAX_CLINICAL_FILES}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {canEditForm && displayedFiles.length < MAX_CLINICAL_FILES && (
                  <label className="flex items-center justify-center gap-2 p-3 bg-slate-950/40 rounded-xl border border-dashed border-slate-700 hover:border-teal-500/40 hover:bg-teal-500/5 cursor-pointer transition-all text-xs text-slate-400 hover:text-teal-300">
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
                    <div key={f.key} className={`flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border transition-all ${f.staged ? 'border-amber-500/30' : 'border-white/5 hover:border-teal-500/30'}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-teal-500/10 rounded-lg shrink-0">
                          <FileText className="w-4 h-4 text-teal-400" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-white font-bold truncate">{f.filename}</span>
                          <span className="text-[10px] text-slate-500 uppercase">
                            {f.category} • {(f.size / 1024 / 1024).toFixed(2)} MB
                            {f.staged && <span className="ml-2 text-amber-400 font-bold">· Pendiente</span>}
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
                            className="p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
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
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all disabled:opacity-50"
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
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4 relative z-[100]">
          {/* PANEL DE EVALUACIÓN Y CIERRE (DENTISTA) REMOVIDO PARA MOVER A PANEL LATERAL */}

          {/* RESPUESTA A SOLICITUDES (DENTISTA) */}
          {actingAsDentista && clinicalCase?.pendingActionRequest && clinicalCase.pendingActionActor !== user?.id && (
            <section className="bg-amber-600/10 border border-amber-500/30 rounded-[1.2rem] p-5 space-y-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <h3 className="text-white font-bold uppercase text-xs">Solicitud del Técnico</h3>
              </div>
              <p className="text-[11px] text-slate-400">El técnico ha solicitado **{clinicalCase.pendingActionRequest === 'pausa' ? 'PAUSAR' : 'CANCELAR'}** el trabajo.</p>
              <div className="flex gap-3">
                <button onClick={() => handleResolveFlowRequest(false)} className="flex-1 py-3 bg-slate-800 text-white text-[10px] font-bold rounded-xl uppercase">Rechazar</button>
                <button onClick={() => handleResolveFlowRequest(true)} className="flex-1 py-3 bg-amber-600 text-white text-[10px] font-bold rounded-xl uppercase">Aprobar Solicitud</button>
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
                  currentUser={authUserProfile}
                  actingAsDentista={actingAsDentista}
                  actingAsTecnico={actingAsTecnico}
                  viewingAsAdmin={viewingAsAdmin}
                  uchPresentationRole={uchPresentationRole}
                  caseStatus={clinicalCase.status}
                  clinicalCase={clinicalCase}
                  myInvitation={myInvitation}
                  techOfferRejectedView={techOfferRejectedView}
                  onInvitationUpdate={async () => {
                    const invRes = await getMyInvitationForCaseAction(id as string);
                    setMyInvitation(invRes.data);
                    const c = await getCaseDetails(id as string);
                    if (c && !(c as any)._error) ingestCasePayloadFromServer(c);
                    await loadCaseEvents();
                  }}
                  onClose={() => setIsHubOpen(false)}
                  onActionTriggered={handleHubAction}
                  proposalDeadlineMs={proposalDeadlineMs}
                  serverClockAnchor={serverClockAnchor}
                />
              </motion.div>
            )}

            <section className="glass-effect p-0 rounded-[1.2rem] border border-slate-800/30 overflow-hidden flex flex-col h-[500px] lg:h-[600px]">
              {/* ESPECIFICACIONES */}
              <div className="flex-1 flex-col h-full">
                {true ? (
                  <div className="flex flex-col h-full">
                    <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-teal-500/20 flex items-center justify-center text-teal-400">
                          <Stethoscope className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white uppercase tracking-widest">Especificaciones del Caso</h3>
                          <p className="text-[9px] text-teal-400/80 font-bold uppercase tracking-widest">Detalles clínicos y materiales</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto flex-1 p-6 custom-scrollbar space-y-6">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">Restauración</span>
                          {canEditForm ? (
                            <select
                              className="w-full bg-slate-900 border border-teal-500/30 rounded px-3 py-2 text-white text-xs outline-none"
                              value={editForm?.restorationType ?? ''}
                              onChange={e => setEditForm((prev: any) => ({ ...prev, restorationType: e.target.value }))}
                            >
                              {restorationTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-white font-medium">{clinicalCase?.restorationType}</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">Prioridad</span>
                          {canEditForm ? (
                            <select
                              className="w-full bg-slate-900 border border-teal-500/30 rounded px-3 py-2 text-white text-xs outline-none"
                              value={editForm?.urgency ?? ''}
                              onChange={e => setEditForm((prev: any) => ({ ...prev, urgency: e.target.value }))}
                            >
                              {urgencyLevels.map(u => (
                                <option key={u.id} value={u.label}>{u.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-white font-medium uppercase tracking-widest">{clinicalCase?.urgency}</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">Material</span>
                          {canEditForm ? (
                            <select
                              className="w-full bg-slate-900 border border-teal-500/30 rounded px-3 py-2 text-white text-xs outline-none"
                              value={editForm?.material ?? ''}
                              onChange={e => setEditForm((prev: any) => ({ ...prev, material: e.target.value }))}
                            >
                              <option value="">Seleccione material...</option>
                              {dentalMaterials.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-white font-medium">{clinicalCase?.material || 's/n'}</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">Color Vita</span>
                          {canEditForm ? (
                            <select
                              className="w-full bg-slate-900 border border-teal-500/30 rounded px-3 py-2 text-white text-xs outline-none"
                              value={editForm?.shade ?? ''}
                              onChange={e => setEditForm((prev: any) => ({ ...prev, shade: e.target.value }))}
                            >
                              {vitaShades.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-teal-400 font-black uppercase">{clinicalCase?.shade}</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5 space-y-4">
                        <div className="space-y-2">
                          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">Instrucciones Especiales</span>
                          <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 space-y-4">
                            {canEditForm ? (
                              <textarea
                                className="w-full bg-slate-950/50 border border-teal-500/30 rounded-xl px-4 py-3 text-[11px] text-slate-300 outline-none resize-none"
                                rows={3}
                                placeholder="Instrucciones adicionales para el técnico..."
                                value={editForm?.doctorNotes ?? ''}
                                onChange={e => setEditForm((prev: any) => ({ ...prev, doctorNotes: e.target.value }))}
                              />
                            ) : (
                              <div>
                                <p className="text-[11px] text-slate-300 leading-relaxed italic">
                                  {creationInstructionsText(clinicalCase ?? {}) || 'No hay instrucciones adicionales.'}
                                </p>
                              </div>
                            )}
                            
                            <div className="pt-3 border-t border-white/5">
                              <span className="text-[9px] text-teal-400 uppercase font-black tracking-widest block mb-1">Notas Estéticas</span>
                              {canEditForm ? (
                                <input
                                  className="w-full bg-slate-950/50 border border-teal-500/30 rounded-lg px-3 py-2 text-[11px] text-slate-300 outline-none"
                                  placeholder="Translucidez, mamelones, etc."
                                  value={editForm?.notesEsthetic ?? ''}
                                  onChange={e => setEditForm((prev: any) => ({ ...prev, notesEsthetic: e.target.value }))}
                                />
                              ) : (
                                <p className="text-[11px] text-slate-300 leading-relaxed italic">
                                  {clinicalCase?.notesEsthetic?.trim() || 'Sin notas estéticas.'}
                                </p>
                              )}
                            </div>

                            <div className="pt-3 border-t border-white/5">
                              <span className="text-[9px] text-teal-400 uppercase font-black tracking-widest block mb-1">Notas Oclusales</span>
                              {canEditForm ? (
                                <input
                                  className="w-full bg-slate-950/50 border border-teal-500/30 rounded-lg px-3 py-2 text-[11px] text-slate-300 outline-none"
                                  placeholder="Puntos de contacto, guía, etc."
                                  value={editForm?.notesOclusal ?? ''}
                                  onChange={e => setEditForm((prev: any) => ({ ...prev, notesOclusal: e.target.value }))}
                                />
                              ) : (
                                <p className="text-[11px] text-slate-300 leading-relaxed italic">
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



            <section className="glass-effect rounded-[1.5rem] border border-slate-800/30 flex flex-col min-h-[250px]">
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Anotaciones 3D</h3>
                    <p className="text-[9px] text-indigo-400/80 font-bold uppercase tracking-widest">{displayedAnnotations.length} notas clínicas registradas</p>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto max-h-[300px]">
                {[...displayedAnnotations].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((a: any) => (
                  <div key={a.id} className={`p-3 bg-slate-900/40 border rounded-xl ${a.staged ? 'border-amber-500/30' : 'border-slate-800/50'}`}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-teal-400 font-bold uppercase">
                        {a.user?.fullName}
                        {a.staged && <span className="ml-2 text-amber-400">· Pendiente</span>}
                      </span>
                      <span className="text-[9px] text-slate-500">{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-white">{a.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {isCloning && (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-4 px-8 py-10 rounded-[2rem] bg-slate-900/95 border border-teal-500/30 shadow-2xl">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-4 border-teal-500/15 rounded-full" />
              <div className="absolute inset-0 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-teal-400">
              Creando copia del caso…
            </p>
            <p className="text-[10px] text-slate-500 text-center max-w-xs">
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
            className="bg-slate-900/95 backdrop-blur-xl border border-red-500/30 p-8 rounded-[2.5rem] max-w-sm w-full text-center space-y-6 shadow-[0_50px_100px_rgba(220,38,38,0.3)] pointer-events-auto"
          >
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
              <Trash2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl text-white font-bold tracking-tight">¿Eliminar este caso?</h3>
              <p className="text-[11px] text-slate-500 uppercase font-black tracking-widest leading-loose">Esta acción es permanente e irreversible.</p>
              {clinicalCase && (
                <p className="text-[10px] font-black uppercase tracking-widest text-teal-500/90 pt-1">
                  {formatCaseIdAndPac(clinicalCase.caseNumber, clinicalCase.patientIdAnon)}
                </p>
              )}
              {clinicalCase?.copiedFromCaseId && (
                <p className="text-[10px] text-slate-500 normal-case tracking-normal font-medium">
                  Copia del caso{' '}
                  {clinicalCase.copiedFromCaseNumber
                    ? `#${clinicalCase.copiedFromCaseNumber}`
                    : `#${String(clinicalCase.copiedFromCaseId).slice(0, 8)}`}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Escribe <span className="text-red-500 underline">ELIMINAR</span> para confirmar</p>
              <input
                placeholder="Escribe aquí..."
                className="w-full bg-slate-950 border border-white/10 p-4 rounded-2xl text-center text-white focus:border-red-500/50 outline-none transition-all font-bold tracking-[0.2em]"
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
        <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh] bg-slate-950/60 backdrop-blur-sm">
          <FocusTrap onEscape={() => setIsPublishing(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            className="bg-slate-900/98 backdrop-blur-xl border border-teal-500/30 p-8 rounded-[2.5rem] max-w-lg w-full shadow-[0_50px_100px_rgba(20,184,166,0.15)] space-y-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-teal-500/10 rounded-2xl flex items-center justify-center text-teal-400 flex-shrink-0">
                <Globe className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl text-white font-bold tracking-tight">Publicar Caso</h3>
                <p className="text-xs text-slate-500 mt-0.5">Los técnicos podrán ver y ofertar este caso</p>
              </div>
            </div>

            {isFormDirty && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-100/90 leading-relaxed">
                  Tienes cambios sin guardar. Debes guardarlos antes de publicar el caso.
                </p>
              </div>
            )}

            {/* Resumen del caso (UX-019) */}
            <div className="rounded-2xl border border-white/5 bg-slate-800/50 p-4">
              <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Resumen del caso</p>
              <div className="max-h-[min(52vh,28rem)] space-y-2.5 overflow-y-auto pr-1">
                {buildPublishCaseSummaryRows(clinicalCase).map(r => (
                  <div key={r.label} className="flex items-start justify-between gap-3 text-xs">
                    <span className="shrink-0 text-slate-500">{r.label}</span>
                    <span className="max-w-[min(20rem,62%)] text-right font-medium break-words text-white">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <Button variant="ghost" className="flex-1 py-3.5" onClick={() => setIsPublishing(false)}>
                Cancelar
              </Button>
              {isFormDirty ? (
                <Button
                  variant="primary"
                  className="flex-1 py-3.5"
                  loading={loadingAction === 'publish' || savingChanges}
                  onClick={() => void handlePublish({ saveFirst: true })}
                >
                  Guardar y publicar
                </Button>
              ) : (
                <Button
                  variant="primary"
                  className="flex-1 py-3.5"
                  loading={loadingAction === 'publish'}
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
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 space-y-4">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 border-4 border-teal-500/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-teal-500 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(20,184,166,0.2)]" />
      </div>
      <p className="text-teal-500 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Sincronizando Expediente...</p>
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
