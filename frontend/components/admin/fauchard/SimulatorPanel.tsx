'use client';

import { useEffect, useMemo, useState } from 'react';
import { simulateFauchardAction } from '@/lib/db/actions/fauchard';
import { resolveListPriceAction } from '@/lib/db/actions/priceRules';
import type { CatalogOption } from '@/lib/db/actions/catalogs';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import {
  Play,
  Users,
  AlertCircle,
  FlaskConical,
  XCircle,
  Trophy,
  Info,
  Filter,
  SlidersHorizontal,
  RotateCcw,
  DollarSign,
  ChevronRight,
  ListFilter,
} from 'lucide-react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { motion } from 'framer-motion';
import { CASE_COMPLEXITY, type CaseComplexity } from '@/lib/constants/dental';
import { deriveScenarioFromInputs } from '@/lib/fauchard/assignmentScenario';
import { formatUchQuoteClp } from '@/lib/uchQuoteDisplay';
import Link from 'next/link';

const EXCLUSION_LABELS: Record<string, string> = {
  not_available: 'No disponible',
  suspended: 'Suspendido',
  inactive: 'Inactivo',
  league_mismatch: 'Liga no coincide',
  cooldown: 'En cooldown',
  insufficient_skill: 'Sin habilidad',
  availability_filter: 'Filtro disponibilidad',
  excluded_manually: 'Excluido manualmente',
};

const COMPLEXITY_OPTIONS = Object.values(CASE_COMPLEXITY) as CaseComplexity[];

interface SimulatorPanelProps {
  currentConfig: Record<string, unknown>;
  catalogOptions: {
    restorations: CatalogOption[];
    materials: CatalogOption[];
    shades: CatalogOption[];
    urgencies: CatalogOption[];
  };
}

type FormParams = {
  restorationCode: string;
  materialCode: string;
  shadeCode: string;
  urgencyLabel: string;
  teethCount: number;
  complexityMode: 'auto' | 'manual';
  caseComplexity: CaseComplexity;
  notesEstheticLength: number;
};

const PARAM_GROUPS: { group: string; items: { key: string; label: string; suffix?: string }[] }[] = [
  {
    group: 'Pesos del score (α)',
    items: [
      { key: 'alphaQuality', label: 'Q · Calidad' },
      { key: 'alphaPunctuality', label: 'P · Puntualidad' },
      { key: 'alphaExperience', label: 'E · Experiencia' },
      { key: 'alphaLoad', label: 'L · Carga (resta)' },
      { key: 'alphaNoResponse', label: 'N · No-respuesta (resta)' },
    ],
  },
  {
    group: 'Ventanas de medición',
    items: [
      { key: 'wQualityDays', label: 'Calidad', suffix: 'd' },
      { key: 'wLoadDays', label: 'Carga reciente', suffix: 'd' },
      { key: 'cMax', label: 'Tope de carga (cMax)' },
    ],
  },
  {
    group: 'Filtros de exclusión',
    items: [
      { key: 'tCooldownMinutes', label: 'Cooldown', suffix: 'min' },
      { key: 'dInactivityDays', label: 'Inactividad', suffix: 'd' },
    ],
  },
  {
    group: 'Asignación',
    items: [
      { key: 'maxAssignmentAttempts', label: 'Intentos máx.' },
      { key: 'tQuoteMinutes', label: 'Plazo respuesta', suffix: 'min' },
    ],
  },
];

export default function SimulatorPanel({ currentConfig, catalogOptions }: SimulatorPanelProps) {
  const { restorations, materials, shades, urgencies } = catalogOptions;
  const defaultRestorationCode = restorations[0]?.code ?? 'rest_001';

  const [params, setParams] = useState<FormParams>({
    restorationCode: defaultRestorationCode,
    materialCode: materials[0]?.code ?? '',
    shadeCode: shades[0]?.code ?? '',
    urgencyLabel: urgencies.find((u) => u.label === 'Normal')?.label ?? urgencies[0]?.label ?? 'Normal',
    teethCount: 1,
    complexityMode: 'auto',
    caseComplexity: CASE_COMPLEXITY.INTERMEDIO,
    notesEstheticLength: 0,
  });

  const [useOverride, setUseOverride] = useState(false);
  const [configOverride, setConfigOverride] = useState({
    alphaQuality: Number(currentConfig.alphaQuality),
    alphaPunctuality: Number(currentConfig.alphaPunctuality),
    alphaExperience: Number(currentConfig.alphaExperience),
    alphaLoad: Number(currentConfig.alphaLoad),
    alphaNoResponse: Number(currentConfig.alphaNoResponse ?? 0.25),
  });

  const [excludedTechIds, setExcludedTechIds] = useState<string[]>([]);
  const [chainOnlyFilter, setChainOnlyFilter] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [livePrice, setLivePrice] = useState<{
    cost: number | null;
    feePercent: number | null;
    salePrice: number | null;
    ruleCode: string | null;
    loading: boolean;
    checked: boolean;
  }>({ cost: null, feePercent: null, salePrice: null, ruleCode: null, loading: false, checked: false });

  const restorationLabel = useMemo(
    () => restorations.find((r) => r.code === params.restorationCode)?.label ?? '',
    [restorations, params.restorationCode],
  );

  const teeth = params.teethCount > 1
    ? Array.from({ length: params.teethCount }, (_, i) => i + 11)
    : [];

  const liveScenario = useMemo(() => {
    const complexityOverride = params.complexityMode === 'auto' ? undefined : params.caseComplexity;
    return deriveScenarioFromInputs(
      restorationLabel,
      teeth,
      complexityOverride,
      params.notesEstheticLength,
    );
  }, [params, teeth, restorationLabel]);

  useEffect(() => {
    const { restorationCode, materialCode, shadeCode, urgencyLabel } = params;
    if (!restorationCode || !materialCode || !shadeCode || !urgencyLabel) {
      setLivePrice({ cost: null, feePercent: null, salePrice: null, ruleCode: null, loading: false, checked: false });
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLivePrice((p) => ({ ...p, loading: true }));
      const res = await resolveListPriceAction({
        restorationType: restorationCode,
        material: materialCode,
        shade: shadeCode,
        urgency: urgencyLabel,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setLivePrice({
          cost: res.data.cost,
          feePercent: res.data.feePercent,
          salePrice: res.data.salePrice,
          ruleCode: res.data.ruleCode ?? null,
          loading: false,
          checked: true,
        });
      } else {
        setLivePrice({ cost: null, feePercent: null, salePrice: null, ruleCode: null, loading: false, checked: true });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params.restorationCode, params.materialCode, params.shadeCode, params.urgencyLabel]);

  const handleSimulate = async (extraExclude?: string[]) => {
    setLoading(true);
    const excludeIds = extraExclude ?? excludedTechIds;

    const res = await simulateFauchardAction({
      restorationType: restorationLabel,
      restorationCode: params.restorationCode,
      complexityMode: params.complexityMode,
      caseComplexity: params.complexityMode === 'manual' ? params.caseComplexity : undefined,
      teeth,
      notesEstheticLength: params.notesEstheticLength,
      materialCode: params.materialCode,
      shadeCode: params.shadeCode,
      urgencyLabel: params.urgencyLabel,
      excludeTechnicianIds: excludeIds,
      configOverride: useOverride ? configOverride : undefined,
    });
    if (res.success) {
      setResult(res.simulation);
      if (extraExclude) setExcludedTechIds(extraExclude);
    }
    setLoading(false);
  };

  const handleSimulateReject = async () => {
    const current = result?.assignmentPreview.selectedTechnicianId;
    if (!current) return;
    const nextExclude = [...excludedTechIds, current];
    await handleSimulate(nextExclude);
  };

  const handleResetRejects = () => {
    setExcludedTechIds([]);
    handleSimulate([]);
  };

  const handleOverrideChange = (key: string, val: number) => {
    setConfigOverride((prev) => ({ ...prev, [key]: val }));
  };

  const sumOverride = Object.values(configOverride).reduce((a, b) => a + b, 0);
  const isSumValid = Math.abs(sumOverride - 1.0) < 0.001;

  const displayRanked = useMemo(() => {
    if (!result) return [];
    if (!chainOnlyFilter) return result.ranked;
    const maxPos = result.assignmentPreview.attemptsBudget;
    return result.ranked.filter(
      (r) => r.excluded || (r.chainPosition != null && r.chainPosition <= maxPos),
    );
  }, [result, chainOnlyFilter]);

  const selectClass =
    'w-full bg-background border border-divider rounded-2xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/30';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
      <div className="lg:col-span-4 space-y-8">
        {/* Bloque A — Precio */}
        <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Datos de precio</h3>
          </div>

          <div className="space-y-4">
            <Field label="Restauración">
              <select
                className={selectClass}
                value={params.restorationCode}
                onChange={(e) => setParams((p) => ({ ...p, restorationCode: e.target.value }))}
              >
                {restorations.map((opt) => (
                  <option key={opt.id} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Material">
              <select
                className={selectClass}
                value={params.materialCode}
                onChange={(e) => setParams((p) => ({ ...p, materialCode: e.target.value }))}
              >
                {materials.map((opt) => (
                  <option key={opt.id} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Shade VITA">
              <select
                className={selectClass}
                value={params.shadeCode}
                onChange={(e) => setParams((p) => ({ ...p, shadeCode: e.target.value }))}
              >
                {shades.map((opt) => (
                  <option key={opt.id} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Urgencia">
              <select
                className={selectClass}
                value={params.urgencyLabel}
                onChange={(e) => setParams((p) => ({ ...p, urgencyLabel: e.target.value }))}
              >
                {urgencies.map((opt) => (
                  <option key={opt.id} value={opt.label}>{opt.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className={`p-4 rounded-2xl border text-sm ${livePrice.salePrice != null ? 'bg-primary/5 border-primary/20' : 'bg-surface border-divider'}`}>
            {livePrice.loading ? (
              <span className="text-faint text-xs">Resolviendo precio…</span>
            ) : livePrice.salePrice != null ? (
              <div className="space-y-2">
                {livePrice.ruleCode && (
                  <div className="flex justify-between">
                    <span className="text-[10px] font-bold uppercase text-faint">Regla</span>
                    <span className="font-mono text-xs text-primary font-bold">{livePrice.ruleCode}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold uppercase text-faint">Compensación técnico</span>
                  <span className="font-mono font-bold text-foreground">{formatUchQuoteClp(livePrice.cost!)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold uppercase text-faint">Fee plataforma</span>
                  <span className="font-mono text-muted">{((livePrice.feePercent ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between border-t border-divider pt-2">
                  <span className="text-[10px] font-bold uppercase text-primary">Precio dentista</span>
                  <span className="font-mono font-black text-primary">{formatUchQuoteClp(livePrice.salePrice)}</span>
                </div>
              </div>
            ) : livePrice.checked ? (
              <div className="space-y-2">
                <p className="text-xs text-error font-medium">Sin regla de precio para esta combinación.</p>
                <Link href="/dashboard/admin/prices" className="text-[10px] font-bold uppercase text-primary hover:underline">
                  Admin → Precios
                </Link>
              </div>
            ) : (
              <span className="text-faint text-xs">Completa las 4 dimensiones para ver el precio.</span>
            )}
          </div>
        </div>

        {/* Bloque B — Asignación */}
        <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Datos de asignación</h3>
          </div>

          <div className="space-y-4">
            <Field label="Piezas (cantidad)">
              <input
                type="number"
                min={1}
                max={32}
                className={selectClass}
                value={params.teethCount}
                onChange={(e) => setParams((p) => ({ ...p, teethCount: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
              />
            </Field>

            <Field label="Complejidad">
              <div className="flex gap-2 mb-2">
                {(['auto', 'manual'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setParams((p) => ({ ...p, complexityMode: mode }))}
                    className={`flex-1 text-[10px] font-bold uppercase py-2 rounded-xl border transition-colors ${
                      params.complexityMode === mode
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-surface border-divider text-muted'
                    }`}
                  >
                    {mode === 'auto' ? 'Auto' : 'Manual'}
                  </button>
                ))}
              </div>
              {params.complexityMode === 'manual' && (
                <select
                  className={selectClass}
                  value={params.caseComplexity}
                  onChange={(e) => setParams((p) => ({ ...p, caseComplexity: e.target.value as CaseComplexity }))}
                >
                  {COMPLEXITY_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              )}
            </Field>

            <Field label={`Notas estéticas simuladas (${params.notesEstheticLength} chars)`}>
              <Slider
                label=""
                value={params.notesEstheticLength}
                onChange={(e) => setParams((p) => ({ ...p, notesEstheticLength: parseInt(e.target.value, 10) }))}
                min={0}
                max={200}
              />
              <p className="text-[9px] text-faint mt-1">&gt;100 chars fuerza complejidad crítica (guía quirúrgica también).</p>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge label="workType" value={liveScenario.workType} />
            <Badge label="liga" value={liveScenario.caseLeague} />
            <Badge label="categoría" value={liveScenario.category} />
            <Badge label="complejidad" value={liveScenario.caseComplexity} />
          </div>

          <div className="pt-4 border-t border-divider space-y-6">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Override α (sandbox)</label>
              <button
                type="button"
                onClick={() => setUseOverride(!useOverride)}
                className={`relative w-10 h-5 rounded-full transition-colors ${useOverride ? 'bg-primary' : 'bg-surface-2'}`}
              >
                <motion.div animate={{ x: useOverride ? 22 : 2 }} className="w-4 h-4 bg-white rounded-full shadow-sm mt-0.5" />
              </button>
            </div>

            {useOverride && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                <Slider label="Q: Calidad" value={configOverride.alphaQuality} onChange={(e) => handleOverrideChange('alphaQuality', parseFloat(e.target.value))} min={0} max={0.5} />
                <Slider label="P: Puntualidad" value={configOverride.alphaPunctuality} onChange={(e) => handleOverrideChange('alphaPunctuality', parseFloat(e.target.value))} min={0} max={0.5} />
                <Slider label="E: Experiencia" value={configOverride.alphaExperience} onChange={(e) => handleOverrideChange('alphaExperience', parseFloat(e.target.value))} min={0} max={0.5} />
                <Slider label="L: Carga" value={configOverride.alphaLoad} onChange={(e) => handleOverrideChange('alphaLoad', parseFloat(e.target.value))} min={0} max={0.5} />
                <Slider label="N: No-respuesta" value={configOverride.alphaNoResponse} onChange={(e) => handleOverrideChange('alphaNoResponse', parseFloat(e.target.value))} min={0} max={0.5} />
                <div className={`text-[10px] font-bold p-3 rounded-xl border ${isSumValid ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-error-hl border-error/30 text-error'}`}>
                  Suma α: {sumOverride.toFixed(3)} {isSumValid ? '✓' : ' (Debe ser 1.0)'}
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={() => { setExcludedTechIds([]); handleSimulate([]); }}
            disabled={loading || (useOverride && !isSumValid)}
            loading={loading}
            className="w-full py-4 rounded-2xl"
            icon={<Play className="w-4 h-4" />}
          >
            Simular asignación
          </Button>
        </div>

        <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider shadow-xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <SlidersHorizontal className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Parámetros activos</h3>
            </div>
            <Link href="/dashboard/admin/fauchard" className="text-[9px] font-bold uppercase text-primary hover:underline">
              Editar →
            </Link>
          </div>
          <div className="space-y-5">
            {PARAM_GROUPS.map((g) => (
              <div key={g.group} className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-wider text-faint px-1">{g.group}</span>
                <div className="grid grid-cols-1 gap-1">
                  {g.items.map((it) => {
                    const raw = currentConfig?.[it.key];
                    const val = raw === undefined || raw === null ? '—' : `${raw}${it.suffix ? ` ${it.suffix}` : ''}`;
                    return (
                      <div key={it.key} className="flex items-center justify-between text-[11px] px-2 py-1 rounded-lg hover:bg-white/[0.04] transition-colors">
                        <span className="text-muted">{it.label}</span>
                        <span className="font-mono font-bold text-foreground">{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-8 space-y-6">
        {!result ? (
          <div className="h-full flex flex-col items-center justify-center p-20 border-2 border-dashed border-divider rounded-[3rem] text-center gap-4">
            <div className="w-20 h-20 rounded-[2.5rem] bg-surface flex items-center justify-center text-faint">
              <FlaskConical className="w-10 h-10" />
            </div>
            <div className="max-w-sm">
              <h4 className="text-foreground font-bold mb-1">Listo para simular</h4>
              <p className="text-faint text-sm">
                Define precio y escenario de asignación, luego presiona &quot;Simular asignación&quot;.
              </p>
            </div>
          </div>
        ) : result.poolEmpty ? (
          <div className="p-12 rounded-[2.5rem] border border-error/30 bg-error-hl text-center space-y-3">
            <XCircle className="w-10 h-10 text-error mx-auto" />
            <h4 className="text-lg font-black text-foreground">Pool vacío</h4>
            <p className="text-sm text-muted">Ningún técnico pasó los filtros duros. En producción el caso iría a fallo o cola pendiente.</p>
            {result.pricePreview && !result.pricePreview.resolved && (
              <p className="text-xs text-warning">Además, no hay regla de precio — el caso no sería publicable.</p>
            )}
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            {result.pricePreview && (
              <PriceResultCard preview={result.pricePreview} />
            )}

            <div className="flex flex-wrap gap-2">
              <Badge label="workType" value={result.scenario.workType} />
              <Badge label="liga" value={result.scenario.caseLeague} />
              <Badge label="categoría" value={result.scenario.category} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard icon={Users} label="Universo" value={String(result.funnel.universe)} />
              <StatCard icon={Filter} label="Elegibles" value={String(result.funnel.eligible)} />
              <StatCard
                icon={Trophy}
                label="Asignado"
                value={result.assignmentPreview.retryChainDetails[0]?.fullName?.split(' ')[0] ?? '—'}
                highlight
              />
            </div>

            <div className="rounded-[2.5rem] border border-divider bg-surface/20 p-8 space-y-4">
              <div className="flex items-center gap-3">
                <Filter className="w-5 h-5 text-primary" />
                <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Embudo de filtros</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.funnel.excluded)
                  .filter(([, n]) => n > 0)
                  .map(([key, count]) => (
                    <span key={key} className="text-[10px] font-bold px-3 py-1 rounded-full bg-error-hl border border-error/30 text-error flex items-center gap-1.5">
                      <XCircle className="w-3 h-3" /> {EXCLUSION_LABELS[key] ?? key}: {count}
                    </span>
                  ))}
              </div>
            </div>

            {/* Cadena de asignación */}
            <div className="rounded-[2.5rem] border border-divider bg-surface/20 p-6 space-y-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <span className="text-[9px] font-black uppercase text-primary/60 block">Cadena de asignación</span>
                  <p className="text-sm text-foreground font-medium">
                    Plazo {result.config.tQuoteMinutes} min · hasta {result.assignmentPreview.attemptsBudget} intentos
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {excludedTechIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetRejects}
                      className="text-[10px] font-bold uppercase text-muted hover:text-foreground px-3 py-1.5 rounded-lg border border-divider"
                    >
                      Reiniciar rechazos ({excludedTechIds.length})
                    </button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleSimulateReject}
                    disabled={loading || !result.assignmentPreview.selectedTechnicianId}
                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                  >
                    Simular rechazo del asignado
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {result.assignmentPreview.retryChainDetails.map((entry) => (
                  <ChainCard
                    key={entry.technicianId}
                    entry={entry}
                    compensation={result.pricePreview?.cost}
                  />
                ))}
                {result.assignmentPreview.retryChainDetails.length < result.assignmentPreview.attemptsBudget && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-divider text-faint text-[10px] font-bold uppercase">
                    Cadena incompleta — solo {result.assignmentPreview.retryChainDetails.length} elegible(s)
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Ranking Q/P/E/L/N</h4>
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted cursor-pointer">
                <ListFilter className="w-3.5 h-3.5" />
                <input
                  type="checkbox"
                  checked={chainOnlyFilter}
                  onChange={(e) => setChainOnlyFilter(e.target.checked)}
                  className="rounded"
                />
                Solo cadena de asignación
              </label>
            </div>

            <div className="rounded-[2.5rem] border border-divider bg-surface/20 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface border-b border-divider text-[9px] font-bold uppercase tracking-wider text-faint">
                    <th className="px-6 py-5">#</th>
                    <th className="px-6 py-5">Técnico</th>
                    <th className="px-6 py-5">Score</th>
                    <th className="px-6 py-5">Q/P/E/L/N</th>
                    <th className="px-6 py-5">Carga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {displayRanked.map((d) => (
                    <RankingRow key={d.technicianId} row={d} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 rounded-3xl bg-surface border border-divider flex gap-4">
              <Info className="w-5 h-5 text-faint shrink-0" />
              <p className="text-[11px] text-faint leading-relaxed">
                El técnico #1 (verde) recibe la asignación. Si rechaza o vence el plazo, Fauchard intenta con el respaldo #2, #3, etc. hasta agotar los intentos configurados.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[9px] font-bold uppercase tracking-wider text-faint px-1">{label}</label>
      {children}
    </div>
  );
}

function ChainCard({
  entry,
  compensation,
}: {
  entry: SimulationResult['assignmentPreview']['retryChainDetails'][number];
  compensation?: number;
}) {
  const isWinner = entry.position === 1;
  const isBackup = entry.position > 1;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border min-w-[200px] ${
        isWinner
          ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
          : isBackup
            ? 'bg-amber-500/10 border-amber-500/40'
            : 'bg-surface border-divider'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          isWinner ? 'bg-emerald-500 text-white' : 'bg-amber-500/20 text-amber-600'
        }`}
      >
        {isWinner ? <Trophy className="w-4 h-4" /> : <span className="text-xs font-black">#{entry.position}</span>}
      </div>
      <div className="min-w-0">
        <span className={`text-[8px] font-black uppercase block ${isWinner ? 'text-emerald-600' : 'text-amber-600'}`}>
          {isWinner ? 'Asignado' : `Respaldo #${entry.position}`}
        </span>
        <span className="text-[11px] font-bold text-foreground truncate block">{entry.fullName}</span>
        <span className="text-[9px] text-faint">
          {entry.leagueLevel} · score {entry.score.toFixed(3)}
          {compensation != null && ` · ${formatUchQuoteClp(compensation)}`}
        </span>
      </div>
      {isBackup && <ChevronRight className="w-4 h-4 text-amber-500/50 shrink-0" />}
    </div>
  );
}

function RankingRow({ row }: { row: SimulationResult['ranked'][number] }) {
  const chainPos = row.chainPosition;
  const isWinner = chainPos === 1;
  const isBackup = chainPos != null && chainPos > 1;

  let rowClass = 'hover:bg-surface-2/30';
  if (row.excluded) rowClass = 'opacity-40';
  else if (isWinner) rowClass = 'bg-emerald-500/5 border-l-4 border-l-emerald-500';
  else if (isBackup) rowClass = 'bg-amber-500/5 border-l-4 border-l-amber-500/60';

  return (
    <tr className={`transition-colors ${rowClass}`}>
      <td className="px-6 py-4 text-xs font-mono font-bold text-muted">{row.rank}</td>
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-[11px] font-bold text-foreground">{row.fullName}</span>
          <span className="text-[9px] font-bold uppercase text-faint">{row.leagueLevel}</span>
          {row.excluded && (
            <span className="text-[8px] font-black uppercase text-error mt-1 flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" /> {EXCLUSION_LABELS[row.exclusionReason ?? ''] ?? row.exclusionReason}
            </span>
          )}
          {isWinner && (
            <span className="text-[8px] font-black uppercase text-emerald-600 mt-1 flex items-center gap-1">
              <Trophy className="w-2.5 h-2.5" /> Asignado
            </span>
          )}
          {isBackup && (
            <span className="text-[8px] font-black uppercase text-amber-600 mt-1">Respaldo #{chainPos}</span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-xs font-mono font-bold text-primary">{row.score.toFixed(3)}</span>
      </td>
      <td className="px-6 py-4">
        <div className="flex gap-1.5">
          {(['Q', 'P', 'E', 'L', 'N'] as const).map((k) => (
            <div key={k} className="flex flex-col items-center">
              <span className="text-[7px] font-black text-faint">{k}</span>
              <span className="text-[9px] font-mono text-muted">{row.components[k].toFixed(2)}</span>
            </div>
          ))}
        </div>
      </td>
      <td className="px-6 py-4 text-[10px] font-mono text-muted">{row.activeLoad}</td>
    </tr>
  );
}

function PriceResultCard({ preview }: { preview: SimulationResult['pricePreview'] }) {
  if (!preview) return null;
  if (!preview.resolved) {
    return (
      <div className="p-4 rounded-2xl border border-warning/30 bg-warning-hl text-sm flex items-center justify-between gap-4 flex-wrap">
        <span className="text-warning text-xs font-medium">
          Sin regla de precio — el caso no sería publicable en producción.
        </span>
        <Link href="/dashboard/admin/prices" className="text-[10px] font-bold uppercase text-primary hover:underline">
          Admin → Precios
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {preview.ruleCode && (
        <span className="inline-flex text-[10px] font-bold uppercase px-3 py-1 rounded-full bg-surface border border-divider text-muted">
          Regla: <span className="text-primary font-mono ml-1">{preview.ruleCode}</span>
        </span>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={DollarSign} label="Compensación técnico" value={formatUchQuoteClp(preview.cost!)} />
        <StatCard icon={DollarSign} label="Fee plataforma" value={`${((preview.feePercent ?? 0) * 100).toFixed(0)}%`} />
        <StatCard icon={DollarSign} label="Precio dentista" value={formatUchQuoteClp(preview.salePrice!)} highlight />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, highlight }: { icon: typeof Users; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-6 rounded-3xl border flex items-center gap-4 ${highlight ? 'bg-primary/5 border-primary/30' : 'bg-surface/40 border-divider'}`}>
      <Icon className={`w-6 h-6 ${highlight ? 'text-primary' : 'text-muted'}`} />
      <div>
        <span className="text-[9px] font-black uppercase text-faint block">{label}</span>
        <span className="text-xl font-black text-foreground">{value}</span>
      </div>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[10px] font-bold uppercase px-3 py-1 rounded-full bg-surface border border-divider text-muted">
      {label}: <span className="text-foreground">{value}</span>
    </span>
  );
}
