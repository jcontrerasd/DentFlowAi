'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Activity, AlertCircle, CheckCircle, FileCheck2, GitBranch, MessageSquareWarning } from 'lucide-react';
import DentalViewer3D from '@/components/DentalViewer3D';
import NewAnnotationOverlay from '@/components/cases/NewAnnotationOverlay';
import { getSignedUrlAction } from '@/lib/db/actions/cases';
import {
  createDeliveryAnnotationAction,
  listDeliveryAnnotationsAction,
} from '@/lib/db/actions/annotations';
import { useToast } from '@/context/ToastContext';

interface DentalAnnotation {
  id: string;
  text: string;
  coordinates: { x: number; y: number; z: number };
  user: { fullName: string; role?: string };
}

function pinColorForRole(role?: string): string {
  if (role === 'dentista') return '#fd0017';
  return '#f97316';
}

interface DentalModel {
  url: string;
  subType: string;
  visible: boolean;
}

type ApproveStep = 'choose' | 'confirm';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  deliveryId: string;
  deliveryVersion: number;
  caseId: string;
  caseNumber: string;
  zipFiles: string[];
  viewerRole: 'dentista' | 'tecnico' | 'admin' | 'calidad';
  dentistNote?: string;
  canReview: boolean;
  canAnnotate: boolean;
  onApprove?: () => Promise<void>;
  onRequestRevision?: () => Promise<void>;
  reviewComment: string;
  setReviewComment: (v: string) => void;
  isSubmittingReview: boolean;
  isSubmittingRevision: boolean;
  onDownloadAll: (id: string, label: string, files: string[]) => void;
  downloadingVersionId: string | null;
  canReviewQuality?: boolean;
  qualityComment?: string;
  setQualityComment?: (v: string) => void;
  onCertifyQuality?: (comment: string) => Promise<void>;
  onQualityRequestChanges?: (comment: string) => Promise<void>;
  onDeriveQuality?: () => void;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export default function DeliveryViewer3DModal({
  isOpen,
  onClose,
  deliveryId,
  deliveryVersion,
  caseId,
  caseNumber,
  zipFiles,
  viewerRole,
  dentistNote,
  canReview,
  canAnnotate,
  onApprove,
  onRequestRevision,
  reviewComment,
  setReviewComment,
  isSubmittingReview,
  isSubmittingRevision,
  onDownloadAll,
  downloadingVersionId,
  canReviewQuality = false,
  qualityComment: qualityCommentProp = '',
  setQualityComment: setQualityCommentProp,
  onCertifyQuality,
  onQualityRequestChanges,
  onDeriveQuality,
}: Props) {
  const { showError } = useToast();

  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [models, setModels] = useState<DentalModel[]>([]);
  const [annotations, setAnnotations] = useState<DentalAnnotation[]>([]);

  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number; z: number } | null>(null);
  const [annotationText, setAnnotationText] = useState('');
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);

  const [approveStep, setApproveStep] = useState<ApproveStep>('choose');
  const [revisionStep, setRevisionStep] = useState<ApproveStep>('choose');
  const [qualityRevisionStep, setQualityRevisionStep] = useState<ApproveStep>('choose');
  const qualityComment = qualityCommentProp;
  const setQualityComment = setQualityCommentProp ?? (() => {});
  const [isBusyQuality, setIsBusyQuality] = useState(false);

  // Cargar modelos y anotaciones al abrir
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoadState('loading');
    setModels([]);
    setAnnotations([]);
    setApproveStep('choose');
    setRevisionStep('choose');
    setQualityRevisionStep('choose');
    setIsBusyQuality(false);

    async function load() {
      try {
        const MODEL_EXTS = ['.stl', '.ply', '.obj'];
        const inferSubType = (path: string) => {
          const lower = path.toLowerCase();
          if (lower.includes('superior')) return 'superior';
          if (lower.includes('inferior')) return 'inferior';
          if (lower.includes('oclusal')) return 'oclusal';
          return 'modelo';
        };

        // Los archivos son rutas GCS individuales (STL/PLY/OBJ), no un ZIP.
        // Filtrar por extensión de modelo 3D y obtener URLs firmadas.
        const modelPaths = zipFiles.filter((f) =>
          MODEL_EXTS.some((ext) => f.toLowerCase().endsWith(ext))
        );

        if (modelPaths.length === 0) {
          setLoadState('error');
          return;
        }

        const [signedUrls, annotationsResult] = await Promise.all([
          Promise.all(modelPaths.map((p) => getSignedUrlAction(p))),
          listDeliveryAnnotationsAction(deliveryId),
        ]);

        if (cancelled) return;

        // subType must be unique per model (used as React key in DentalViewer3D)
        const subtypeCounts: Record<string, number> = {};
        const loadedModels: DentalModel[] = signedUrls
          .map((url, i) => {
            if (!url) return null;
            const base = inferSubType(modelPaths[i]);
            subtypeCounts[base] = (subtypeCounts[base] ?? 0) + 1;
            const subType = subtypeCounts[base] === 1 ? base : `${base}_${subtypeCounts[base]}`;
            return { url, subType, visible: true };
          })
          .filter((m): m is DentalModel => m !== null);

        if (loadedModels.length === 0) {
          setLoadState('error');
          return;
        }

        setModels(loadedModels);

        if (annotationsResult.success && annotationsResult.annotations) {
          setAnnotations(
            (annotationsResult.annotations as DentalAnnotation[]).map((a) => ({
              ...a,
              color: pinColorForRole(a.user.role),
            }))
          );
        }

        setLoadState('ready');
      } catch (err) {
        console.error('[DeliveryViewer3DModal] load error:', err);
        if (!cancelled) setLoadState('error');
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, deliveryId, zipFiles, viewerRole]);


  const handleAnnotate = (coords: { x: number; y: number; z: number }) => {
    setPendingCoords(coords);
    setAnnotationText('');
  };

  const handleSaveAnnotation = async () => {
    if (!pendingCoords || !annotationText.trim()) return;
    setIsSavingAnnotation(true);
    try {
      const result = await createDeliveryAnnotationAction({
        caseId,
        deliveryId,
        text: annotationText.trim(),
        coordinates: pendingCoords,
      });
      if (result.success && result.annotation) {
        setAnnotations((prev) => [
          ...prev,
          {
            id: result.annotation!.id,
            text: result.annotation!.text,
            coordinates: result.annotation!.coordinates as { x: number; y: number; z: number },
            user: { fullName: 'Tú', role: viewerRole },
            color: pinColorForRole(viewerRole),
          },
        ]);
        setPendingCoords(null);
        setAnnotationText('');
      } else {
        showError(result.error ?? 'Error al guardar anotación');
      }
    } finally {
      setIsSavingAnnotation(false);
    }
  };

  const handleApproveClick = async () => {
    if (approveStep === 'choose') {
      setApproveStep('confirm');
      return;
    }
    await onApprove?.();
  };

  const zipKey = `rev-modal-${deliveryId}`;
  const isDownloading = downloadingVersionId === zipKey;

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
    <div className="flex flex-col bg-background border border-divider rounded-2xl shadow-2xl overflow-hidden w-full max-w-5xl" style={{ height: 'min(88vh, 800px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">
            Revisión v{deliveryVersion} — {caseNumber}
          </span>
          {loadState === 'loading' && (
            <span className="flex items-center gap-1 text-xs text-muted">
              <Activity className="w-3 h-3 animate-spin" />
              Cargando modelo…
            </span>
          )}
          {loadState === 'error' && (
            <span className="flex items-center gap-1 text-xs text-error">
              <AlertCircle className="w-3 h-3" />
              Error al cargar modelo
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {zipFiles.length > 0 && (
            <button
              type="button"
              onClick={() => onDownloadAll(zipKey, `v${deliveryVersion}`, zipFiles)}
              disabled={isDownloading}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2 disabled:opacity-40"
            >
              {isDownloading ? (
                <Activity className="w-3 h-3 animate-spin" aria-hidden />
              ) : (
                <Download className="w-3 h-3" aria-hidden />
              )}
              Descargar ZIP
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-muted hover:text-foreground transition-colors"
            aria-label="Cerrar visor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Visor 3D + panel informativo */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Viewer ocupa el espacio restante */}
        <div className="relative flex-1 min-h-0">
          {loadState === 'ready' && (
            <DentalViewer3D
              models={models}
              annotations={annotations}
              onAnnotate={canAnnotate ? handleAnnotate : undefined}
              canAnnotate={canAnnotate}
            >
              {/* Overlay nueva anotación — dentro del visor para seguir visible en pantalla completa */}
              {pendingCoords && (
                <NewAnnotationOverlay
                  key={`${pendingCoords.x}-${pendingCoords.y}-${pendingCoords.z}`}
                  context="deliveryAdjustment"
                  value={annotationText}
                  onChange={setAnnotationText}
                  onCancel={() => setPendingCoords(null)}
                  onSave={() => void handleSaveAnnotation()}
                  saving={isSavingAnnotation}
                />
              )}
            </DentalViewer3D>
          )}
          {loadState === 'loading' && (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              <Activity className="w-5 h-5 animate-spin mr-2" />
              Cargando modelo 3D…
            </div>
          )}
          {loadState === 'error' && (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              <AlertCircle className="w-5 h-5 mr-2 text-error" />
              No se pudo cargar el modelo 3D. Descarga el ZIP para revisarlo.
            </div>
          )}

        </div>

        {/* Panel inferior: solo nota del dentista cuando aplica (los pins se leen directamente en el modelo) */}
        {viewerRole !== 'dentista' && dentistNote && (
          <div className="border-t border-divider px-4 py-3 shrink-0">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-warning">Comentario del dentista</p>
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{dentistNote}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer de revisión (solo dentista con entrega pending) */}
      {canReview && (
        <div className="border-t border-divider px-4 py-3 shrink-0 space-y-2">
          {approveStep === 'confirm' ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">¿Confirmas que apruebas esta entrega?</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setApproveStep('choose'); setReviewComment(''); }}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleApproveClick()}
                  disabled={isSubmittingReview}
                  className="inline-flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded disabled:opacity-40"
                >
                  {isSubmittingReview ? (
                    <Activity className="w-3 h-3 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle className="w-3 h-3" aria-hidden />
                  )}
                  Confirmar aprobación
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                className="w-full text-xs bg-background border border-divider rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                rows={2}
                placeholder="Comentario para el técnico (opcional si apruebas, requerido si pides ajustes)…"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                {revisionStep === 'confirm' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">¿Confirmas que solicitas ajustes?</span>
                    <button
                      type="button"
                      onClick={() => { setRevisionStep('choose'); setReviewComment(''); }}
                      className="text-xs text-muted hover:text-foreground"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => { await onRequestRevision?.(); setRevisionStep('choose'); }}
                      disabled={isSubmittingRevision}
                      className="inline-flex items-center gap-1 text-xs font-medium text-warning-foreground bg-warning/20 hover:bg-warning/30 border border-warning/40 px-3 py-1.5 rounded disabled:opacity-40"
                    >
                      {isSubmittingRevision ? (
                        <Activity className="w-3 h-3 animate-spin" aria-hidden />
                      ) : (
                        <AlertCircle className="w-3 h-3" aria-hidden />
                      )}
                      Confirmar ajustes
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRevisionStep('confirm')}
                    disabled={!reviewComment.trim()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-warning-foreground bg-warning/20 hover:bg-warning/30 border border-warning/40 px-3 py-1.5 rounded disabled:opacity-40"
                  >
                    <AlertCircle className="w-3 h-3" aria-hidden />
                    Pedir ajustes
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleApproveClick()}
                  disabled={isSubmittingReview}
                  className="inline-flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded disabled:opacity-40"
                >
                  {isSubmittingReview ? (
                    <Activity className="w-3 h-3 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle className="w-3 h-3" aria-hidden />
                  )}
                  Aprobar
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {/* Footer de revisión QA (solo revisor de Calidad con entrega pending) */}
      {canReviewQuality && (
        <div className="border-t border-divider px-4 py-3 shrink-0 space-y-2">
          <textarea
            rows={2}
            placeholder="Comentario para el técnico (obligatorio para solicitar ajustes)…"
            value={qualityComment}
            onChange={(e) => setQualityComment(e.target.value)}
            disabled={isBusyQuality}
            className="w-full text-xs bg-background border border-divider rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
          />
          <div className="flex justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onDeriveQuality?.()}
              disabled={isBusyQuality}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors disabled:opacity-40"
            >
              <GitBranch className="w-3 h-3" aria-hidden />
              Derivar
            </button>
            {qualityRevisionStep === 'confirm' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">¿Confirmas que solicitas ajustes?</span>
                <button
                  type="button"
                  onClick={() => { setQualityRevisionStep('choose'); setQualityComment(''); }}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setIsBusyQuality(true);
                    try { await onQualityRequestChanges?.(qualityComment); } finally { setIsBusyQuality(false); setQualityRevisionStep('choose'); }
                  }}
                  disabled={isBusyQuality}
                  className="inline-flex items-center gap-1 text-xs font-medium text-warning-foreground bg-warning/20 hover:bg-warning/30 border border-warning/40 px-3 py-1.5 rounded disabled:opacity-40"
                >
                  {isBusyQuality ? <Activity className="w-3 h-3 animate-spin" aria-hidden /> : <MessageSquareWarning className="w-3 h-3" aria-hidden />}
                  Confirmar ajustes
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setQualityRevisionStep('confirm')}
                disabled={!qualityComment.trim() || isBusyQuality}
                className="inline-flex items-center gap-1 text-xs font-medium text-warning-foreground bg-warning/20 hover:bg-warning/30 border border-warning/40 px-3 py-1.5 rounded disabled:opacity-40"
              >
                <MessageSquareWarning className="w-3 h-3" aria-hidden />
                Solicitar ajustes
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                setIsBusyQuality(true);
                try { await onCertifyQuality?.(qualityComment); } finally { setIsBusyQuality(false); }
              }}
              disabled={isBusyQuality}
              className="inline-flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded disabled:opacity-40"
            >
              {isBusyQuality ? <Activity className="w-3 h-3 animate-spin" aria-hidden /> : <FileCheck2 className="w-3 h-3" aria-hidden />}
              Certificar entrega
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );

  return createPortal(content, document.body);
}
