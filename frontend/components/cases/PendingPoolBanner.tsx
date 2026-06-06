'use client';

import { useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { cancelPendingPoolAction } from '@/lib/db/actions/poolQueue';

/**
 * Banner "Buscando técnicos disponibles…" para el dentista mientras el caso espera
 * en la cola pendiente_pool (v5.0, §5/§10). Incluye "Cancelar publicación" siempre
 * visible durante la espera. No bloquea la ficha.
 */
export default function PendingPoolBanner({
  caseId,
  startedAt,
  onCancelled,
  onError,
}: {
  caseId: string;
  startedAt?: Date | string | null;
  /** Tras cancelar con éxito (el caso pasa a cerrado). */
  onCancelled: () => void;
  onError?: (msg: string) => void;
}) {
  const [cancelling, setCancelling] = useState(false);

  const startedLabel = startedAt
    ? new Date(startedAt).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      data-testid="pending-pool-banner"
      className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
    >
      <div className="flex items-start gap-3 flex-1">
        <span className="mt-0.5 text-primary">
          <Search className="w-5 h-5" />
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            Buscando técnicos disponibles…
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          </p>
          <p className="text-[11px] text-faint">
            Tu caso está en cola. Te avisaremos en cuanto haya técnicos disponibles.
            {startedLabel ? ` En espera desde ${startedLabel}.` : ''}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={cancelling}
        data-testid="pending-pool-cancel"
        onClick={async () => {
          setCancelling(true);
          const res = await cancelPendingPoolAction(caseId);
          setCancelling(false);
          if (res.success) onCancelled();
          else onError?.(res.error || 'No se pudo cancelar la publicación');
        }}
        className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-error/20 text-error text-[10px] font-black uppercase tracking-wider hover:bg-error-hl transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/30"
      >
        {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        Cancelar publicación
      </button>
    </div>
  );
}
