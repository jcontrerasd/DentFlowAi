'use client';

import { useEffect, useState } from 'react';
import { getResponseHistoryAction, type ResponseHistoryItem } from '@/lib/db/actions/noResponseEvents';

/** Historial de respuesta del técnico (v5.0, §2.6.3). Filtros: activas / todo. */
export default function ResponseHistoryView({ userId }: { userId: string }) {
  const [items, setItems] = useState<ResponseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyActive, setOnlyActive] = useState(false);

  useEffect(() => {
    setLoading(true);
    getResponseHistoryAction(userId)
      .then((res) => setItems(res.success ? res.items : []))
      .finally(() => setLoading(false));
  }, [userId]);

  const shown = onlyActive ? items.filter((i) => i.windowStatus === 'Activa') : items;

  const badge = (s: ResponseHistoryItem['windowStatus']) =>
    s === 'Activa' ? 'bg-amber-400/10 text-amber-400'
      : s === 'Perdonada' ? 'bg-primary-hl text-primary'
        : 'bg-surface-2 text-muted';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Historial de respuesta</h3>
        <div className="flex items-center gap-1 p-1 bg-surface/60 border border-divider rounded-full">
          {([['todo', 'Todo'], ['activas', 'Solo activas']] as const).map(([k, label]) => {
            const active = (k === 'activas') === onlyActive;
            return (
              <button key={k} onClick={() => setOnlyActive(k === 'activas')}
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${active ? 'bg-surface-2 text-primary border border-divider' : 'text-muted hover:text-foreground'}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted opacity-50">Sin no-respuestas registradas. Estás en Nivel 1.</p>
      ) : (
        <ul className="rounded-2xl border border-divider divide-y divide-divider overflow-hidden">
          {shown.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{it.caseNumber ?? 'Caso —'}</p>
                <p className="text-xs text-muted">
                  {new Date(it.occurredAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {it.windowStatus === 'Activa' && it.exitDate && ` · sale el ${new Date(it.exitDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`}
                  {it.windowStatus === 'Perdonada' && it.pardonReason && ` · ${it.pardonReason}`}
                </p>
              </div>
              <span className={`text-xs font-bold uppercase px-2 py-1 rounded-md shrink-0 ${badge(it.windowStatus)}`}>{it.windowStatus}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
