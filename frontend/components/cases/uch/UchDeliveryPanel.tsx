'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Paperclip, Send, X, ChevronDown, Upload } from 'lucide-react';
import { getUploadUrlAction } from '@/lib/db/actions/cases';
import { precheckTextContactGuardAction } from '@/lib/db/actions/contactGuard';
import { isGzipCompressible } from '@/lib/uploadCompression';

export type DeliveryFileEntry = { id: string; file: File };

type UchDeliveryPanelProps = {
  caseId: string;
  organizationId: string | undefined;
  /** Si true, la entrega va primero a revisión de Calidad; si false, va directo al dentista. */
  qualityGateActive?: boolean;
  deliveryNotes: string;
  setDeliveryNotes: (v: string) => void;
  deliveryFiles: DeliveryFileEntry[];
  setDeliveryFiles: React.Dispatch<React.SetStateAction<DeliveryFileEntry[]>>;
  fileProgress: Record<number, number>;
  setFileProgress: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  isUploadingFiles: boolean;
  setIsUploadingFiles: (v: boolean) => void;
  isSendingDelivery: boolean;
  setIsSendingDelivery: (v: boolean) => void;
  showError: (msg: string) => void;
  onSubmitDelivery: (payload: { notes: string; filePaths: string[] }) => Promise<void>;
  onDismiss: () => void;
  uploadFileWithProgress: (file: File, url: string, fileIdx: number) => Promise<void>;
  expanded: boolean;
  onToggleExpanded: () => void;
};

export function newDeliveryEntry(file: File): DeliveryFileEntry {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    file,
  };
}

export default function UchDeliveryPanel({
  caseId,
  organizationId,
  qualityGateActive = false,
  deliveryNotes,
  setDeliveryNotes,
  deliveryFiles,
  setDeliveryFiles,
  fileProgress,
  setFileProgress,
  isUploadingFiles,
  setIsUploadingFiles,
  isSendingDelivery,
  setIsSendingDelivery,
  showError,
  onSubmitDelivery,
  onDismiss,
  uploadFileWithProgress,
  expanded,
  onToggleExpanded,
}: UchDeliveryPanelProps) {
  const [sendStep, setSendStep] = useState<'choose' | 'confirm'>('choose');

  if (!expanded) {
    return (
      <button
        data-testid="uch-delivery-collapsed"
        type="button"
        onClick={onToggleExpanded}
        className="w-full text-left rounded-xl border border-primary/30 bg-surface hover:bg-surface-off/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 transition-colors duration-150 px-4 py-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">
                {qualityGateActive ? 'Enviar entrega a Calidad' : 'Enviar entrega al Dentista'}
              </p>
              <p className="text-[10px] text-muted mt-0.5">Sube archivos STL, imágenes o PDF para revisión</p>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
        </div>
      </button>
    );
  }

  return (
    <div
      data-testid="uch-delivery-panel"
      role="region"
      aria-label="Entrega de diseño"
      className="rounded-xl border border-primary/30/25 bg-surface/95 p-4 shadow-xl space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-5 h-5 text-primary flex-shrink-0" />
          <h2 className="text-sm font-semibold text-foreground truncate">Entrega de diseño</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isUploadingFiles || isSendingDelivery) return;
            onDismiss();
            onToggleExpanded();
          }}
          disabled={isUploadingFiles || isSendingDelivery}
          className="rounded-full p-2 text-faint hover:bg-surface-off hover:text-foreground disabled:opacity-30"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        {qualityGateActive
          ? 'Sube al menos un archivo de diseño CAD (STL, PLY u OBJ) para revisión de Calidad.'
          : 'Sube al menos un archivo del diseño (STL, imágenes, PDF). El dentista debe poder descargarlos antes de aprobar o pedir ajustes.'}
      </p>

      <div className="space-y-2">
        <span className="text-xs font-semibold text-primary block">Archivos (obligatorio)</span>
        {!isUploadingFiles && !isSendingDelivery && (
          <label className="flex items-center gap-2 cursor-pointer text-sm text-primary font-medium hover:text-primary transition-colors w-fit">
            <Paperclip className="w-4 h-4" />
            Elegir archivos ({deliveryFiles.length}/13)
            <input
              type="file"
              multiple
              className="hidden"
              accept={qualityGateActive ? '.stl,.ply,.obj' : '.stl,.ply,.obj,.jpg,.jpeg,.png,.pdf'}
              onChange={(e) => {
                const newFiles = Array.from(e.target.files || []);
                const MAX_MODEL_MB = 100;
                const MAX_DOC_MB = 20;
                const oversized = newFiles.filter((f) => {
                  const limitMb = isGzipCompressible(f.name) ? MAX_MODEL_MB : MAX_DOC_MB;
                  return f.size > limitMb * 1024 * 1024;
                });
                if (oversized.length > 0) {
                  showError(
                    `Archivos demasiado grandes: ${oversized.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(0)} MB)`).join(', ')}. Máx: ${MAX_MODEL_MB} MB para modelos 3D, ${MAX_DOC_MB} MB para documentos.`,
                  );
                  e.target.value = '';
                  return;
                }
                setDeliveryFiles((prev) => {
                  const existingKeys = new Set(prev.map((e) => `${e.file.name}|${e.file.size}`));
                  const dedupedNew = newFiles.filter((f) => !existingKeys.has(`${f.name}|${f.size}`));
                  return [...prev, ...dedupedNew.map(newDeliveryEntry)].slice(0, 13);
                });
                const existingKeysSnap = new Set(
                  deliveryFiles.map((e) => `${e.file.name}|${e.file.size}`),
                );
                const duplicates = newFiles.filter((f) =>
                  existingKeysSnap.has(`${f.name}|${f.size}`),
                ).length;
                if (duplicates > 0) {
                  showError(
                    `${duplicates} archivo${duplicates > 1 ? 's' : ''} ya ${duplicates > 1 ? 'están' : 'está'} en la lista.`,
                  );
                }
                e.target.value = '';
              }}
            />
          </label>
        )}
        {deliveryFiles.length > 0 && (
          <div className="flex flex-col gap-1.5 max-h-44 min-h-0 overflow-y-auto pr-0.5">
            {deliveryFiles.map(({ id, file }) => (
              <div key={id} className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2 min-h-0 shrink-0">
                <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-xs text-foreground truncate flex-1 min-w-0" title={file.name}>
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => setDeliveryFiles((prev) => prev.filter((e) => e.id !== id))}
                  disabled={isUploadingFiles || isSendingDelivery}
                  className="text-faint hover:text-error transition-colors flex-shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Quitar archivo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="uch-delivery-notes" className="text-xs font-semibold text-muted block mb-1.5">
          Mensaje al dentista
        </label>
        <textarea
          id="uch-delivery-notes"
          value={deliveryNotes}
          onChange={(e) => setDeliveryNotes(e.target.value)}
          placeholder="Describe el diseño, materiales, decisiones técnicas..."
          className="w-full bg-surface-2 border border-divider rounded-xl p-3 text-sm text-foreground focus:border-primary/30 outline-none min-h-[88px] resize-none placeholder-slate-600"
          disabled={isUploadingFiles || isSendingDelivery}
        />
      </div>

      {isUploadingFiles && Object.keys(fileProgress).length > 0 && (
        <div className="space-y-2">
          {deliveryFiles.map(({ id, file }, i) => (
            <div key={id} className="space-y-1">
              <div className="flex justify-between text-xs text-faint gap-2">
                <span className="truncate min-w-0" title={file.name}>
                  {file.name}
                </span>
                <span className="flex-shrink-0 tabular-nums">{fileProgress[i] ?? 0}%</span>
              </div>
              <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${fileProgress[i] ?? 0}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {isSendingDelivery && (
        <div className="flex items-center gap-2 text-sm text-primary py-1">
          <div className="w-4 h-4 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin flex-shrink-0" />
          Guardando entrega…
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            if (isUploadingFiles || isSendingDelivery) return;
            onDismiss();
            onToggleExpanded();
          }}
          disabled={isUploadingFiles || isSendingDelivery}
          className="flex-1 py-3 bg-surface-2 text-muted text-xs font-semibold rounded-xl disabled:opacity-40"
        >
          Cancelar
        </button>
        {sendStep === 'confirm' ? (
          <div className="flex-[2] flex items-center gap-2">
            <span className="text-xs text-muted flex-1">¿Confirmas el envío?</span>
            <button
              type="button"
              onClick={() => setSendStep('choose')}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!organizationId) {
                  showError('No se pudo determinar la organización del caso.');
                  setSendStep('choose');
                  return;
                }
                setFileProgress({});
                try {
                  const pre = await precheckTextContactGuardAction({
                    field: 'deliveryNotes',
                    text: deliveryNotes,
                  });
                  if (pre.success && pre.data?.blocked) {
                    showError(pre.data.userMessage ?? 'El mensaje contiene contenido no permitido.');
                    setSendStep('choose');
                    return;
                  }
                  setIsUploadingFiles(true);
                  const uploadedPaths: string[] = [];
                  // Paso 1: obtener todas las URLs de subida en paralelo
                  const uploadEntries = await Promise.all(
                    deliveryFiles.map(async ({ file }, i) => {
                      const safeName = file.name.replace(/[^\w.\-()+]/g, '_');
                      const stamp = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 10)}`;
                      const subfolder = isGzipCompressible(file.name) ? 'scans' : 'attachments';
                      const gcsPath = `organizations/${organizationId}/cases/${caseId}/deliveries/${subfolder}/${stamp}_${safeName}`;
                      const url = await getUploadUrlAction(
                        gcsPath,
                        file.type,
                        isGzipCompressible(file.name) ? { contentEncoding: 'gzip' } : undefined,
                      );
                      if (!url) throw new Error(`No se pudo obtener URL para ${file.name}`);
                      return { file, url, gcsPath, i };
                    }),
                  );
                  // Paso 2: subir en lotes de 3 simultáneos
                  for (let ci = 0; ci < uploadEntries.length; ci += 3) {
                    const chunk = uploadEntries.slice(ci, ci + 3);
                    await Promise.all(chunk.map(({ file, url, i }) => uploadFileWithProgress(file, url, i)));
                    uploadedPaths.push(...chunk.map((e) => e.gcsPath));
                  }
                  setIsUploadingFiles(false);
                  setIsSendingDelivery(true);
                  await onSubmitDelivery({ notes: deliveryNotes, filePaths: uploadedPaths });
                } catch (err) {
                  console.error('Error enviando entrega:', err);
                  showError('No se pudo completar la subida. Revisa la conexión e inténtalo de nuevo.');
                } finally {
                  setIsUploadingFiles(false);
                  setIsSendingDelivery(false);
                  setSendStep('choose');
                }
              }}
              disabled={isUploadingFiles || isSendingDelivery}
              className="py-2 px-3 bg-primary text-inverse text-xs font-semibold rounded-xl shadow-sm disabled:opacity-40 flex items-center gap-2"
            >
              {isUploadingFiles ? (
                <><div className="w-3 h-3 border-2 border-border border-t-white rounded-full animate-spin" /> Subiendo…</>
              ) : isSendingDelivery ? (
                <><div className="w-3 h-3 border-2 border-border border-t-white rounded-full animate-spin" /> Guardando…</>
              ) : (
                <><Send className="w-3 h-3" /> Confirmar envío</>
              )}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!deliveryNotes.trim()) { showError('Añade un mensaje para el dentista.'); return; }
              if (deliveryFiles.length === 0) { showError('Debes adjuntar al menos un archivo de diseño.'); return; }
              setSendStep('confirm');
            }}
            disabled={isUploadingFiles || isSendingDelivery}
            className="flex-[2] py-3 bg-primary text-inverse text-xs font-semibold rounded-xl shadow-lg shadow-sm disabled:opacity-40 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <Send className="w-4 h-4" /> {qualityGateActive ? 'Enviar a Calidad' : 'Enviar al Dentista'}
          </button>
        )}
      </div>
    </div>
  );
}
