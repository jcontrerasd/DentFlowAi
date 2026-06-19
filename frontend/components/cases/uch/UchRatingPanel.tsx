'use client';

import { useState } from 'react';
import { Star, CheckCircle2 } from 'lucide-react';
import RatingScale from '@/components/ui/RatingScale';
import { submitUserRatingAction } from '@/lib/db/actions/cases';
import { submitQualityRatingAction } from '@/lib/db/actions/quality';
import { useToast } from '@/context/ToastContext';

interface UchRatingPanelProps {
  caseId: string;
  /** Técnico/laboratorio calificado (reviewee). Solo requerido para dimension='design'. */
  revieweeId?: string;
  dimension: 'design' | 'quality';
  /** Refresca el caso tras calificar (oculta el panel). */
  onRated: () => void | Promise<void>;
}

const COPY = {
  design: {
    title: 'Califica el diseño recibido (CAD)',
    subtitle: 'Tu valoración ayuda a Fauchard a seleccionar mejores laboratorios. Es anónima.',
  },
  quality: {
    title: 'Califica al técnico (Revisión QA)',
    subtitle: 'Tu evaluación es privada del equipo de Calidad y contribuye al score del laboratorio.',
  },
} as const;

export default function UchRatingPanel({ caseId, revieweeId, dimension, onRated }: UchRatingPanelProps) {
  const { showSuccess, showError } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[dimension];

  const handleSubmit = async () => {
    if (rating === 0) {
      showError('Selecciona una calificación');
      return;
    }
    setSubmitting(true);
    try {
      let res: { success: boolean; error?: string };
      if (dimension === 'quality') {
        res = await submitQualityRatingAction({ caseId, rating, comment: comment.trim() || undefined });
      } else {
        if (!revieweeId) { showError('Técnico no identificado'); setSubmitting(false); return; }
        res = await submitUserRatingAction({ caseId, revieweeId, rating, dimension, comment: comment.trim() || undefined });
      }
      if (res.success) {
        showSuccess('¡Gracias por tu calificación!');
        await onRated();
      } else {
        showError(res.error || 'No se pudo enviar la calificación');
      }
    } catch {
      showError('Error de conexión al enviar la calificación');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary-hl/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-primary flex-shrink-0" />
        <div>
          <p className="text-xs font-black text-foreground uppercase tracking-wider">{copy.title}</p>
          <p className="text-[10px] text-faint leading-snug">{copy.subtitle}</p>
        </div>
      </div>

      <RatingScale value={rating} onChange={setRating} disabled={submitting} />

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={submitting}
        placeholder="Comentario (opcional)"
        rows={2}
        className="w-full resize-none rounded-xl border border-divider bg-surface px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || rating === 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none"
      >
        <CheckCircle2 className="w-4 h-4" />
        {submitting ? 'Enviando…' : 'Enviar calificación'}
      </button>
    </div>
  );
}
