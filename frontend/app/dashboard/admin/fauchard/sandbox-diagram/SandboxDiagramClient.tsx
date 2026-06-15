'use client';

import { useState, useEffect, useTransition } from 'react';
import { simulateFauchardAction } from '@/lib/db/actions/fauchard';
import {
  Play,
  Users,
  Filter,
  Trophy,
  RefreshCcw,
  FlaskConical,
  BarChart3,
  Grid3X3,
  ListOrdered,
  RotateCcw,
} from 'lucide-react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { motion } from 'framer-motion';
import { CASE_COMPLEXITY } from '@/lib/constants/dental';
import { COMPLEXITY_TO_LEAGUE } from '@/lib/fauchard/assignmentScenario';

const EXCLUSION_LABELS: Record<string, string> = {
  not_available: 'No disponible',
  suspended: 'Suspendido',
  inactive: 'Inactivo',
  league_mismatch: 'Liga',
  cooldown: 'Cooldown',
  insufficient_skill: 'Skill',
  availability_filter: 'Disponibilidad',
  excluded_manually: 'Manual',
};

type Tab = 'funnel' | 'radar' | 'ranking' | 'heatmap' | 'timeline';

interface SandboxDiagramClientProps {
  initialConfig: Record<string, unknown>;
}

export default function SandboxDiagramClient({ initialConfig }: SandboxDiagramClientProps) {
  const [weights, setWeights] = useState({
    alphaQuality: Number(initialConfig.alphaQuality),
    alphaPunctuality: Number(initialConfig.alphaPunctuality),
    alphaExperience: Number(initialConfig.alphaExperience),
    alphaLoad: Number(initialConfig.alphaLoad),
    alphaNoResponse: Number(initialConfig.alphaNoResponse ?? 0.25),
  });

  const [scenario, setScenario] = useState({
    restorationLabel: 'Corona Unitaria',
    caseComplexity: 'INTERMEDIO' as keyof typeof CASE_COMPLEXITY,
    teethCount: 1,
    maxAssignmentAttempts: Number(initialConfig.maxAssignmentAttempts ?? 3),
    tCooldownMinutes: Number(initialConfig.tCooldownMinutes),
    dInactivityDays: Number(initialConfig.dInactivityDays),
  });

  const [simulateRejectTop1, setSimulateRejectTop1] = useState(false);
  const [lastTop1, setLastTop1] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('funnel');
  const [isPending, startTransition] = useTransition();

  const sumWeights = Object.values(weights).reduce((a, b) => a + b, 0);
  const weightsValid = Math.abs(sumWeights - 1) < 0.001;
  const derivedLeague = COMPLEXITY_TO_LEAGUE[scenario.caseComplexity] ?? 'bronce';

  const runSimulation = () => {
    startTransition(async () => {
      const teeth =
        scenario.teethCount > 1
          ? Array.from({ length: scenario.teethCount }, (_, i) => i + 11)
          : [];
      const res = await simulateFauchardAction({
        restorationType: scenario.restorationLabel,
        caseComplexity: scenario.caseComplexity,
        teeth,
        excludeTechnicianIds: simulateRejectTop1 && lastTop1 ? [lastTop1] : [],
        configOverride: {
          ...weights,
          maxAssignmentAttempts: scenario.maxAssignmentAttempts,
          tCooldownMinutes: scenario.tCooldownMinutes,
          dInactivityDays: scenario.dInactivityDays,
        },
      });
      if (res.success) {
        setSimulation(res.simulation);
        const top = (res.simulation.assignmentPreview as { selectedTechnicianId?: string })?.selectedTechnicianId;
        if (top) setLastTop1(top);
      }
    });
  };

  useEffect(() => {
    if (weightsValid) runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const funnel = simulation?.funnel as { universe: number; eligible: number; excluded: Record<string, number> } | undefined;
  const ranked = (simulation?.ranked as Array<Record<string, unknown>>) ?? [];
  const preview = simulation?.assignmentPreview as { retryChain: string[]; attemptsBudget: number } | undefined;

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'funnel', label: 'Funnel', icon: Filter },
    { id: 'radar', label: 'Radar α', icon: BarChart3 },
    { id: 'ranking', label: 'Ranking', icon: ListOrdered },
    { id: 'heatmap', label: 'Heatmap', icon: Grid3X3 },
    { id: 'timeline', label: 'Timeline', icon: Trophy },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 p-6 rounded-[2rem] bg-surface/40 border border-divider space-y-6">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Controles</h3>
            {isPending && <RefreshCcw className="w-4 h-4 text-primary animate-spin ml-auto" />}
          </div>

          <div className="space-y-3">
            <label className="text-[9px] font-bold uppercase text-faint">Restauración</label>
            <input
              className="w-full bg-background border border-divider rounded-xl px-3 py-2 text-sm"
              value={scenario.restorationLabel}
              onChange={(e) => setScenario((s) => ({ ...s, restorationLabel: e.target.value }))}
            />
            <label className="text-[9px] font-bold uppercase text-faint">Piezas</label>
            <input
              type="number"
              min={1}
              max={32}
              className="w-full bg-background border border-divider rounded-xl px-3 py-2 text-sm"
              value={scenario.teethCount}
              onChange={(e) => setScenario((s) => ({ ...s, teethCount: parseInt(e.target.value, 10) || 1 }))}
            />
            <label className="text-[9px] font-bold uppercase text-faint">Complejidad → liga {derivedLeague}</label>
            <select
              className="w-full bg-background border border-divider rounded-xl px-3 py-2 text-sm"
              value={scenario.caseComplexity}
              onChange={(e) => setScenario((s) => ({ ...s, caseComplexity: e.target.value as keyof typeof CASE_COMPLEXITY }))}
            >
              {Object.entries(CASE_COMPLEXITY).map(([k, v]) => (
                <option key={k} value={k}>{v as string}</option>
              ))}
            </select>
            <label className="text-[9px] font-bold uppercase text-faint">maxAssignmentAttempts</label>
            <input
              type="number"
              min={1}
              max={10}
              className="w-full bg-background border border-divider rounded-xl px-3 py-2 text-sm"
              value={scenario.maxAssignmentAttempts}
              onChange={(e) => setScenario((s) => ({ ...s, maxAssignmentAttempts: parseInt(e.target.value, 10) || 3 }))}
            />
          </div>

          <div className="space-y-4 pt-4 border-t border-divider">
            <Slider label="αQ" value={weights.alphaQuality} onChange={(e) => setWeights((w) => ({ ...w, alphaQuality: parseFloat(e.target.value) }))} min={0} max={0.5} />
            <Slider label="αP" value={weights.alphaPunctuality} onChange={(e) => setWeights((w) => ({ ...w, alphaPunctuality: parseFloat(e.target.value) }))} min={0} max={0.5} />
            <Slider label="αE" value={weights.alphaExperience} onChange={(e) => setWeights((w) => ({ ...w, alphaExperience: parseFloat(e.target.value) }))} min={0} max={0.5} />
            <Slider label="αL" value={weights.alphaLoad} onChange={(e) => setWeights((w) => ({ ...w, alphaLoad: parseFloat(e.target.value) }))} min={0} max={0.5} />
            <Slider label="αN" value={weights.alphaNoResponse} onChange={(e) => setWeights((w) => ({ ...w, alphaNoResponse: parseFloat(e.target.value) }))} min={0} max={0.5} />
            <p className={`text-[10px] font-bold ${weightsValid ? 'text-primary' : 'text-error'}`}>Σ α = {sumWeights.toFixed(3)}</p>
          </div>

          <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted">
            <input type="checkbox" checked={simulateRejectTop1} onChange={(e) => setSimulateRejectTop1(e.target.checked)} />
            Simular rechazo del #1
          </label>

          <Button onClick={runSimulation} disabled={!weightsValid || isPending} loading={isPending} icon={<Play className="w-4 h-4" />} className="w-full">
            Simular
          </Button>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase border transition-colors ${
                    activeTab === t.id ? 'bg-primary text-inverse border-primary' : 'bg-surface border-divider text-muted'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="p-6 rounded-[2rem] bg-surface/20 border border-divider min-h-[420px]">
            {!simulation ? (
              <p className="text-faint text-sm text-center py-20">Ejecutando simulación…</p>
            ) : activeTab === 'funnel' ? (
              <FunnelView funnel={funnel} preview={preview} poolEmpty={!!simulation.poolEmpty} />
            ) : activeTab === 'radar' ? (
              <RadarView weights={weights} />
            ) : activeTab === 'ranking' ? (
              <RankingView ranked={ranked} />
            ) : activeTab === 'heatmap' ? (
              <HeatmapView ranked={ranked} excluded={funnel?.excluded ?? {}} />
            ) : (
              <TimelineView preview={preview} simulateReject={simulateRejectTop1} tQuote={Number((simulation.config as { tQuoteMinutes?: number })?.tQuoteMinutes ?? 30)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelView({ funnel, preview, poolEmpty }: {
  funnel?: { universe: number; eligible: number; excluded: Record<string, number> };
  preview?: { retryChain: string[]; attemptsBudget: number };
  poolEmpty: boolean;
}) {
  if (!funnel) return null;
  const stages = [
    { label: 'Universo', count: funnel.universe },
    { label: 'Elegibles', count: funnel.eligible },
    { label: 'Asignado #1', count: poolEmpty ? 0 : 1 },
  ];
  return (
    <div className="space-y-6">
      {stages.map((s) => (
        <div key={s.label} className="space-y-1">
          <div className="flex justify-between text-[11px] font-bold uppercase text-muted">
            <span>{s.label}</span>
            <span>{s.count}</span>
          </div>
          <div className="h-6 bg-surface-2 rounded-lg overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max((s.count / Math.max(funnel.universe, 1)) * 100, 4)}%` }}
              className="h-full bg-primary rounded-lg"
            />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {Object.entries(funnel.excluded).filter(([, n]) => n > 0).map(([k, n]) => (
          <span key={k} className="text-[9px] font-bold px-2 py-1 rounded-full bg-error-hl text-error border border-error/30">
            {EXCLUSION_LABELS[k] ?? k}: {n}
          </span>
        ))}
      </div>
      {preview && (
        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          <RotateCcw className="w-3.5 h-3.5 text-primary" />
          Reintentos: {preview.retryChain.map((id, i) => (
            <span key={id} className="font-mono px-2 py-0.5 rounded bg-surface border border-divider">#{i + 1} {id.slice(0, 8)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function RadarView({ weights }: { weights: Record<string, number> }) {
  const axes = [
    { key: 'alphaQuality', label: 'Q' },
    { key: 'alphaPunctuality', label: 'P' },
    { key: 'alphaExperience', label: 'E' },
    { key: 'alphaLoad', label: 'L' },
    { key: 'alphaNoResponse', label: 'N' },
  ];
  const N = axes.length;
  const CX = 150, CY = 150, R = 100, maxVal = 0.5;
  const angle = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2;
  const toXY = (i: number, mag: number) => ({ x: CX + Math.cos(angle(i)) * R * mag, y: CY + Math.sin(angle(i)) * R * mag });
  const pts = axes.map((ax, i) => toXY(i, Math.min((weights[ax.key] ?? 0) / maxVal, 1)));
  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-md mx-auto">
      {pts.map((p, i) => {
        const o = toXY(i, 1);
        return <line key={i} x1={CX} y1={CY} x2={o.x} y2={o.y} stroke="var(--color-divider)" />;
      })}
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="var(--color-primary)" fillOpacity={0.2} stroke="var(--color-primary)" strokeWidth={2} />
      {axes.map((ax, i) => {
        const lp = toXY(i, 1.15);
        return <text key={ax.key} x={lp.x} y={lp.y} textAnchor="middle" fontSize={10} fill="var(--color-muted)">{ax.label}</text>;
      })}
    </svg>
  );
}

function RankingView({ ranked }: { ranked: Array<Record<string, unknown>> }) {
  const eligible = ranked.filter((r) => !r.excluded);
  return (
    <table className="w-full text-left text-[11px]">
      <thead>
        <tr className="text-[9px] uppercase text-faint border-b border-divider">
          <th className="py-2">#</th><th>Técnico</th><th>Score</th><th>Q/P/E/L/N</th>
        </tr>
      </thead>
      <tbody>
        {eligible.slice(0, 12).map((r) => (
          <tr key={r.technicianId as string} className={r.wouldAssign ? 'bg-primary/5' : ''}>
            <td className="py-2 font-mono">{r.rank as number}</td>
            <td>{r.fullName as string}</td>
            <td className="font-mono text-primary">{(r.score as number).toFixed(3)}</td>
            <td className="font-mono text-faint">
              {['Q', 'P', 'E', 'L', 'N'].map((k) => ((r.components as Record<string, number>)?.[k] ?? 0).toFixed(2)).join(' · ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HeatmapView({ ranked, excluded }: { ranked: Array<Record<string, unknown>>; excluded: Record<string, number> }) {
  const leagues = ['bronce', 'plata', 'oro', 'elite'];
  const reasons = Object.keys(EXCLUSION_LABELS);
  const matrix: Record<string, Record<string, number>> = {};
  for (const l of leagues) {
    matrix[l] = {};
    for (const r of reasons) matrix[l][r] = 0;
  }
  for (const row of ranked) {
    if (!row.excluded) continue;
    const league = String(row.leagueLevel ?? 'bronce').toLowerCase();
    const reason = String(row.exclusionReason ?? 'league_mismatch');
    if (matrix[league]) matrix[league][reason] = (matrix[league][reason] ?? 0) + 1;
  }
  const max = Math.max(1, ...leagues.flatMap((l) => reasons.map((r) => matrix[l][r] ?? 0)));
  return (
    <div className="overflow-x-auto">
      <table className="text-[9px]">
        <thead>
          <tr>
            <th className="p-1" />
            {reasons.map((r) => <th key={r} className="p-1 text-faint uppercase">{EXCLUSION_LABELS[r]}</th>)}
          </tr>
        </thead>
        <tbody>
          {leagues.map((l) => (
            <tr key={l}>
              <td className="p-1 font-bold uppercase text-muted">{l}</td>
              {reasons.map((r) => {
                const v = matrix[l][r] ?? 0;
                const intensity = v / max;
                return (
                  <td key={r} className="p-1">
                    <div
                      className="w-10 h-8 rounded flex items-center justify-center font-mono"
                      style={{ backgroundColor: `rgba(var(--color-primary-rgb, 45, 212, 191), ${intensity * 0.8})` }}
                    >
                      {v || ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-faint mt-4">Conteos de exclusión por liga × razón (datos del funnel).</p>
    </div>
  );
}

function TimelineView({ preview, simulateReject, tQuote }: { preview?: { retryChain: string[] }; simulateReject: boolean; tQuote: number }) {
  const steps = [
    'Publicar caso',
    'Clasificar (workType + liga)',
    'Rankear pool elegible',
    'Asignar técnico #1',
    simulateReject ? 'Rechazo → asignar #2' : 'Técnico acepta / inicia',
  ];
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={s} className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
          <div>
            <p className="text-sm font-bold text-foreground">{s}</p>
            {i === 3 && preview?.retryChain[0] && (
              <p className="text-[10px] font-mono text-faint mt-1">ID: {preview.retryChain[0].slice(0, 12)}… · plazo {tQuote} min</p>
            )}
            {i === 4 && simulateReject && preview?.retryChain[1] && (
              <p className="text-[10px] font-mono text-faint mt-1">Siguiente: {preview.retryChain[1].slice(0, 12)}…</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
