'use client';

import { useState } from 'react';
import { Send, BadgeCheck } from 'lucide-react';

/**
 * Panel del técnico (v5.19) cuando su entrega ya fue certificada por Calidad
 * (`certificadoCalidad`). La certificación NO reenvía automáticamente: el técnico
 * decide cuándo enviarla al solicitante. Al enviar arranca el plazo de revisión del dentista.
 */
export default function UchSendToDentistPanel({
  delivery,
  onSend,
}: {
  delivery: { version?: number } | undefined;
  onSend: () => Promise<boolean | void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div
      data-testid="uch-send-to-dentist-panel"
      role="region"
      aria-label="Entrega certificada"
      className="rounded-xl border border-primary/30 bg-surface/95 p-4 shadow-xl space-y-3"
    >
      <div className="flex items-center gap-2">
        <BadgeCheck className="w-5 h-5 text-primary flex-shrink-0" />
        <h2 className="text-sm font-semibold text-foreground">Entrega certificada</h2>
        {delivery?.version != null && (
          <span className="text-[10px] text-muted ml-auto">Entrega v{delivery.version}</span>
        )}
      </div>
      <p className="text-xs text-muted leading-relaxed">
        Tu entrega fue certificada y está lista. Cuando quieras, envíala al solicitante para su revisión.
      </p>
      <button
        type="button"
        data-testid="uch-send-to-dentist"
        onClick={async () => {
          setBusy(true);
          try {
            await onSend();
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="w-full py-3 bg-primary text-inverse text-xs font-semibold rounded-xl shadow-sm disabled:opacity-40 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Send className="w-4 h-4" /> {busy ? 'Enviando…' : 'Enviar al solicitante'}
      </button>
    </div>
  );
}
