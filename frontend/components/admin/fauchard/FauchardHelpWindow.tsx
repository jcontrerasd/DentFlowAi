'use client';

import { useRef, useEffect, useState, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GripVertical, HelpCircle, SlidersHorizontal } from 'lucide-react';
import type { FauchardHelpSection } from '@/lib/constants/fauchardHelp';
import { fauchardParamTooltip, fauchardParamLabel, fauchardParamSpace, fauchardParamNumber, helpParamKey, helpParamNumberText } from '@/lib/constants/fauchardHelp';

interface FauchardHelpWindowProps {
  isOpen: boolean;
  onClose: () => void;
  section: FauchardHelpSection;
  /** Clave de parámetro a la que hacer scroll + resaltar al abrir (link "Ver ejemplo →"). */
  focusKey?: string | null;
}

/** Alto de la cabecera sticky (h-20). La ventana no sube por detrás de ella. */
const HEADER_H = 80;

/**
 * Evento global para coordinar exclusividad mutua: varios paneles montan su
 * propia <FauchardHelpWindow> y todas se anclan en el mismo lugar. Al abrir una,
 * se difunde este evento con su id para que las demás se cierren (si no, quedan
 * apiladas y la de abajo no se ve aunque se vuelva a pulsar su "?").
 */
const HELP_OPEN_EVENT = 'fauchard-help-open';

/**
 * Ventana flotante de ayuda para los paneles Fauchard.
 *
 * - No-modal: flota por encima sin bloquear el panel; el admin puede seguir
 *   ajustando controles mientras lee.
 * - Drag & drop: arrastre manual desde la barra de título con posición
 *   controlada y clamp explícito (sube hasta justo bajo la cabecera, baja
 *   libre). Determinista, sin las rarezas de dragConstraints de framer.
 * - Redimensionable: `resize: both` nativo de CSS (el tamaño lo controla el
 *   navegador vía clases Tailwind; el estilo en línea NO fija width/height para
 *   no pisar el resize en cada re-render).
 * - Portal a <body>: evita quedar atrapada en el stacking context del panel
 *   animado de TabClient (framer le aplica transform) y por debajo del header.
 *
 * El contenido se pasa como datos (`FauchardHelpSection`).
 */
export default function FauchardHelpWindow({ isOpen, onClose, section, focusKey }: FauchardHelpWindowProps) {
  const router = useRouter();
  const helpId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const winRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);
  // Reaparece siempre en su posición por defecto al abrir.
  useEffect(() => { if (isOpen) setPos(null); }, [isOpen]);

  // Exclusividad mutua: al abrir esta ventana, avisa a las demás para que se
  // cierren; y si otra se abre, ésta se cierra. Evita ventanas apiladas.
  useEffect(() => {
    if (!isOpen) return;
    window.dispatchEvent(new CustomEvent(HELP_OPEN_EVENT, { detail: helpId }));
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail !== helpId) onCloseRef.current();
    };
    window.addEventListener(HELP_OPEN_EVENT, onOther);
    return () => window.removeEventListener(HELP_OPEN_EVENT, onOther);
  }, [isOpen, helpId]);

  // Scroll + resalte de la tarjeta del parámetro/métrica enfocado.
  // Primero intenta casar por descripción (params de config); si no, por
  // símbolo o label (métricas de Observabilidad, p. ej. focusKey = "#1").
  useEffect(() => {
    if (!isOpen || !focusKey) { setFlashIndex(null); return; }
    const targetDesc = fauchardParamTooltip(focusKey);
    let idx = targetDesc ? section.params.findIndex((p) => p.description === targetDesc) : -1;
    if (idx < 0) idx = section.params.findIndex((p) => p.symbol === focusKey || p.label === focusKey || helpParamKey(p.symbol) === focusKey);
    if (idx < 0) { setFlashIndex(null); return; }
    const t = setTimeout(() => {
      cardRefs.current[idx]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFlashIndex(idx);
    }, 80);
    const clear = setTimeout(() => setFlashIndex(null), 2200);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [isOpen, focusKey, section]);

  const clamp = useCallback((x: number, y: number) => {
    const el = winRef.current;
    const w = el?.offsetWidth ?? 440;
    const maxX = Math.max(8, window.innerWidth - w - 8);
    const maxY = Math.max(HEADER_H + 8, window.innerHeight - 48); // deja la barra de título siempre visible
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(HEADER_H + 8, y), maxY),
    };
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragOffset.current) return;
    setPos(clamp(e.clientX - dragOffset.current.dx, e.clientY - dragOffset.current.dy));
  }, [clamp]);

  const onPointerUp = useCallback(() => {
    dragOffset.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    const rect = winRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setPos({ x: rect.left, y: rect.top }); // pasa de anclaje CSS a coordenadas absolutas
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [onPointerMove, onPointerUp]);

  // Limpieza de listeners si se desmonta a mitad de arrastre.
  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove, onPointerUp]);

  if (!mounted) return null;

  // Sin arrastre aún → anclada arriba a la derecha, bajo la cabecera.
  const positionStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto' }
    : { right: 24, top: HEADER_H + 16, left: 'auto' };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={winRef}
          role="dialog"
          aria-modal={false}
          aria-label={`Ayuda: ${section.title}`}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          style={{ ...positionStyle, resize: 'both', overflow: 'hidden' }}
          className="fixed z-[60] flex flex-col rounded-[1.75rem] border border-divider bg-surface/95 shadow-2xl backdrop-blur-xl w-[min(440px,92vw)] h-[min(560px,80vh)] min-w-[320px] min-h-[240px] max-w-[95vw] max-h-[90vh]"
        >
          {/* Barra de título — zona de arrastre */}
          <div
            onPointerDown={startDrag}
            className="flex items-center gap-3 px-5 py-4 border-b border-divider/80 cursor-grab active:cursor-grabbing select-none touch-none"
          >
            <GripVertical className="w-4 h-4 text-faint shrink-0" />
            <HelpCircle className="w-4 h-4 text-primary shrink-0" />
            <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-foreground truncate">
              {section.title}
            </span>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Cerrar ayuda"
              className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Cuerpo scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {section.intro && (
              <p className="text-xs leading-relaxed text-muted">{section.intro}</p>
            )}

            <div className="space-y-4">
              {section.params.map((param, i) => (
                <div
                  key={param.label}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  className={`rounded-2xl border p-4 space-y-2 transition-shadow duration-300 ${
                    flashIndex === i
                      ? 'border-primary/50 bg-primary-hl/30 ring-2 ring-primary/50'
                      : 'border-divider/70 bg-surface-2/40'
                  }`}
                >
                  {(() => {
                    const pkey = helpParamKey(param.symbol);
                    const numText = helpParamNumberText(param.symbol);
                    const displayLabel = pkey ? fauchardParamLabel(pkey) : param.label;
                    return (
                      <div className="flex items-center gap-2">
                        {numText ? (
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary-hl px-1.5 text-[11px] font-black text-primary" title={`Parámetro ${numText}`}>
                            {numText}
                          </span>
                        ) : param.symbol ? (
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary-hl px-1.5 text-[11px] font-black text-primary">
                            {param.symbol}
                          </span>
                        ) : null}
                        <span className="text-sm font-bold text-foreground">{displayLabel}</span>
                      </div>
                    );
                  })()}
                  <p className="text-xs leading-relaxed text-muted">{param.description}</p>
                  <div className="rounded-xl border border-divider/60 bg-surface/60 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-1">
                      Ejemplo
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/90">{param.example}</p>
                  </div>
                  {param.links && param.links.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-faint mr-0.5">Ajustar:</span>
                      {param.links.map((lnk) => {
                        const n = fauchardParamNumber(lnk.key);
                        return (
                          <button
                            key={lnk.key}
                            type="button"
                            onClick={() => {
                              router.push(`/dashboard/admin/fauchard?space=${fauchardParamSpace(lnk.key)}&focus=${lnk.key}`);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary-hl px-2 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            title={`Ir al parámetro ${n != null ? `N°${n} ` : ''}"${fauchardParamLabel(lnk.key)}"`}
                          >
                            <SlidersHorizontal className="w-3 h-3 shrink-0" />
                            {n != null && <span className="font-black">N°{n}</span>}
                            {fauchardParamLabel(lnk.key)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {section.notes && section.notes.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-divider/70 bg-surface-2/30 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-faint">
                  Reglas
                </p>
                <ul className="space-y-1.5">
                  {section.notes.map((note, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Pista visual de redimensionado (la esquina nativa queda encima) */}
          <div className="pointer-events-none absolute bottom-1 right-1 text-faint/50">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M11 5L5 11M11 9L9 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
