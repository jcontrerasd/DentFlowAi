'use client';

/**
 * Stepper de 3 nodos del estado de respuesta del técnico (v5.0, §2.6.1).
 * Los 3 nodos siempre se muestran; el activo se rellena con el color del nivel.
 */

type Props = {
  level: 0 | 1 | 2 | 3;
  count: number;
  nextExitDate: Date | string | null;
  compact?: boolean;
};

const NODES = [
  { n: 1, title: 'Nivel 1', sub: 'Sin impacto', range: '(0–1)' },
  { n: 2, title: 'Nivel 2', sub: 'Score penalizado', range: '(2)' },
  { n: 3, title: 'Nivel 3', sub: 'Auto-OFF', range: '(3+)' },
];

const COLOR: Record<number, string> = { 1: 'text-primary', 2: 'text-amber-400', 3: 'text-error' };
const DOT: Record<number, string> = { 1: 'bg-primary', 2: 'bg-amber-400', 3: 'bg-error' };

export default function ResponseStatusStepper({ level, count, nextExitDate, compact = false }: Props) {
  const activeColor = level >= 1 ? COLOR[level] : 'text-faint';
  const exit = nextExitDate ? new Date(nextExitDate) : null;
  const daysLeft = exit ? Math.max(0, Math.ceil((exit.getTime() - Date.now()) / 86_400_000)) : null;

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className={`text-sm font-black ${activeColor}`}>
            {level === 0 ? 'Nivel 1 — Sin no-respuestas' : `Nivel ${level}`}
          </p>
          <p className="text-[11px] text-faint">No-respuestas en ventana: <span className="font-bold text-foreground">{count}</span></p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center">
        {NODES.map((node, i) => {
          const isActive = (level === 0 ? 1 : level) === node.n;
          return (
            <div key={node.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <span className={`w-4 h-4 rounded-full border-2 ${isActive ? `${DOT[node.n]} border-transparent` : 'border-divider bg-transparent'}`} />
                {!compact && (
                  <div className="leading-tight">
                    <p className={`text-[10px] font-bold ${isActive ? COLOR[node.n] : 'text-faint'}`}>{node.title}</p>
                    <p className="text-[9px] text-faint">{node.sub}</p>
                    <p className="text-[9px] text-faint">{node.range}</p>
                  </div>
                )}
              </div>
              {i < NODES.length - 1 && <div className="h-px flex-1 bg-divider mx-1 -mt-4" />}
            </div>
          );
        })}
      </div>

      {exit && daysLeft !== null && level >= 1 && (
        <p className="text-[11px] text-faint">
          Próxima salida de ventana: <span className="font-bold text-foreground">{exit.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          {` (en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'})`}
        </p>
      )}
      {!compact && (
        <p className="text-[10px] text-faint leading-snug">
          Ventana rolling: solo cuentan las no-respuestas de los últimos días configurados. Las viejas salen automáticamente.
        </p>
      )}
    </div>
  );
}
