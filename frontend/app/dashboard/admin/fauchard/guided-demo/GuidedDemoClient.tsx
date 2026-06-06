'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, RotateCcw, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, Clock, Bell, Star, Zap,
  Trophy, AlertTriangle, User, Microscope, Timer,
  BadgeCheck, ArrowRight, Sparkles,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Datos 100% sintéticos — representan un comportamiento realista de Fauchard
// ---------------------------------------------------------------------------

const SYNTHETIC_CASE = {
  id: 'CASE-2024-0042',
  dentist: 'Dra. Valentina Morales',
  clinic: 'Clínica Dental Providencia',
  workType: 'Corona Posterior · Zirconia',
  complexity: 'COMPLEJO',
  tooth: '36 (primer molar inferior izquierdo)',
  createdAt: 'Hoy 09:14 AM',
};

interface Technician {
  id: string;
  name: string;
  lab: string;
  league: string;
  leagueColor: string;
  quality: number;      // 0-5
  punctuality: number;  // 0-100%
  experience: number;   // 0-7
  load: number;         // active cases
  noResp: number;       // sanction level
  score: number;
  components: { Q: number; P: number; E: number; C: number; B: number; N: number };
  excluded: boolean;
  exclusionReason?: string;
  invited?: boolean;
  responded?: boolean;
  ignored?: boolean;
  quote?: number;
  deliveryDays?: number;
}

const TECHNICIANS: Technician[] = [
  {
    id: 't1', name: 'Carlos Vega', lab: 'Lab Andes Pro', league: 'Platino', leagueColor: 'text-violet-400',
    quality: 4.8, punctuality: 94, experience: 7, load: 2, noResp: 0,
    score: 0.847, components: { Q: 0.192, P: 0.141, E: 0.175, C: 0.150, B: 0.120, N: 0.069 },
    excluded: false, invited: true, responded: true, quote: 148000, deliveryDays: 6,
  },
  {
    id: 't2', name: 'Andrea Rojas', lab: 'Lab Costa Digital', league: 'Oro', leagueColor: 'text-yellow-400',
    quality: 4.5, punctuality: 89, experience: 6, load: 1, noResp: 0,
    score: 0.791, components: { Q: 0.180, P: 0.134, E: 0.150, C: 0.170, B: 0.100, N: 0.057 },
    excluded: false, invited: true, responded: true, quote: 132000, deliveryDays: 8,
  },
  {
    id: 't3', name: 'Matías Herrera', lab: 'Lab Roble CAD', league: 'Oro', leagueColor: 'text-yellow-400',
    quality: 4.3, punctuality: 96, experience: 6, load: 3, noResp: 0,
    score: 0.743, components: { Q: 0.172, P: 0.144, E: 0.150, C: 0.120, B: 0.090, N: 0.067 },
    excluded: false, invited: true, responded: false, ignored: true, quote: undefined, deliveryDays: undefined,
  },
  {
    id: 't4', name: 'Sofía Pinto', lab: 'Lab Norte Studio', league: 'Plata', leagueColor: 'text-slate-300',
    quality: 4.1, punctuality: 82, experience: 5, load: 0, noResp: 0,
    score: 0.698, components: { Q: 0.164, P: 0.123, E: 0.125, C: 0.185, B: 0.080, N: 0.021 },
    excluded: false, invited: false,
  },
  {
    id: 't5', name: 'Diego Farías', lab: 'Lab Pino Tech', league: 'Plata', leagueColor: 'text-slate-300',
    quality: 3.9, punctuality: 88, experience: 5, load: 1, noResp: 1,
    score: 0.651, components: { Q: 0.156, P: 0.132, E: 0.125, C: 0.165, B: 0.060, N: 0.013 },
    excluded: false, invited: false,
  },
  {
    id: 't6', name: 'Ignacio Salas', lab: 'Lab Sur CAM', league: 'Bronce', leagueColor: 'text-orange-400',
    quality: 3.7, punctuality: 91, experience: 3, load: 0, noResp: 0,
    score: 0.512, components: { Q: 0.148, P: 0.137, E: 0.075, C: 0.100, B: 0.050, N: 0.002 },
    excluded: true, exclusionReason: 'Liga insuficiente para Zirconia COMPLEJO',
  },
  {
    id: 't7', name: 'Paula Mendoza', lab: 'Lab Río Studio', league: 'Bronce', leagueColor: 'text-orange-400',
    quality: 3.5, punctuality: 78, experience: 3, load: 7, noResp: 2,
    score: 0.381, components: { Q: 0.140, P: 0.117, E: 0.075, C: 0.020, B: 0.020, N: 0.009 },
    excluded: true, exclusionReason: 'Cooldown activo (ignoró invitación hace 1h)',
  },
  {
    id: 't8', name: 'Roberto Calvo', lab: 'Lab Valle Design', league: 'Bronce', leagueColor: 'text-orange-400',
    quality: 3.6, punctuality: 85, experience: 2, load: 2, noResp: 0,
    score: 0.422, components: { Q: 0.144, P: 0.128, E: 0.050, C: 0.060, B: 0.040, N: 0.000 },
    excluded: true, exclusionReason: 'Liga insuficiente para Zirconia COMPLEJO',
  },
];

// ---------------------------------------------------------------------------
// Definición de las 6 fases del storyboard
// ---------------------------------------------------------------------------

const PHASES = [
  {
    id: 0, title: 'Caso Creado',
    subtitle: 'La dentista abre un nuevo caso en DentFlowAI',
    icon: <User className="w-5 h-5" />,
    color: 'text-primary', bg: 'bg-primary-hl', border: 'border-primary/20',
  },
  {
    id: 1, title: 'Fauchard Evalúa el Pool',
    subtitle: 'El algoritmo puntúa a todos los técnicos registrados en tiempo real',
    icon: <Zap className="w-5 h-5" />,
    color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20',
  },
  {
    id: 2, title: 'Filtrado y Exclusiones',
    subtitle: 'Técnicos no elegibles quedan fuera del pool activo',
    icon: <XCircle className="w-5 h-5" />,
    color: 'text-error', bg: 'bg-error/10', border: 'border-error/20',
  },
  {
    id: 3, title: 'Invitaciones Enviadas',
    subtitle: 'Los 3 técnicos con mayor score reciben una notificación instantánea',
    icon: <Bell className="w-5 h-5" />,
    color: 'text-jade', bg: 'bg-jade/10', border: 'border-jade/20',
  },
  {
    id: 4, title: 'Ventana de Cotización',
    subtitle: 'Los técnicos invitados tienen 90 min para enviar su propuesta de precio',
    icon: <Timer className="w-5 h-5" />,
    color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20',
  },
  {
    id: 5, title: 'Dentista Compara Propuestas',
    subtitle: 'DentFlowAI presenta las cotizaciones recibidas en una tabla comparativa',
    icon: <Microscope className="w-5 h-5" />,
    color: 'text-primary', bg: 'bg-primary-hl', border: 'border-primary/20',
  },
  {
    id: 6, title: 'Caso Asignado',
    subtitle: 'La dentista elige al ganador. Fauchard registra el evento y actualiza scores.',
    icon: <Trophy className="w-5 h-5" />,
    color: 'text-jade', bg: 'bg-jade/10', border: 'border-jade/20',
  },
];

const TOTAL_PHASES = PHASES.length; // 0-6

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function GuidedDemoClient() {
  const [phase, setPhase] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [scoreReveal, setScoreReveal] = useState<Record<string, number>>({});
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [timerSec, setTimerSec] = useState(90 * 60); // 90 min countdown
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPlayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setPhase(0);
    setAutoPlay(false);
    setScoreReveal({});
    setSelectedWinner(null);
    setTimerSec(90 * 60);
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoPlayRef.current) clearTimeout(autoPlayRef.current);
  }, []);

  const nextPhase = useCallback(() => {
    setPhase(p => Math.min(p + 1, TOTAL_PHASES - 1));
  }, []);

  const prevPhase = useCallback(() => {
    setPhase(p => Math.max(p - 1, 0));
  }, []);

  // Auto-play avanza de fase en fase
  useEffect(() => {
    if (autoPlay && phase < TOTAL_PHASES - 1) {
      const delay = phase === 1 ? 3500 : phase === 4 ? 4000 : 2800;
      autoPlayRef.current = setTimeout(nextPhase, delay);
    } else if (phase === TOTAL_PHASES - 1) {
      setAutoPlay(false);
    }
    return () => { if (autoPlayRef.current) clearTimeout(autoPlayRef.current); };
  }, [autoPlay, phase, nextPhase]);

  // Animación de scores en la fase 1
  useEffect(() => {
    if (phase !== 1) return;
    const targets: Record<string, number> = {};
    TECHNICIANS.forEach(t => { targets[t.id] = 0; });
    setScoreReveal(targets);

    const delays = TECHNICIANS.map((_, i) => i * 180);
    const timers: ReturnType<typeof setTimeout>[] = [];

    TECHNICIANS.forEach((t, i) => {
      timers.push(setTimeout(() => {
        setScoreReveal(prev => ({ ...prev, [t.id]: t.score }));
      }, delays[i]));
    });

    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Countdown timer en fase 4
  useEffect(() => {
    if (phase === 4 && !timerRunning) {
      setTimerRunning(true);
    }
    if (phase !== 4) {
      setTimerRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [phase, timerRunning]);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSec(s => {
          if (s <= 1) {
            clearInterval(timerRef.current!);
            return 0;
          }
          return s - 1;
        });
      }, 50); // acelerado × 72x para demo
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const fmtTimer = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const currentPhase = PHASES[phase];
  const invited = TECHNICIANS.filter(t => t.invited);
  const excluded = TECHNICIANS.filter(t => t.excluded);
  const eligibleInvited = invited.filter(t => t.invited && !t.excluded);

  return (
    <div className="space-y-8">

      {/* ------------------------------------------------------------------ */}
      {/* Barra de progreso de fases                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="p-6 rounded-[2rem] bg-surface/40 border border-divider space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black text-faint uppercase tracking-widest">Progreso del Storyboard</h3>
          <span className="text-[10px] font-bold text-primary">Fase {phase + 1} de {TOTAL_PHASES}</span>
        </div>

        {/* Steps indicators */}
        <div className="flex items-center gap-1">
          {PHASES.map((p, i) => (
            <div key={p.id} className="flex items-center flex-1">
              <button
                onClick={() => setPhase(i)}
                className={`w-full py-2 px-1 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all text-center leading-tight ${
                  i === phase
                    ? 'bg-primary text-inverse shadow-sm'
                    : i < phase
                    ? 'bg-jade/20 text-jade border border-jade/30'
                    : 'bg-surface-2 text-faint border border-divider'
                }`}
              >
                {i < phase ? '✓' : i + 1}
                <span className="hidden md:block truncate">{p.title.split(' ').slice(0, 2).join(' ')}</span>
              </button>
              {i < PHASES.length - 1 && (
                <div className={`h-0.5 w-2 shrink-0 transition-colors ${i < phase ? 'bg-jade/50' : 'bg-divider'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={prevPhase}
            disabled={phase === 0}
            className="p-2.5 rounded-xl bg-surface-2 border border-divider text-faint hover:text-foreground disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setAutoPlay(a => !a)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              autoPlay
                ? 'bg-error/20 border border-error/30 text-error'
                : 'bg-primary text-inverse'
            }`}
          >
            {autoPlay ? <><Pause className="w-4 h-4" /> Pausar</> : <><Play className="w-4 h-4" /> Auto-Play</>}
          </button>

          <button
            onClick={nextPhase}
            disabled={phase === TOTAL_PHASES - 1}
            className="p-2.5 rounded-xl bg-surface-2 border border-divider text-faint hover:text-foreground disabled:opacity-30 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={reset}
            className="ml-auto p-2.5 rounded-xl bg-surface-2 border border-divider text-faint hover:text-foreground transition-all"
            title="Reiniciar"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Cabecera de la fase actual                                          */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`header-${phase}`}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className={`flex items-center gap-4 p-5 rounded-[2rem] border ${currentPhase.bg} ${currentPhase.border}`}
        >
          <div className={`w-12 h-12 rounded-2xl bg-surface flex items-center justify-center ${currentPhase.color} border ${currentPhase.border}`}>
            {currentPhase.icon}
          </div>
          <div>
            <p className="text-[9px] font-black text-faint uppercase tracking-widest">Fase {phase + 1}</p>
            <h2 className={`text-xl font-black ${currentPhase.color} tracking-tight`}>{currentPhase.title}</h2>
            <p className="text-xs text-faint mt-0.5">{currentPhase.subtitle}</p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Contenido de cada fase                                              */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence mode="wait">

        {/* FASE 0 — Caso Creado */}
        {phase === 0 && (
          <motion.div key="p0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Card del caso */}
            <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black text-foreground">{SYNTHETIC_CASE.dentist}</p>
                  <p className="text-[9px] text-faint">{SYNTHETIC_CASE.clinic}</p>
                </div>
                <span className="ml-auto text-[8px] font-black bg-jade/10 text-jade border border-jade/20 px-2 py-1 rounded-lg">NUEVO CASO</span>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'ID del Caso', value: SYNTHETIC_CASE.id },
                  { label: 'Tipo de Trabajo', value: SYNTHETIC_CASE.workType },
                  { label: 'Complejidad', value: SYNTHETIC_CASE.complexity },
                  { label: 'Pieza Dental', value: SYNTHETIC_CASE.tooth },
                  { label: 'Hora de Apertura', value: SYNTHETIC_CASE.createdAt },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-divider/40 last:border-0">
                    <span className="text-[9px] font-black text-faint uppercase tracking-wider">{row.label}</span>
                    <span className="text-xs font-bold text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Explicación narrativa */}
            <div className="space-y-4">
              <div className="p-6 rounded-[2rem] bg-surface/30 border border-divider space-y-3">
                <Sparkles className="w-5 h-5 text-primary" />
                <h4 className="text-sm font-black text-foreground">¿Qué ocurrió?</h4>
                <p className="text-xs text-muted leading-relaxed">
                  La <strong className="text-foreground">Dra. Morales</strong> abrió un caso en DentFlowAI indicando el tipo de trabajo, la pieza y la complejidad. En ese mismo instante, el sistema registró el evento <code className="text-primary text-[9px] bg-surface-2 px-1.5 py-0.5 rounded-md">case:opened</code> y activó el motor Fauchard.
                </p>
              </div>
              <div className="p-6 rounded-[2rem] bg-primary-hl border border-primary/20 space-y-2">
                <p className="text-[9px] font-black text-primary uppercase tracking-widest">Siguiente paso</p>
                <p className="text-xs text-muted">Fauchard leerá la configuración activa y comenzará a calcular el score de todos los técnicos registrados en la plataforma.</p>
                <button onClick={nextPhase} className="mt-2 flex items-center gap-2 text-xs font-black text-primary hover:gap-3 transition-all">
                  Ver evaluación del pool <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* FASE 1 — Evaluación del Pool */}
        {phase === 1 && (
          <motion.div key="p1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-4">
            <p className="text-xs text-faint">Los scores se calculan usando <strong className="text-foreground">αQ·FQ + αP·FP + αE·FE − αC·FC + αB·FB − αN·FN</strong> con la configuración actual. Las barras se revelan en orden de cálculo.</p>

            <div className="space-y-3">
              {TECHNICIANS.map((t, i) => {
                const rev = scoreReveal[t.id] ?? 0;
                const pct = (rev / 1) * 100;
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-surface/30 border border-divider"
                  >
                    <div className="w-28 shrink-0">
                      <p className="text-[10px] font-black text-foreground truncate">{t.name}</p>
                      <p className="text-[8px] text-faint truncate">{t.lab}</p>
                      <span className={`text-[8px] font-black ${t.leagueColor}`}>{t.league}</span>
                    </div>

                    <div className="flex-1">
                      <div className="w-full h-4 bg-surface-2 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-primary rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${(scoreReveal[t.id] ?? 0) * 100}%` }}
                          transition={{ duration: 0.7, ease: 'easeOut' }}
                        />
                      </div>
                    </div>

                    <span className="text-sm font-mono font-black text-primary tabular-nums w-14 text-right">
                      {rev > 0 ? rev.toFixed(3) : '—'}
                    </span>

                    <div className="flex gap-1 shrink-0">
                      {(['Q','P','E','C','B','N'] as const).map(k => (
                        <div key={k} className="flex flex-col items-center">
                          <span className="text-[6px] text-faint font-black">{k}</span>
                          <span className="text-[8px] font-mono text-muted">{t.components[k].toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="p-4 rounded-2xl bg-surface-2/60 border border-divider text-[10px] text-faint">
              ⚡ Tiempo de cálculo estimado: <strong className="text-foreground">{"< 200ms"}</strong> para {TECHNICIANS.length} técnicos en la DB.
            </div>
          </motion.div>
        )}

        {/* FASE 2 — Filtrado y Exclusiones */}
        {phase === 2 && (
          <motion.div key="p2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TECHNICIANS.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.07 }}
                  className={`relative p-4 rounded-2xl border transition-all overflow-hidden ${
                    t.excluded
                      ? 'bg-error/5 border-error/20 grayscale'
                      : 'bg-surface/30 border-divider'
                  }`}
                >
                  {/* Overlay de exclusión */}
                  {t.excluded && (
                    <div className="absolute inset-0 bg-error/5 flex items-center justify-center z-10">
                      <div className="flex items-center gap-2 bg-error/20 border border-error/30 px-3 py-1.5 rounded-xl">
                        <XCircle className="w-3.5 h-3.5 text-error" />
                        <span className="text-[9px] font-black text-error uppercase">{t.exclusionReason}</span>
                      </div>
                    </div>
                  )}

                  <div className={`flex items-center justify-between ${t.excluded ? 'opacity-30' : ''}`}>
                    <div>
                      <p className="text-[11px] font-black text-foreground">{t.name}</p>
                      <p className="text-[8px] text-faint">{t.lab}</p>
                      <span className={`text-[8px] font-black ${t.leagueColor}`}>{t.league}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono font-black text-primary">{t.score.toFixed(3)}</span>
                      {!t.excluded && (
                        <p className="text-[8px] text-jade font-black">✓ Elegible</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-jade/10 border border-jade/20 text-center">
                <p className="text-2xl font-black text-jade">{TECHNICIANS.filter(t => !t.excluded).length}</p>
                <p className="text-[9px] font-bold text-jade uppercase">Elegibles</p>
              </div>
              <div className="p-4 rounded-2xl bg-error/10 border border-error/20 text-center">
                <p className="text-2xl font-black text-error">{excluded.length}</p>
                <p className="text-[9px] font-bold text-error uppercase">Excluidos</p>
              </div>
              <div className="p-4 rounded-2xl bg-primary-hl border border-primary/20 text-center">
                <p className="text-2xl font-black text-primary">3</p>
                <p className="text-[9px] font-bold text-primary uppercase">Invitar (top-N)</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* FASE 3 — Invitaciones */}
        {phase === 3 && (
          <motion.div key="p3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <p className="text-xs text-faint">Fauchard selecciona los <strong className="text-foreground">3 técnicos elegibles de mayor score</strong> y les envía una notificación push + email con los detalles del caso.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {invited.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: i * 0.3, type: 'spring', stiffness: 200 }}
                  className="relative p-6 rounded-[2rem] bg-jade/5 border border-jade/30 text-center space-y-3 overflow-hidden"
                >
                  {/* Pulso de notificación */}
                  <div className="absolute top-3 right-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-jade opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-jade" />
                    </span>
                  </div>

                  <div className="w-12 h-12 mx-auto rounded-2xl bg-jade/20 border border-jade/30 flex items-center justify-center">
                    <Bell className="w-6 h-6 text-jade" />
                  </div>

                  <div>
                    <p className="text-sm font-black text-foreground">{t.name}</p>
                    <p className="text-[9px] text-faint">{t.lab}</p>
                    <span className={`text-[9px] font-black ${t.leagueColor}`}>{t.league}</span>
                  </div>

                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-3 h-3 text-warning fill-warning" />
                    <span className="text-xs font-mono font-black text-primary">{t.score.toFixed(3)}</span>
                  </div>

                  <div className="p-2 rounded-xl bg-jade/10 text-[8px] text-jade font-bold">
                    Invitación #{i + 1} enviada
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="p-4 rounded-2xl bg-surface-2/60 border border-divider space-y-1">
              <p className="text-[9px] font-black text-faint uppercase tracking-wider">Técnicos no invitados (en espera)</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {TECHNICIANS.filter(t => !t.invited && !t.excluded).map(t => (
                  <span key={t.id} className="text-[9px] font-bold bg-surface border border-divider px-2 py-1 rounded-lg text-muted">
                    {t.name} · {t.score.toFixed(3)}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* FASE 4 — Ventana de Cotización */}
        {phase === 4 && (
          <motion.div key="p4" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">

            {/* Timer central */}
            <div className="flex flex-col items-center py-6 gap-2">
              <p className="text-[9px] font-black text-faint uppercase tracking-widest">Tiempo Restante para Cotizar</p>
              <div className={`text-5xl font-mono font-black tabular-nums ${timerSec < 1800 ? 'text-error' : timerSec < 3600 ? 'text-warning' : 'text-foreground'}`}>
                {fmtTimer(timerSec)}
              </div>
              <div className="w-64 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${timerSec < 1800 ? 'bg-error' : timerSec < 3600 ? 'bg-warning' : 'bg-primary'}`}
                  style={{ width: `${(timerSec / (90 * 60)) * 100}%` }}
                />
              </div>
              <p className="text-[9px] text-faint">Plazo original: 90 minutos (demo × 72x velocidad)</p>
            </div>

            {/* Estado de cada técnico invitado */}
            <div className="space-y-3">
              {invited.map((t, i) => {
                const responded = timerSec < 80 * 60 && !t.ignored;
                const ignored = t.ignored && timerSec < 70 * 60;
                const pending = !responded && !ignored;

                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                      responded ? 'bg-jade/5 border-jade/30' :
                      ignored ? 'bg-error/5 border-error/20' :
                      'bg-surface/30 border-divider'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      responded ? 'bg-jade/20 text-jade' :
                      ignored ? 'bg-error/20 text-error' :
                      'bg-warning/20 text-warning'
                    }`}>
                      {responded ? <CheckCircle2 className="w-5 h-5" /> :
                       ignored ? <XCircle className="w-5 h-5" /> :
                       <Clock className="w-5 h-5 animate-pulse" />}
                    </div>

                    <div className="flex-1">
                      <p className="text-[11px] font-black text-foreground">{t.name} · {t.lab}</p>
                      <p className="text-[9px] text-faint">
                        {responded ? `Cotización recibida: $${t.quote?.toLocaleString('es-CL')} · ${t.deliveryDays} días` :
                         ignored ? 'Sin respuesta — cooldown activado' :
                         'Pendiente de respuesta...'}
                      </p>
                    </div>

                    <div>
                      {responded && (
                        <span className="text-[9px] font-black bg-jade/10 text-jade border border-jade/20 px-2 py-1 rounded-lg">✓ Cotizó</span>
                      )}
                      {ignored && (
                        <span className="text-[9px] font-black bg-error/10 text-error border border-error/20 px-2 py-1 rounded-lg">⏸ Cooldown</span>
                      )}
                      {pending && (
                        <span className="text-[9px] font-black bg-warning/10 text-warning border border-warning/20 px-2 py-1 rounded-lg animate-pulse">Esperando</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="p-4 rounded-2xl bg-surface-2/60 border border-divider text-[10px] text-faint">
              ℹ️ <strong className="text-foreground">Lab Roble CAD</strong> no respondió a tiempo. El motor registrará esto como «no-respuesta» y activará el cooldown de {90} min. El reemplazo automático puede dispararse si quedan ciclos disponibles.
            </div>
          </motion.div>
        )}

        {/* FASE 5 — Comparativo de Propuestas */}
        {phase === 5 && (
          <motion.div key="p5" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <p className="text-xs text-faint">
              DentFlowAI construye una tabla comparativa con las <strong className="text-foreground">2 propuestas recibidas</strong> y la envía a la Dra. Morales. El precio mostrado ya incluye el margen de plataforma.
            </p>

            {/* Tabla comparativa */}
            <div className="overflow-x-auto rounded-[2rem] border border-divider bg-surface/20">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface border-b border-divider text-[9px] font-black uppercase tracking-wider text-faint">
                    <th className="px-6 py-4">Laboratorio</th>
                    <th className="px-6 py-4">Score Fauchard</th>
                    <th className="px-6 py-4">Precio (con margen)</th>
                    <th className="px-6 py-4">Plazo de Entrega</th>
                    <th className="px-6 py-4">Reputación</th>
                    <th className="px-6 py-4">Liga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider/40">
                  {invited.filter(t => t.responded).map((t, i) => (
                    <motion.tr
                      key={t.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.2 }}
                      className={`transition-colors ${
                        selectedWinner === t.id ? 'bg-primary/5' : 'hover:bg-surface-2/30'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-foreground">{t.name}</p>
                        <p className="text-[9px] text-faint">{t.lab}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono font-black text-primary">{t.score.toFixed(3)}</span>
                        {i === 0 && <span className="ml-2 text-[8px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded-md">TOP</span>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono font-black text-foreground">
                          ${((t.quote ?? 0) * 1.15).toLocaleString('es-CL')}
                        </span>
                        <p className="text-[8px] text-faint">neto: ${t.quote?.toLocaleString('es-CL')}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-foreground">{t.deliveryDays} días hábiles</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, si) => (
                            <Star key={si} className={`w-3 h-3 ${si < Math.round(t.quality) ? 'text-warning fill-warning' : 'text-divider'}`} />
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[9px] font-black ${t.leagueColor}`}>{t.league}</span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-faint italic">
              La Dra. Morales ve esta tabla en su panel de dentista. Tiene <strong className="text-foreground">2 horas</strong> para elegir antes de que expiren las propuestas.
            </p>
          </motion.div>
        )}

        {/* FASE 6 — Asignación Final */}
        {phase === 6 && (
          <motion.div key="p6" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">

            {/* Selector de ganador */}
            {!selectedWinner && (
              <div className="p-6 rounded-[2rem] bg-primary-hl border border-primary/20 space-y-4">
                <p className="text-sm font-black text-primary">¿A quién elige la Dra. Morales?</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  {invited.filter(t => t.responded).map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedWinner(t.id)}
                      className="flex-1 p-4 rounded-2xl bg-surface border border-divider hover:border-primary/40 hover:bg-primary/5 transition-all text-left space-y-1"
                    >
                      <p className="text-xs font-black text-foreground">{t.name}</p>
                      <p className="text-[9px] text-faint">{t.lab} · ${((t.quote ?? 0) * 1.15).toLocaleString('es-CL')}</p>
                      <p className="text-[9px] font-black text-primary">Score: {t.score.toFixed(3)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Resultado */}
            {selectedWinner && (() => {
              const winner = TECHNICIANS.find(t => t.id === selectedWinner)!;
              const loser = invited.filter(t => t.responded && t.id !== selectedWinner)[0];
              return (
                <div className="space-y-6">
                  {/* Winner card */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-8 rounded-[2.5rem] bg-jade/10 border border-jade/30 text-center space-y-4"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}
                      className="w-16 h-16 mx-auto rounded-2xl bg-jade/20 border border-jade/30 flex items-center justify-center"
                    >
                      <Trophy className="w-8 h-8 text-jade" />
                    </motion.div>
                    <div>
                      <p className="text-[9px] font-black text-jade uppercase tracking-widest">Laboratorio Seleccionado</p>
                      <h3 className="text-2xl font-black text-foreground mt-1">{winner.name}</h3>
                      <p className="text-sm text-faint">{winner.lab} · {winner.league}</p>
                    </div>
                    <div className="flex justify-center gap-6">
                      <div>
                        <p className="text-lg font-mono font-black text-foreground">${((winner.quote ?? 0) * 1.15).toLocaleString('es-CL')}</p>
                        <p className="text-[8px] text-faint">Precio final</p>
                      </div>
                      <div>
                        <p className="text-lg font-mono font-black text-foreground">{winner.deliveryDays}d</p>
                        <p className="text-[8px] text-faint">Entrega</p>
                      </div>
                      <div>
                        <p className="text-lg font-mono font-black text-primary">{winner.score.toFixed(3)}</p>
                        <p className="text-[8px] text-faint">Score Fauchard</p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Actualizaciones del sistema */}
                  <div className="space-y-3">
                    <p className="text-[9px] font-black text-faint uppercase tracking-widest">Efectos en el Sistema</p>
                    {[
                      { icon: <BadgeCheck className="w-4 h-4 text-jade" />, text: `Caso ${SYNTHETIC_CASE.id} → estado "EN_PRODUCCION"`, color: 'border-jade/20 bg-jade/5' },
                      { icon: <ArrowRight className="w-4 h-4 text-primary" />, text: `Fauchard incrementa el score de calidad de ${winner.name} tras la entrega exitosa`, color: 'border-primary/20 bg-primary/5' },
                      { icon: <AlertTriangle className="w-4 h-4 text-warning" />, text: `Lab Roble CAD: sanción nivel 1 registrada por no-respuesta (αN baja 14 días)`, color: 'border-warning/20 bg-warning/5' },
                      { icon: <XCircle className="w-4 h-4 text-error" />, text: `${loser?.name}: propuesta no aceptada — no cuenta como sanción`, color: 'border-divider bg-surface/20' },
                    ].map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.15 }}
                        className={`flex items-center gap-3 p-3 rounded-xl border ${item.color}`}
                      >
                        {item.icon}
                        <p className="text-[10px] font-bold text-foreground">{item.text}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* Restart */}
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={reset}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-surface-2 border border-divider text-sm font-black text-faint hover:text-foreground hover:border-primary/30 transition-all"
                    >
                      <RotateCcw className="w-4 h-4" /> Reiniciar Demo
                    </button>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
