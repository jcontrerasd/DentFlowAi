'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Paperclip, Send, X } from 'lucide-react';
import { getUploadUrlAction } from '@/lib/db/actions/cases';
import { precheckTextContactGuardAction } from '@/lib/db/actions/contactGuard';
import { isGzipCompressible } from '@/lib/uploadCompression';

export type DeliveryFileEntry = { id: string; file: File };

type UchDeliveryPanelProps = {
  caseId: string;
  organizationId: string | undefined;
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
  if (!expanded) {
    return (
      <div data-testid="uch-delivery-collapsed" className="rounded-xl border border-primary/20 bg-surface px-3 py-2.5 transition-colors duration-150 hover:bg-surface-off/60 focus-within:bg-surface-off">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="w-full text-left text-[11px] font-semibold text-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-sm"
        >
          Enviar diseño para revisión — tocar para desplegar el formulario
        </button>
      </div>
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
        Sube al menos un archivo del diseño (STL, imágenes, PDF). El dentista debe poder descargarlos antes de aprobar o pedir ajustes.
      </p>

      <div className="space-y-2">
        <span className="text-xs font-semibold text-primary block">Archivos (obligatorio)</span>
        {!isUploadingFiles && !isSendingDelivery && (
          <label className="flex items-center gap-2 cursor-pointer text-sm text-primary font-medium hover:text-primary transition-colors w-fit">
            <Paperclip className="w-4 h-4" />
            Elegir archivos ({deliveryFiles.length}/5)
            <input
              type="file"
              multiple
              className="hidden"
              accept=".stl,.ply,.obj,.jpg,.jpeg,.png,.pdf"
              onChange={(e) => {
                const newFiles = Array.from(e.target.files || []);
                setDeliveryFiles((prev) => [...prev, ...newFiles.map(newDeliveryEntry)].slice(0, 5));
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
        <button
          type="button"
          onClick={async () => {
            if (!deliveryNotes.trim()) {
              showError('Añade un mensaje para el dentista.');
              return;
            }
            if (deliveryFiles.length === 0) {
              showError('Debes adjuntar al menos un archivo de diseño.');
              return;
            }
            if (!organizationId) {
              showError('No se pudo determinar la organización del caso.');
              return;
            }
            setFileProgress({});
            try {
              // Pre-validación de texto ANTES de subir archivos a GCS.
              // Evita uploads costosos cuando ContactGuard bloqueará el envío.
              const pre = await precheckTextContactGuardAction({
                field: 'deliveryNotes',
                text: deliveryNotes,
              });
              if (pre.success && pre.data?.blocked) {
                showError(pre.data.userMessage ?? 'El mensaje contiene contenido no permitido.');
                return;
              }

              setIsUploadingFiles(true);
              const uploadedPaths: string[] = [];
              for (let i = 0; i < deliveryFiles.length; i++) {
                const file = deliveryFiles[i].file;
                const safeName = file.name.replace(/[^\w.\-()+]/g, '_');
                const stamp = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 10)}`;
                const gcsPath = `organizations/${organizationId}/cases/${caseId}/deliveries/${stamp}_${safeName}`;
                const url = await getUploadUrlAction(
                  gcsPath,
                  file.type,
                  isGzipCompressible(file.name) ? { contentEncoding: 'gzip' } : undefined,
                );
                if (!url) throw new Error(`No se pudo obtener URL para ${file.name}`);
                await uploadFileWithProgress(file, url, i);
                uploadedPaths.push(gcsPath);
              }
              setIsUploadingFiles(false);
              setIsSendingDelivery(true);
              await onSubmitDelivery({ notes: deliveryNotes, filePaths: uploadedPaths });
              // El parent (UnifiedCaseHub) decide si limpiar el formulario según
              // el resultado del server. No cerramos el panel desde acá para no
              // pisar ese comportamiento en caso de bloqueo tardío.
            } catch (err) {
              console.error('Error enviando entrega:', err);
              showError('No se pudo completar la subida. Revisa la conexión e inténtalo de nuevo.');
            } finally {
              setIsUploadingFiles(false);
              setIsSendingDelivery(false);
            }
          }}
          disabled={isUploadingFiles || isSendingDelivery || !deliveryNotes.trim() || deliveryFiles.length === 0}
          className="flex-[2] py-3 bg-primary text-inverse text-xs font-semibold rounded-xl shadow-lg shadow-sm disabled:opacity-40 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {isUploadingFiles ? (
            <>
              <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" /> Subiendo…
            </>
          ) : isSendingDelivery ? (
            <>
              <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" /> Guardando…
            </>
          ) : (
            <>
              <Send className="w-4 h-4" /> Enviar para revisión
            </>
          )}
        </button>
      </div>
    </div>
  );
}
