'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, X, ChevronRight } from 'lucide-react';
import FocusTrap from '@/components/ui/FocusTrap';

/**
 * DEMO (temporal): escucha los previews de email registrados en el servidor y los
 * muestra en un modal ("este correo se enviaría"). No envía nada real.
 *
 * Gated por NEXT_PUBLIC_DEMO_EMAIL_PREVIEW: si no es 'true', el componente no hace
 * polling ni renderiza nada. Para retirar la funcionalidad basta apagar el flag.
 */

type EmailPreview = { id: string; ts: number; to: string; subject: string; body: string; type: string };

const POLL_MS = 2000;
const ENABLED = process.env.NEXT_PUBLIC_DEMO_EMAIL_PREVIEW === 'true';

export default function DemoEmailPreviewListener() {
  const [queue, setQueue] = useState<EmailPreview[]>([]);
  const sinceRef = useRef<number>(Date.now());
  const seenIdsRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/demo/email-preview?since=${sinceRef.current}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data: { enabled?: boolean; emails?: EmailPreview[] } = await res.json();
      const fresh = (data.emails ?? []).filter((e) => !seenIdsRef.current.has(e.id));
      if (fresh.length === 0) return;
      for (const e of fresh) {
        seenIdsRef.current.add(e.id);
        sinceRef.current = Math.max(sinceRef.current, e.ts);
      }
      setQueue((prev) => [...prev, ...fresh]);
    } catch {
      // best-effort: silencioso (es solo demo)
    }
  }, []);

  useEffect(() => {
    if (!ENABLED) return;
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  if (!ENABLED || queue.length === 0) return null;

  const current = queue[0];
  const remaining = queue.length - 1;
  const advance = () => setQueue((prev) => prev.slice(1));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={advance}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        />
        <motion.div
          key={current.id}
          initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }}
          className="relative w-full max-w-lg bg-surface border border-divider rounded-[2rem] shadow-2xl overflow-hidden"
        >
          <FocusTrap onEscape={advance}>
            <div className="p-7 space-y-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="inline-block text-xs font-black uppercase tracking-wider text-primary bg-primary-hl border border-primary/20 rounded-full px-2 py-0.5">
                      📧 Demo · este correo se enviaría
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted mt-1">{current.type}</p>
                  </div>
                </div>
                <button onClick={advance} className="p-2 text-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg" aria-label="Cerrar">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">Para</span>
                  <p className="text-sm font-mono text-foreground break-all">{current.to}</p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">Asunto</span>
                  <p className="text-sm font-bold text-foreground">{current.subject}</p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">Cuerpo</span>
                  <pre className="mt-1 text-xs text-muted whitespace-pre-wrap font-sans bg-background border border-divider rounded-2xl p-4 max-h-64 overflow-y-auto">{current.body}</pre>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  {remaining > 0 ? `${remaining} correo(s) en cola` : 'Sin correos pendientes'}
                </span>
                <button
                  onClick={advance}
                  className="flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg px-3 py-1.5"
                >
                  {remaining > 0 ? 'Siguiente' : 'Cerrar'} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </FocusTrap>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
