'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Activity, AlertCircle, CheckCircle, MessageSquare } from 'lucide-react';
import DentalViewer3D from '@/components/DentalViewer3D';
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
  user: { fullName: string };
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
  viewerRole: 'dentista' | 'tecnico' | 'admin';
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
}: Props) {
  const { showError } = useToast();

  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [models, setModels] = useState<DentalModel[]>([]);
  const [annotations, setAnnotations] = useState<DentalAnnotation[]>([]);

  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number; z: number } | null>(null);
  const [annotationText, setAnnotationText] = useState('');
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);

  const [approveStep, setApproveStep] = useState<ApproveStep>('choose');

  // Cargar modelos y anotaciones al abrir
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoadState('loading');
    setModels([]);
    setAnnotations([]);
    setApproveStep('choose');

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
              color: '#f59e0b',
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
            user: { fullName: 'Tú' },
            color: '#f59e0b',
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
            />
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

          {/* Overlay nueva anotación */}
          {pendingCoords && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-80 bg-card border border-divider rounded-lg p-3 shadow-xl z-10">
              <p className="text-xs font-semibold text-foreground mb-2">NUEVA ANOTACIÓN</p>
              <textarea
                className="w-full text-xs bg-background border border-divider rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                rows={2}
                placeholder="Describe el ajuste necesario…"
                value={annotationText}
                onChange={(e) => setAnnotationText(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setPendingCoords(null)}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveAnnotation()}
                  disabled={!annotationText.trim() || isSavingAnnotation}
                  className="text-xs font-medium text-white bg-primary hover:bg-primary/90 px-3 py-1 rounded disabled:opacity-40"
                >
                  {isSavingAnnotation ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Panel inferior: nota del dentista + anotaciones (solo para técnico / admin) */}
        {viewerRole !== 'dentista' && (dentistNote || annotations.length > 0) && (
          <div className="border-t border-divider px-4 py-3 shrink-0 space-y-2 max-h-44 overflow-y-auto">
            {dentistNote && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-warning">Comentario del dentista</p>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{dentistNote}</p>
              </div>
            )}
            {annotations.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                  <MessageSquare className="w-3 h-3 inline mr-1" aria-hidden />
                  Anotaciones ({annotations.length})
                </p>
                <ul className="space-y-1">
                  {annotations.map((a, i) => (
                    <li key={a.id} className="text-xs text-foreground leading-relaxed">
                      <span className="text-amber-400 font-bold mr-1">#{i + 1}</span>
                      {a.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                  onClick={() => setApproveStep('choose')}
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
                <button
                  type="button"
                  onClick={() => void onRequestRevision?.()}
                  disabled={isSubmittingRevision || !reviewComment.trim()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-warning-foreground bg-warning/20 hover:bg-warning/30 border border-warning/40 px-3 py-1.5 rounded disabled:opacity-40"
                >
                  {isSubmittingRevision ? (
                    <Activity className="w-3 h-3 animate-spin" aria-hidden />
                  ) : (
                    <AlertCircle className="w-3 h-3" aria-hidden />
                  )}
                  Pedir ajustes
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
                  Aprobar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
    </div>
  );

  return createPortal(content, document.body);
}
