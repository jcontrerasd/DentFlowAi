'use client';

import { useState } from 'react';
import { GitBranch, Check, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import UchRejectDerivationDialog from './UchRejectDerivationDialog';
import { acceptDerivedQualityReviewAction } from '@/lib/db/actions/quality';
import { useToast } from '@/context/ToastContext';

/**
 * Panel de acción para el QA destino de una derivación pendiente.
 * Aparece en el hilo del UCH mientras hasPendingDerivationForMe === true.
 * El QA puede aceptar (con doble confirmación inline) o rechazar (con diálogo de motivo).
 */
export default function UchDerivationRequestPanel({
  caseId,
  fromName,
  reasonLabel,
  comment,
  onAccepted,
  onRejected,
}: {
  caseId: string;
  fromName: string | null;
  reasonLabel: string | null;
  comment: string | null;
  onAccepted: () => void;
  onRejected: () => void;
}) {
  const { showSuccess } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAcceptFirst = () => setConfirming(true);

  const handleAcceptConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await acceptDerivedQualityReviewAction(caseId);
      if (!res.success) {
        setError(res.error || 'No se pudo aceptar la derivación');
        setSubmitting(false);
        setConfirming(false);
        return;
      }
      showSuccess('Derivación aceptada. El caso ahora es tuyo.');
      onAccepted();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Solicitud de derivación</p>
            {fromName && (
              <p className="text-xs text-muted">Enviada por {fromName}</p>
            )}
          </div>
        </div>

        {(reasonLabel || comment) && (
          <div className="rounded-2xl bg-surface-2 border border-divider p-3 space-y-1">
            {reasonLabel && (
              <p className="text-xs text-muted">
                <span className="font-semibold text-foreground">Motivo:</span> {reasonLabel}
              </p>
            )}
            {comment && (
              <p className="text-xs text-muted">
                <span className="font-semibold text-foreground">Comentario:</span> {comment}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-2xl bg-error-hl border border-error/30 text-error text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {confirming && (
          <div className="p-3 rounded-2xl bg-primary-hl border border-primary/20 text-primary text-xs">
            ¿Confirmas que asumes la revisión de este caso?
          </div>
        )}

        <div className="flex gap-2">
          {!confirming ? (
            <Button
              onClick={handleAcceptFirst}
              disabled={submitting}
              className="flex-1"
              data-testid="uch-derivation-accept-first"
            >
              <Check className="w-4 h-4 mr-1.5" />
              Aceptar caso
            </Button>
          ) : (
            <Button
              onClick={handleAcceptConfirm}
              disabled={submitting}
              loading={submitting}
              className="flex-1"
              data-testid="uch-derivation-accept-confirm"
            >
              Confirmar aceptación
            </Button>
          )}
          <Button
            onClick={() => setRejectOpen(true)}
            disabled={submitting}
            variant="destructive"
            className="flex-1"
            data-testid="uch-derivation-reject"
          >
            Rechazar
          </Button>
        </div>

        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="w-full text-xs text-muted hover:text-foreground transition-colors text-center"
          >
            Cancelar
          </button>
        )}
      </div>

      <UchRejectDerivationDialog
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        caseId={caseId}
        onRejected={() => {
          setRejectOpen(false);
          showSuccess('Derivación rechazada. El caso permanece con el revisor actual.');
          onRejected();
        }}
      />
    </>
  );
}
