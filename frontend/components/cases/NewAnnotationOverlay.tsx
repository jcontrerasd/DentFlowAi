'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/** Contexto de uso — define el copy del cuadro manteniendo un único diseño. */
export type AnnotationContext = 'caseCreation' | 'deliveryAdjustment';

const CONTEXT_COPY: Record<AnnotationContext, { title: string; placeholder: string }> = {
  caseCreation: { title: 'Nueva anotación', placeholder: 'Tu observación aquí…' },
  deliveryAdjustment: { title: 'Nueva anotación', placeholder: 'Describe el ajuste necesario…' },
};

interface NewAnnotationOverlayProps {
  context: AnnotationContext;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
}

/**
 * Cuadro flotante para anotar un punto sobre el visor 3D (`DentalViewer3D`).
 * Se renderiza como hijo del visor para seguir visible en pantalla completa.
 * Anclado arriba-izquierda (los controles del visor viven arriba-derecha).
 *
 * El foco salta automáticamente al textarea al montar (al colocar el pin),
 * por lo que no hay que pinchar la caja para empezar a escribir. El padre debe
 * pasar una `key` derivada de las coordenadas para que el foco se reposicione
 * también al marcar un punto nuevo sin cerrar el cuadro.
 */
export default function NewAnnotationOverlay({
  context,
  value,
  onChange,
  onCancel,
  onSave,
  saving = false,
}: NewAnnotationOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const copy = CONTEXT_COPY[context];
  const canSave = !!value.trim() && !saving;

  useEffect(() => {
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSave) {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="absolute top-4 left-4 w-80 max-w-[calc(100%-2rem)] bg-card border border-divider rounded-lg p-3 shadow-xl z-30"
    >
      <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">{copy.title}</p>
      <textarea
        ref={textareaRef}
        className="w-full text-xs bg-background border border-divider rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
        rows={2}
        placeholder={copy.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted hover:text-foreground"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="text-xs font-medium text-white bg-primary hover:bg-primary/90 px-3 py-1 rounded disabled:opacity-40"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </motion.div>
  );
}
