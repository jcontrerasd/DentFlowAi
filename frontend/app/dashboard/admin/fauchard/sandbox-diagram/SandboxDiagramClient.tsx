'use client';

import { useState, useEffect, useTransition } from 'react';
import { simulateFauchardAction } from '@/lib/db/actions/fauchard';
import { 
  Play, 
  Settings2, 
  Users, 
  AlertCircle,
  FlaskConical,
  Info,
  Activity,
  Gauge,
  HelpCircle,
  Percent,
  Clock,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  RefreshCcw,
  Volume2
} from 'lucide-react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { CASE_COMPLEXITY, SERVICE_TYPES, WORK_TYPES, WORK_TYPE_LABELS } from '@/lib/constants/dental';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';

// Tipos locales
interface SandboxDiagramClientProps {
  initialConfig: any;
}

type SelectedParamInfo = {
  key: string;
  label: string;
  symbol: string;
  description: string;
  example: string;
};

// Ayuda y explicaciones de negocio para los tooltips interactivos (Espina de Pescado)
const PARAMETER_HELP_MAP: Record<string, { label: string; symbol: string; description: string; example: string }> = {
  alphaQuality: {
    label: 'Calidad Histórica (αQ)',
    symbol: 'αQ',
    description: 'Prioriza a los técnicos con mejores calificaciones en trabajos anteriores de la misma dimensión.',
    example: 'Si αQ = 0.40, la reputación manda. Lab Andes (4.8⭐) será invitado mucho antes que Lab Roble (4.0⭐) aunque Roble tenga menos carga.'
  },
  alphaPunctuality: {
    label: 'Puntualidad (αP)',
    symbol: 'αP',
    description: 'Favorece a los laboratorios que entregan consistentemente dentro del plazo prometido en la cotización.',
    example: 'Si αP = 0.30 y un técnico suele retrasarse (70% puntualidad), su score caerá notablemente en casos urgentes.'
  },
  alphaExperience: {
    label: 'Experiencia Especializada (αE)',
    symbol: 'αE',
    description: 'Prioriza a técnicos que declararon y demostraron mayor nivel de habilidad en el tipo de trabajo específico.',
    example: 'Para una Guía Quirúrgica, un especialista de nivel 7/7 superará fácilmente a un laboratorio generalista si αE está alto.'
  },
  alphaLoad: {
    label: 'Penalización por Carga (αC)',
    symbol: 'αC',
    description: 'Resta score a técnicos saturados con muchos casos activos para evitar cuellos de botella en el marketplace.',
    example: 'Si αC = 0.20, un laboratorio excelente pero con 8 casos activos cederá el turno a otro libre con menor carga.'
  },
  alphaBonus: {
    label: 'Bono de Infrautilización (αB)',
    symbol: 'αB',
    description: 'Incrementa temporalmente el score de técnicos que llevan días sin recibir invitaciones para mantener activo todo el pool.',
    example: 'Un Lab nuevo que lleva 3 semanas sin casos recibirá un impulso temporal para ingresar a la ronda si αB está alto.'
  },
  alphaNoResponse: {
    label: 'Penalización por No-respuesta (αN)',
    symbol: 'αN',
    description: 'Resta score al técnico que ignora invitaciones repetidamente. El castigo escala según su nivel de sanción acumulada.',
    example: 'Si αN = 0.25 y Lab Pino ignoró 2 invitaciones recientes (Nivel 2 de sanción), su score caerá dramáticamente.'
  },
  dInactivityDays: {
    label: 'Inactividad Máxima',
    symbol: 'dInactivityDays',
    description: 'Excluye del pool a técnicos que no han iniciado sesión ni registrado actividad en los últimos N días.',
    example: 'Si se calibra en 15 días y un laboratorio no entra hace 2 semanas, Fauchard no le enviará casos para no arriesgar plazos.'
  },
  tCooldownMinutes: {
    label: 'Cooldown de Invitaciones',
    symbol: 'tCooldownMinutes',
    description: 'Tiempo mínimo en minutos que un técnico queda excluido de recibir invitaciones tras ignorar o rechazar un caso.',
    example: 'Con 120 minutos, si Lab Pino deja vencer un plazo, queda temporalmente inhabilitado dando oportunidad a otros competidores.'
  },
  platformFee: {
    label: 'Margen de Plataforma',
    symbol: 'platformFee',
    description: 'Comisión porcentual que se agrega sobre el precio neto cotizado por el técnico para mostrar el precio final al dentista.',
    example: 'Si el margen es del 15% y el laboratorio cotiza $100.000, el comparativo del dentista mostrará $115.000.'
  },
  tQuoteMinutes: {
    label: 'Tiempo para Cotizar',
    symbol: 'tQuoteMinutes',
    description: 'Plazo límite que tienen los técnicos invitados en la Etapa 1 para cotizar antes de que la invitación expire.',
    example: 'Con 90 minutos, la ronda se cierra rápido para dar respuesta al dentista, pero laboratorios ocupados podrían quedar fuera.'
  },
  tProposalHours: {
    label: 'Validez de la Propuesta',
    symbol: 'tProposalHours',
    description: 'Tiempo que tiene el dentista en la Etapa 2 para aceptar una de las propuestas comparativas antes de que expiren.',
    example: 'Con 2 horas, el dentista debe tomar una decisión rápida desde que el comparativo queda listo, acelerando la transacción.'
  },
  tDentistReviewHours: {
    label: 'Plazo de Revisión del Dentista',
    symbol: 'tDentistReviewHours',
    description: 'Horas disponibles para que el dentista apruebe o pida cambios sobre los diseños entregados por el laboratorio.',
    example: 'Con 48 horas, si el dentista no responde a tiempo, el caso escala o se marca con atraso pero no se cierra de golpe.'
  }
};

export default function SandboxDiagramClient({ initialConfig }: SandboxDiagramClientProps) {
  const [params, setParams] = useState({
    // Pesos (Score)
    alphaQuality: Number(initialConfig.alphaQuality),
    alphaPunctuality: Number(initialConfig.alphaPunctuality),
    alphaExperience: Number(initialConfig.alphaExperience),
    alphaLoad: Number(initialConfig.alphaLoad),
    alphaBonus: Number(initialConfig.alphaBonus),
    alphaNoResponse: Number(initialConfig.alphaNoResponse ?? 0.250),
    // Exclusiones y tiempos
    dInactivityDays: Number(initialConfig.dInactivityDays),
    tCooldownMinutes: Number(initialConfig.tCooldownMinutes),
    platformFee: Number(initialConfig.platformFee),
    tQuoteMinutes: Number(initialConfig.tQuoteMinutes),
    tProposalHours: Number(initialConfig.tProposalHours),
    tDentistReviewHours: Number(initialConfig.tDentistReviewHours ?? 48),
    tNoEligiblePoolHours: Number(initialConfig.tNoEligiblePoolHours ?? 24),
    maxPoolCycles: Number(initialConfig.maxPoolCycles ?? 2),
    replacementCutoffMinutes: Number(initialConfig.replacementCutoffMinutes ?? 10),
  });

  const [scenario, setScenario] = useState({
    restorationType: 'corona_posterior',
    caseComplexity: 'INTERMEDIO',
    serviceType: SERVICE_TYPES.SOLO_DISENO,
  });

  const [autoBalance, setAutoBalance] = useState(true);
  const [activeTab, setActiveTab] = useState<'ishikawa' | 'funnel' | 'radar' | 'heatmap' | 'timeline' | 'stackedScore'>('ishikawa');
  const [selectedParam, setSelectedParam] = useState<SelectedParamInfo | null>({
    key: 'alphaQuality',
    ...PARAMETER_HELP_MAP.alphaQuality
  });
  
  const [simulation, setSimulation] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Aritmética de balanceo proporcional para pesos
  const handleWeightChange = (key: string, value: number) => {
    if (!autoBalance) {
      setParams(prev => ({ ...prev, [key]: value }));
      return;
    }

    const weightKeys = ['alphaQuality', 'alphaPunctuality', 'alphaExperience', 'alphaLoad', 'alphaBonus', 'alphaNoResponse'];
    const otherKeys = weightKeys.filter(k => k !== key);
    const remaining = 1.0 - value;

    if (value >= 1.0) {
      setParams(prev => {
        const next = { ...prev };
        next[key as keyof typeof prev] = 1.0;
        otherKeys.forEach(ok => { (next as any)[ok] = 0; });
        return next;
      });
      return;
    }

    const otherSum = otherKeys.reduce((sum, ok) => sum + (params[ok as keyof typeof params] as number), 0);

    setParams(prev => {
      const next = { ...prev };
      next[key as keyof typeof prev] = value;

      if (otherSum > 0.001) {
        otherKeys.forEach(ok => {
          (next as any)[ok] = parseFloat((((prev[ok as keyof typeof prev] as number) / otherSum) * remaining).toFixed(3));
        });
      } else {
        otherKeys.forEach(ok => {
          (next as any)[ok] = parseFloat((remaining / otherKeys.length).toFixed(3));
        });
      }

      // Cuadre de precisión flotante
      const total = weightKeys.reduce((sum, wk) => sum + (next as any)[wk], 0);
      const diff = 1.0 - total;
      if (Math.abs(diff) > 0.0001) {
        const targetKey = otherKeys.find(ok => (next as any)[ok] > 0) || otherKeys[0];
        (next as any)[targetKey] = parseFloat(((next as any)[targetKey] + diff).toFixed(3));
      }

      return next;
    });
  };

  const handleExclusionChange = (key: string, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // Cálculo de Suma de Pesos
  const sumWeights = params.alphaQuality + params.alphaPunctuality + params.alphaExperience + params.alphaLoad + params.alphaBonus + params.alphaNoResponse;
  const isWeightsSumValid = Math.abs(sumWeights - 1.0) < 0.001;

  // Lógica de simulación debounced / reactiva
  useEffect(() => {
    const timer = setTimeout(() => {
      if (autoBalance || isWeightsSumValid) {
        runSimulation();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [params, scenario]);

  const runSimulation = () => {
    startTransition(async () => {
      setErrorMessage(null);
      try {
        const res = await simulateFauchardAction({
          ...scenario,
          configOverride: params,
        });
        if (res.success) {
          setSimulation(res.simulation);
        } else {
          setErrorMessage(res.error || 'Fallo en la simulación.');
        }
      } catch (error) {
        setErrorMessage('Error al invocar la simulación remota.');
      }
    });
  };

  // Metadatos calculados conceptualmente para la salud (Cabeza del Pescado)
  const calcHealthIndicators = () => {
    const qualityFocus = Math.min(100, Math.round(((params.alphaQuality + params.alphaExperience) / 0.8) * 100));
    const equityScore = Math.min(100, Math.round(((params.alphaLoad + params.alphaBonus) / 0.7) * 100));
    
    // El riesgo de pool vacío aumenta si cooldown es muy alto, inactividad muy baja, o penalización por no-respuestas muy alta.
    const cooldownFactor = params.tCooldownMinutes / 1440;
    const inactivityFactor = Math.max(0, (15 - params.dInactivityDays) / 14);
    const noRespFactor = params.alphaNoResponse;
    const emptyPoolRisk = Math.min(100, Math.round((cooldownFactor * 30 + inactivityFactor * 40 + noRespFactor * 30)));

    // La velocidad comercial disminuye a mayores plazos de cotización y aceptación
    const speedFactor = Math.max(0, 100 - (params.tQuoteMinutes / 180) * 40 - (params.tProposalHours / 24) * 30);
    const agilityScore = Math.round(speedFactor);

    return { qualityFocus, equityScore, emptyPoolRisk, agilityScore };
  };

  const health = calcHealthIndicators();

  // Función para seleccionar parámetro en la Espina de Pescado
  const selectParam = (key: string) => {
    const help = PARAMETER_HELP_MAP[key];
    if (help) {
      setSelectedParam({ key, ...help });
    }
  };

  // Contadores para el embudo (con datos reales o mock inteligente basado en pool elegible)
  const getFunnelSteps = () => {
    if (!simulation) return [];
    const total = simulation.distribution?.length || 10;
    const excludedList = simulation.distribution?.filter((d: any) => d.excluded) || [];
    
    const excludedByLeague = excludedList.filter((d: any) => d.exclusionReason?.toLowerCase().includes('liga') || d.exclusionReason?.toLowerCase().includes('habilidad')).length;
    const excludedByInactivity = excludedList.filter((d: any) => d.exclusionReason?.toLowerCase().includes('inactiv') || d.exclusionReason?.toLowerCase().includes('login')).length;
    const excludedByCooldown = excludedList.filter((d: any) => d.exclusionReason?.toLowerCase().includes('cooldown')).length;
    const excludedByAvailable = excludedList.filter((d: any) => d.exclusionReason?.toLowerCase().includes('dispon') || d.exclusionReason?.toLowerCase().includes('suspendido')).length;
    
    const afterLeague = total - excludedByLeague;
    const afterInactivity = afterLeague - excludedByInactivity;
    const afterCooldown = afterInactivity - excludedByCooldown;
    const afterAvailable = afterCooldown - excludedByAvailable;
    const finalEligible = simulation.eligiblePool;

    return [
      { name: 'Pool Inicial (Técnicos Registrados)', count: total, loss: 0 },
      { name: 'Filtro de Liga y Complejidad', count: afterLeague, loss: excludedByLeague, param: 'league' },
      { name: 'Filtro de Inactividad Reciente', count: afterInactivity, loss: excludedByInactivity, param: 'dInactivityDays' },
      { name: 'Filtro de Cooldown de Casos', count: afterCooldown, loss: excludedByCooldown, param: 'tCooldownMinutes' },
      { name: 'Disponibilidad Declarada (AND Triple)', count: finalEligible, loss: afterAvailable - finalEligible, param: 'availability' },
    ];
  };

  const funnelSteps = getFunnelSteps();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
      
      {/* 1. Panel de Sliders / Sandbox (col-span-4) */}
      <div className="lg:col-span-4 space-y-8">
        <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider shadow-xl space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FlaskConical className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Sandbox de Parámetros</h3>
            </div>
            {isPending && <RefreshCcw className="w-4 h-4 text-primary animate-spin" />}
          </div>

          {/* Scenario Selector */}
          <div className="space-y-4 p-4 bg-surface-2 rounded-2xl border border-divider">
            <h4 className="text-[10px] font-black text-primary uppercase tracking-wider mb-2">Escenario de Prueba</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[8px] font-bold text-faint uppercase">Trabajo</label>
                <select 
                  className="w-full bg-background border border-divider rounded-xl px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/30"
                  value={scenario.restorationType}
                  onChange={(e) => setScenario(prev => ({ ...prev, restorationType: e.target.value }))}
                >
                  {WORK_TYPES.map((type) => (
                    <option key={type} value={type}>{WORK_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-bold text-faint uppercase">Complejidad</label>
                <select 
                  className="w-full bg-background border border-divider rounded-xl px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/30"
                  value={scenario.caseComplexity}
                  onChange={(e) => setScenario(prev => ({ ...prev, caseComplexity: e.target.value }))}
                >
                  {Object.entries(CASE_COMPLEXITY).map(([k, v]) => (
                    <option key={k} value={k}>{v as string}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Configuración de Pesos (alpha) */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black text-muted uppercase tracking-wider">A) Pesos de Score (α)</h4>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-primary cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={autoBalance}
                  onChange={(e) => setAutoBalance(e.target.checked)}
                  className="rounded border-divider text-primary focus:ring-primary/30"
                />
                Auto-balancear
              </label>
            </div>

            <div className="space-y-5">
              <div onClick={() => selectParam('alphaQuality')} className="cursor-pointer group">
                <Slider label="Calidad Histórica (αQ)" value={params.alphaQuality} onChange={(e) => handleWeightChange('alphaQuality', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} />
              </div>
              <div onClick={() => selectParam('alphaPunctuality')} className="cursor-pointer group">
                <Slider label="Puntualidad (αP)" value={params.alphaPunctuality} onChange={(e) => handleWeightChange('alphaPunctuality', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} />
              </div>
              <div onClick={() => selectParam('alphaExperience')} className="cursor-pointer group">
                <Slider label="Experiencia (αE)" value={params.alphaExperience} onChange={(e) => handleWeightChange('alphaExperience', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} />
              </div>
              <div onClick={() => selectParam('alphaLoad')} className="cursor-pointer group">
                <Slider label="Penalización Carga (αC)" value={params.alphaLoad} onChange={(e) => handleWeightChange('alphaLoad', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} />
              </div>
              <div onClick={() => selectParam('alphaBonus')} className="cursor-pointer group">
                <Slider label="Bono Infrautilizado (αB)" value={params.alphaBonus} onChange={(e) => handleWeightChange('alphaBonus', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} />
              </div>
              <div onClick={() => selectParam('alphaNoResponse')} className="cursor-pointer group">
                <Slider label="Penalización No-Resp (αN)" value={params.alphaNoResponse} onChange={(e) => handleWeightChange('alphaNoResponse', parseFloat(e.target.value))} min={0} max={0.5} step={0.01} />
              </div>
            </div>

            <div className={`text-[10px] font-bold p-3 rounded-xl border flex items-center justify-between ${isWeightsSumValid ? 'bg-primary-hl border-primary/20 text-primary' : 'bg-error-hl border-error/30 text-error'}`}>
              <span>Suma total de pesos α:</span>
              <span className="font-mono text-sm">{sumWeights.toFixed(3)} {isWeightsSumValid ? '✓' : '(Debe ser 1.0)'}</span>
            </div>
          </div>

          {/* Exclusiones / Tiempos */}
          <div className="pt-6 border-t border-divider space-y-6">
            <h4 className="text-[10px] font-black text-muted uppercase tracking-wider">B) Exclusiones y Tiempos</h4>
            
            <div className="space-y-5">
              <div onClick={() => selectParam('dInactivityDays')} className="cursor-pointer">
                <Slider label="Inactividad Máxima (días)" value={params.dInactivityDays} onChange={(e) => handleExclusionChange('dInactivityDays', parseInt(e.target.value))} min={1} max={90} step={1} valueSuffix=" d" />
              </div>
              <div onClick={() => selectParam('tCooldownMinutes')} className="cursor-pointer">
                <Slider label="Cooldown Invitaciones" value={params.tCooldownMinutes} onChange={(e) => handleExclusionChange('tCooldownMinutes', parseInt(e.target.value))} min={0} max={1440} step={10} valueSuffix=" min" />
              </div>
              <div onClick={() => selectParam('platformFee')} className="cursor-pointer">
                <Slider label="Margen Plataforma (%)" value={params.platformFee * 100} onChange={(e) => handleExclusionChange('platformFee', parseFloat(e.target.value) / 100)} min={5} max={50} step={1} valueSuffix=" %" />
              </div>
              <div onClick={() => selectParam('tQuoteMinutes')} className="cursor-pointer">
                <Slider label="Tiempo para Cotizar" value={params.tQuoteMinutes} onChange={(e) => handleExclusionChange('tQuoteMinutes', parseInt(e.target.value))} min={10} max={1440} step={10} valueSuffix=" min" />
              </div>
              <div onClick={() => selectParam('tProposalHours')} className="cursor-pointer">
                <Slider label="Validez de Propuesta" value={params.tProposalHours} onChange={(e) => handleExclusionChange('tProposalHours', parseInt(e.target.value))} min={1} max={72} step={1} valueSuffix=" h" />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 2. Visualización y Resultados (col-span-8) */}
      <div className="lg:col-span-8 space-y-8">
        
        {/* Toggle de Pestañas Visuales */}
        <div className="flex flex-wrap bg-surface/40 p-1.5 rounded-2xl border border-divider gap-1">
          {([
            { id: 'ishikawa', label: 'Espina de Pescado' },
            { id: 'funnel',   label: 'Embudo de Selección' },
            { id: 'radar',    label: 'Radar de Pesos' },
            { id: 'heatmap',  label: 'Mapa de Tensiones' },
            { id: 'timeline', label: 'Timeline de Etapas' },
            { id: 'stackedScore', label: 'Score Apilado' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-4 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${activeTab === tab.id ? 'bg-primary text-inverse shadow-sm' : 'text-faint hover:text-foreground'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido Visual Principal */}
        <div className="p-8 rounded-[2.5rem] bg-surface/30 border border-divider shadow-md relative overflow-hidden">
          <AnimatePresence mode="wait">
            
            {/* VISTA 1: Ishikawa (Espina de Pescado) */}
            {activeTab === 'ishikawa' && (
              <motion.div 
                key="ishikawa"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Relaciones de Causa-Efecto</h4>
                    <p className="text-xs text-faint">Haz clic en cualquier hueso o parámetro para ver su descripción de negocio y simular su impacto.</p>
                  </div>
                </div>

                {/* SVG de Espina de Pescado */}
                <div className="w-full flex justify-center bg-background/30 rounded-3xl p-6 border border-divider/40">
                  <svg viewBox="0 0 600 240" className="w-full max-w-2xl h-auto overflow-visible select-none">
                    {/* Filtros de sombreado / brillo */}
                    <defs>
                      <filter id="glow-primary" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                      <filter id="glow-error" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>

                    {/* Cola del Pescado (Tail) */}
                    <path 
                      d="M 40 80 L 70 120 L 40 160 Z" 
                      fill="none" 
                      stroke="var(--color-divider)" 
                      strokeWidth="3" 
                      className="cursor-pointer hover:stroke-primary transition-colors"
                      onClick={() => selectParam('tQuoteMinutes')}
                    />
                    <path 
                      d="M 50 95 L 70 120 L 50 145" 
                      fill="none" 
                      stroke="var(--color-divider)" 
                      strokeWidth="2" 
                    />

                    {/* Espina Dorsal (Backbone) */}
                    <line 
                      x1="70" y1="120" 
                      x2="480" y2="120" 
                      stroke="var(--color-divider)" 
                      strokeWidth="5" 
                    />

                    {/* Cabeza del Pescado (Head - Efecto Neto) */}
                    <g className="cursor-pointer transform hover:scale-102 transition-transform origin-right">
                      <polygon 
                        points="480,85 550,120 480,155" 
                        fill="var(--color-surface)" 
                        stroke={health.emptyPoolRisk > 50 ? 'var(--color-error)' : 'var(--color-primary)'} 
                        strokeWidth="3"
                        style={{ filter: health.emptyPoolRisk > 50 ? 'url(#glow-error)' : 'url(#glow-primary)' }}
                      />
                      <text x="510" y="124" textAnchor="middle" className="text-[10px] font-black fill-foreground tracking-tighter">FAUCHARD</text>
                    </g>

                    {/* --- Espina Superior 1: Exclusiones --- */}
                    <line 
                      x1="180" y1="120" x2="240" y2="40" 
                      stroke="var(--color-faint)" strokeWidth="3" 
                    />
                    {/* Rib: Inactividad */}
                    <line 
                      x1="200" y1="93" x2="250" y2="93" 
                      stroke={selectedParam?.key === 'dInactivityDays' ? 'var(--color-primary)' : 'var(--color-divider)'} 
                      strokeWidth={params.dInactivityDays < 7 ? "4" : "2"}
                      className="cursor-pointer hover:stroke-primary transition-all"
                      onClick={() => selectParam('dInactivityDays')}
                      style={selectedParam?.key === 'dInactivityDays' ? { filter: 'url(#glow-primary)' } : {}}
                    />
                    <text x="255" y="96" className="text-[8px] font-bold fill-muted">Inactividad</text>

                    {/* Rib: Cooldown */}
                    <line 
                      x1="220" y1="67" x2="270" y2="67" 
                      stroke={selectedParam?.key === 'tCooldownMinutes' ? 'var(--color-primary)' : 'var(--color-divider)'} 
                      strokeWidth={params.tCooldownMinutes > 720 ? "4" : "2"}
                      className="cursor-pointer hover:stroke-primary transition-all"
                      onClick={() => selectParam('tCooldownMinutes')}
                      style={selectedParam?.key === 'tCooldownMinutes' ? { filter: 'url(#glow-primary)' } : {}}
                    />
                    <text x="275" y="70" className="text-[8px] font-bold fill-muted">Cooldown</text>

                    {/* --- Espina Superior 2: Tiempos y Fee --- */}
                    <line 
                      x1="320" y1="120" x2="380" y2="40" 
                      stroke="var(--color-faint)" strokeWidth="3" 
                    />
                    {/* Rib: platformFee */}
                    <line 
                      x1="340" y1="93" x2="390" y2="93" 
                      stroke={selectedParam?.key === 'platformFee' ? 'var(--color-primary)' : 'var(--color-divider)'} 
                      strokeWidth={params.platformFee > 0.20 ? "4" : "2"}
                      className="cursor-pointer hover:stroke-primary transition-all"
                      onClick={() => selectParam('platformFee')}
                      style={selectedParam?.key === 'platformFee' ? { filter: 'url(#glow-primary)' } : {}}
                    />
                    <text x="395" y="96" className="text-[8px] font-bold fill-muted">Fee Platform</text>

                    {/* Rib: tQuoteMinutes */}
                    <line 
                      x1="360" y1="67" x2="410" y2="67" 
                      stroke={selectedParam?.key === 'tQuoteMinutes' ? 'var(--color-primary)' : 'var(--color-divider)'} 
                      strokeWidth={params.tQuoteMinutes < 60 ? "4" : "2"}
                      className="cursor-pointer hover:stroke-primary transition-all"
                      onClick={() => selectParam('tQuoteMinutes')}
                      style={selectedParam?.key === 'tQuoteMinutes' ? { filter: 'url(#glow-primary)' } : {}}
                    />
                    <text x="415" y="70" className="text-[8px] font-bold fill-muted">Plazo Cotizar</text>


                    {/* --- Espina Inferior 1: Pesos Score --- */}
                    <line 
                      x1="180" y1="120" x2="240" y2="200" 
                      stroke="var(--color-faint)" strokeWidth="3" 
                    />
                    {/* Rib: Calidad (αQ) */}
                    <line 
                      x1="200" y1="147" x2="250" y2="147" 
                      stroke={selectedParam?.key === 'alphaQuality' ? 'var(--color-primary)' : 'var(--color-divider)'} 
                      strokeWidth={2 + params.alphaQuality * 10}
                      className="cursor-pointer hover:stroke-primary transition-all"
                      onClick={() => selectParam('alphaQuality')}
                      style={selectedParam?.key === 'alphaQuality' ? { filter: 'url(#glow-primary)' } : {}}
                    />
                    <text x="255" y="150" className="text-[8px] font-bold fill-muted">αQ: Calidad</text>

                    {/* Rib: Puntualidad (αP) */}
                    <line 
                      x1="220" y1="173" x2="270" y2="173" 
                      stroke={selectedParam?.key === 'alphaPunctuality' ? 'var(--color-primary)' : 'var(--color-divider)'} 
                      strokeWidth={2 + params.alphaPunctuality * 10}
                      className="cursor-pointer hover:stroke-primary transition-all"
                      onClick={() => selectParam('alphaPunctuality')}
                      style={selectedParam?.key === 'alphaPunctuality' ? { filter: 'url(#glow-primary)' } : {}}
                    />
                    <text x="275" y="176" className="text-[8px] font-bold fill-muted">αP: Puntualidad</text>


                    {/* --- Espina Inferior 2: Incentivos y Penalizaciones --- */}
                    <line 
                      x1="320" y1="120" x2="380" y2="200" 
                      stroke="var(--color-faint)" strokeWidth="3" 
                    />
                    {/* Rib: Carga (αC) */}
                    <line 
                      x1="340" y1="147" x2="390" y2="147" 
                      stroke={selectedParam?.key === 'alphaLoad' ? 'var(--color-primary)' : 'var(--color-divider)'} 
                      strokeWidth={2 + params.alphaLoad * 10}
                      className="cursor-pointer hover:stroke-primary transition-all"
                      onClick={() => selectParam('alphaLoad')}
                      style={selectedParam?.key === 'alphaLoad' ? { filter: 'url(#glow-primary)' } : {}}
                    />
                    <text x="395" y="150" className="text-[8px] font-bold fill-muted">αC: Carga</text>

                    {/* Rib: No Respuesta (αN) */}
                    <line 
                      x1="360" y1="173" x2="410" y2="173" 
                      stroke={selectedParam?.key === 'alphaNoResponse' ? 'var(--color-primary)' : 'var(--color-divider)'} 
                      strokeWidth={2 + params.alphaNoResponse * 10}
                      className="cursor-pointer hover:stroke-primary transition-all"
                      onClick={() => selectParam('alphaNoResponse')}
                      style={selectedParam?.key === 'alphaNoResponse' ? { filter: 'url(#glow-primary)' } : {}}
                    />
                    <text x="415" y="176" className="text-[8px] font-bold fill-muted">αN: Sanción N</text>

                  </svg>
                </div>
              </motion.div>
            )}

            {/* VISTA 2: Embudo de Selección (Funnel) */}
            {activeTab === 'funnel' && (
              <motion.div 
                key="funnel"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div>
                  <h4 className="text-sm font-bold text-foreground">Embudo de Filtración en Tiempo Real</h4>
                  <p className="text-xs text-faint">Muestra cómo los parámetros de exclusión reducen secuencialmente el número de técnicos del pool real.</p>
                </div>

                <div className="space-y-3">
                  {funnelSteps.map((step, idx) => {
                    const maxCount = funnelSteps[0].count;
                    const pct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
                    return (
                      <div key={step.name} className="relative p-4 rounded-2xl bg-background/20 border border-divider/40 overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
                        {/* Indicador de barra de fondo */}
                        <div 
                          className="absolute left-0 top-0 bottom-0 bg-primary/5 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                        
                        <div className="relative z-10 flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center text-[10px] font-black text-primary border border-divider">{idx + 1}</span>
                          <div>
                            <p className="text-xs font-bold text-foreground">{step.name}</p>
                            {step.param && (
                              <span className="text-[8px] font-bold text-primary uppercase">Asociado a: {step.param}</span>
                            )}
                          </div>
                        </div>

                        <div className="relative z-10 flex items-center gap-4 shrink-0">
                          <span className="text-sm font-mono font-black text-foreground">{step.count} tech</span>
                          {step.loss > 0 && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-error-hl text-error">
                              -{step.loss} excluidos
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* VISTA 3: Radar de Pesos α */}
            {activeTab === 'radar' && (
              <motion.div
                key="radar"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="space-y-6"
              >
                <div>
                  <h4 className="text-sm font-bold text-foreground">Radar de Equilibrio de Pesos α</h4>
                  <p className="text-xs text-faint">Visualiza cómo se distribuyen los 6 pesos entre criterios de calidad, equidad y control. El polígono ideal es simétrico y sin picos extremos.</p>
                </div>

                <div className="flex flex-col lg:flex-row items-center gap-8">
                  {/* SVG Radar */}
                  <div className="w-full max-w-xs mx-auto flex-shrink-0">
                    {(() => {
                      const axes = [
                        { key: 'alphaQuality',      label: 'Calidad (αQ)',    color: 'var(--color-primary)' },
                        { key: 'alphaPunctuality',  label: 'Puntualidad (αP)', color: 'var(--color-jade)' },
                        { key: 'alphaExperience',   label: 'Experiencia (αE)', color: '#a78bfa' },
                        { key: 'alphaNoResponse',   label: 'No-Resp (αN)',     color: 'var(--color-error)' },
                        { key: 'alphaBonus',        label: 'Bono (αB)',        color: 'var(--color-warning)' },
                        { key: 'alphaLoad',         label: 'Carga (αC)',       color: '#fb923c' },
                      ];
                      const N = axes.length;
                      const CX = 150, CY = 150, R = 110;
                      const maxVal = 0.5; // max slider
                      const levels = [0.2, 0.4, 0.6, 0.8, 1.0];

                      const angle = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2;
                      const toXY = (i: number, mag: number) => ({
                        x: CX + Math.cos(angle(i)) * R * mag,
                        y: CY + Math.sin(angle(i)) * R * mag,
                      });

                      // Web grid polygons
                      const gridPolygons = levels.map(lvl =>
                        axes.map((_, i) => { const p = toXY(i, lvl); return `${p.x},${p.y}`; }).join(' ')
                      );

                      // Data polygon
                      const dataPoints = axes.map((ax, i) => {
                        const val = (params[ax.key as keyof typeof params] as number) / maxVal;
                        return toXY(i, Math.min(val, 1));
                      });
                      const dataPolygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

                      return (
                        <svg viewBox="0 0 300 300" className="w-full h-auto">
                          <defs>
                            <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.08" />
                            </radialGradient>
                          </defs>

                          {/* Grid rings */}
                          {gridPolygons.map((pts, li) => (
                            <polygon key={li} points={pts} fill="none" stroke="var(--color-divider)" strokeWidth="1" />
                          ))}

                          {/* Axis lines */}
                          {axes.map((ax, i) => {
                            const outer = toXY(i, 1);
                            return <line key={i} x1={CX} y1={CY} x2={outer.x} y2={outer.y} stroke="var(--color-divider)" strokeWidth="1" />;
                          })}

                          {/* Data polygon (filled) */}
                          <polygon points={dataPolygon} fill="url(#radarFill)" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" />

                          {/* Data dots */}
                          {dataPoints.map((p, i) => (
                            <circle
                              key={i}
                              cx={p.x} cy={p.y} r="5"
                              fill={axes[i].color}
                              stroke="var(--color-surface)"
                              strokeWidth="2"
                              className="cursor-pointer"
                              onClick={() => selectParam(axes[i].key)}
                            />
                          ))}

                          {/* Labels */}
                          {axes.map((ax, i) => {
                            const labelR = 1.22;
                            const lp = toXY(i, labelR);
                            const anchor = Math.cos(angle(i)) < -0.3 ? 'end' : Math.cos(angle(i)) > 0.3 ? 'start' : 'middle';
                            return (
                              <text
                                key={i}
                                x={lp.x} y={lp.y + 4}
                                textAnchor={anchor}
                                fontSize="9"
                                fontWeight="700"
                                fill="var(--color-muted)"
                                className="cursor-pointer select-none"
                                onClick={() => selectParam(ax.key)}
                              >
                                {ax.label}
                              </text>
                            );
                          })}

                          {/* Center dot */}
                          <circle cx={CX} cy={CY} r="3" fill="var(--color-primary)" opacity="0.5" />
                        </svg>
                      );
                    })()}
                  </div>

                  {/* Legend / values */}
                  <div className="w-full space-y-2">
                    {([
                      { key: 'alphaQuality',     label: 'Calidad Histórica (αQ)',       color: 'bg-primary',  group: 'Calidad' },
                      { key: 'alphaPunctuality', label: 'Puntualidad (αP)',              color: 'bg-jade',     group: 'Calidad' },
                      { key: 'alphaExperience',  label: 'Experiencia Especializada (αE)', color: 'bg-violet-400', group: 'Calidad' },
                      { key: 'alphaLoad',        label: 'Penalización Carga (αC)',       color: 'bg-orange-400', group: 'Equidad' },
                      { key: 'alphaBonus',       label: 'Bono Infrautilización (αB)',    color: 'bg-warning',  group: 'Equidad' },
                      { key: 'alphaNoResponse',  label: 'Penalización No-Respuesta (αN)', color: 'bg-error',   group: 'Control' },
                    ] as const).map(ax => {
                      const val = params[ax.key as keyof typeof params] as number;
                      const pct = Math.round(val * 100);
                      return (
                        <div
                          key={ax.key}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedParam?.key === ax.key ? 'border-primary/30 bg-primary/5' : 'border-divider bg-background/20 hover:border-divider/80'
                          }`}
                          onClick={() => selectParam(ax.key)}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ax.color}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-foreground truncate">{ax.label}</p>
                            <div className="w-full h-1 bg-surface-2 rounded-full mt-1 overflow-hidden">
                              <div className={`h-full ${ax.color} transition-all duration-300`} style={{ width: `${pct / 0.5}%` }} />
                            </div>
                          </div>
                          <span className="text-xs font-mono font-black text-primary tabular-nums">{val.toFixed(3)}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                            ax.group === 'Calidad' ? 'bg-primary/10 text-primary' :
                            ax.group === 'Equidad' ? 'bg-jade/10 text-jade' :
                            'bg-error/10 text-error'
                          }`}>{ax.group}</span>
                        </div>
                      );
                    })}

                    <div className={`mt-2 p-3 rounded-xl border text-[10px] font-bold flex items-center justify-between ${
                      isWeightsSumValid ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-error/5 border-error/20 text-error'
                    }`}>
                      <span>Σ α = {sumWeights.toFixed(3)}</span>
                      <span>{isWeightsSumValid ? '✓ Válido' : '⚠ Debe sumar 1.0'}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* VISTA 4: Mapa de Tensiones (Heatmap) */}
            {activeTab === 'heatmap' && (
              <motion.div
                key="heatmap"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h4 className="text-sm font-bold text-foreground">Mapa de Tensiones: Parámetros × KPIs</h4>
                  <p className="text-xs text-faint">Cada celda muestra el nivel de tensión que un parámetro ejerce sobre un KPI de salud del sistema. Rojo = tensión alta, verde = sin tensión.</p>
                </div>

                {(() => {
                  // KPIs del sistema
                  const kpis = [
                    { id: 'qualityFocus',   label: 'Foco Calidad',    icon: '⭐' },
                    { id: 'equity',        label: 'Equidad Pool',    icon: '⚖️' },
                    { id: 'agility',       label: 'Agilidad',        icon: '⚡' },
                    { id: 'emptyRisk',     label: 'Riesgo Vacío',    icon: '🔴' },
                    { id: 'costDentist',   label: 'Costo Dentista',  icon: '💰' },
                  ];

                  // Parámetros del sandbox (filas)
                  const rowParams = [
                    { key: 'alphaQuality',    label: 'αQ Calidad' },
                    { key: 'alphaPunctuality',label: 'αP Puntualidad' },
                    { key: 'alphaExperience', label: 'αE Experiencia' },
                    { key: 'alphaLoad',       label: 'αC Carga' },
                    { key: 'alphaBonus',      label: 'αB Bono' },
                    { key: 'alphaNoResponse', label: 'αN No-Resp' },
                    { key: 'tCooldownMinutes',label: 'Cooldown' },
                    { key: 'dInactivityDays', label: 'Inactividad' },
                    { key: 'tQuoteMinutes',   label: 'T. Cotizar' },
                    { key: 'platformFee',     label: 'Fee Plataforma' },
                  ];

                  // Función de tensión: devuelve 0–100 según impacto del param en el KPI
                  const tension = (paramKey: string, kpiId: string): number => {
                    const p = params[paramKey as keyof typeof params] as number;
                    switch (kpiId) {
                      case 'qualityFocus':
                        if (paramKey === 'alphaQuality') return Math.round(p * 200); // +positivo
                        if (paramKey === 'alphaExperience') return Math.round(p * 200);
                        if (paramKey === 'alphaLoad') return Math.round((0.5 - p) * 120);
                        return 10;
                      case 'equity':
                        if (paramKey === 'alphaLoad') return Math.round(p * 200);
                        if (paramKey === 'alphaBonus') return Math.round(p * 200);
                        if (paramKey === 'alphaQuality') return Math.round((0.5 - p) * 80);
                        if (paramKey === 'tCooldownMinutes') return Math.round((p / 1440) * 80);
                        return 15;
                      case 'agility':
                        if (paramKey === 'tQuoteMinutes') return Math.round((p / 1440) * 100);
                        if (paramKey === 'tCooldownMinutes') return Math.round((p / 1440) * 60);
                        if (paramKey === 'dInactivityDays') return Math.round(Math.max(0, (30 - p) / 29) * 40);
                        if (paramKey === 'alphaPunctuality') return Math.round(p * 200);
                        return 5;
                      case 'emptyRisk':
                        if (paramKey === 'tCooldownMinutes') return Math.round((p / 1440) * 100);
                        if (paramKey === 'dInactivityDays') return Math.round(Math.max(0, (15 - p) / 14) * 100);
                        if (paramKey === 'alphaNoResponse') return Math.round(p * 200);
                        if (paramKey === 'alphaBonus') return Math.round((0.5 - p) * 80);
                        return 10;
                      case 'costDentist':
                        if (paramKey === 'platformFee') return Math.round(p * 500);
                        if (paramKey === 'tQuoteMinutes') return Math.round((p / 1440) * 40);
                        return 5;
                      default:
                        return 0;
                    }
                  };

                  const getTensionColor = (t: number) => {
                    if (t >= 80) return 'bg-error/80 text-white';
                    if (t >= 60) return 'bg-error/50 text-error';
                    if (t >= 40) return 'bg-warning/60 text-warning';
                    if (t >= 20) return 'bg-jade/40 text-jade';
                    return 'bg-surface-2/60 text-faint';
                  };

                  const getTensionLabel = (t: number) => {
                    if (t >= 80) return 'Alta';
                    if (t >= 60) return 'Media-Alta';
                    if (t >= 40) return 'Media';
                    if (t >= 20) return 'Baja';
                    return '—';
                  };

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-center border-collapse">
                        <thead>
                          <tr>
                            <th className="text-left text-[9px] font-black text-faint uppercase tracking-wider pb-3 pr-4 min-w-[110px]">Parámetro</th>
                            {kpis.map(kpi => (
                              <th key={kpi.id} className="text-[9px] font-black text-faint uppercase tracking-wider pb-3 px-2">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-base leading-none">{kpi.icon}</span>
                                  <span>{kpi.label}</span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="space-y-1">
                          {rowParams.map((row, ri) => (
                            <tr
                              key={row.key}
                              className={`cursor-pointer transition-all ${
                                selectedParam?.key === row.key ? 'brightness-110' : 'hover:brightness-105'
                              }`}
                              onClick={() => selectParam(row.key)}
                            >
                              <td className={`text-left text-[10px] font-bold pr-4 py-2 ${
                                selectedParam?.key === row.key ? 'text-primary' : 'text-muted'
                              }`}>
                                {row.label}
                                {selectedParam?.key === row.key && <span className="ml-1 text-primary">◀</span>}
                              </td>
                              {kpis.map(kpi => {
                                const t = Math.min(100, Math.max(0, tension(row.key, kpi.id)));
                                return (
                                  <td key={kpi.id} className="px-1.5 py-1.5">
                                    <div
                                      className={`rounded-xl px-2 py-2 text-[9px] font-black transition-all duration-300 ${getTensionColor(t)}`}
                                      title={`${row.label} → ${kpi.label}: ${t}%`}
                                    >
                                      {getTensionLabel(t)}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Leyenda */}
                      <div className="mt-6 flex flex-wrap gap-3 items-center">
                        <span className="text-[9px] font-black text-faint uppercase tracking-wider mr-1">Leyenda:</span>
                        {[
                          { label: 'Alta (≥80)', cls: 'bg-error/80 text-white' },
                          { label: 'Media-Alta (60–80)', cls: 'bg-error/50 text-error' },
                          { label: 'Media (40–60)', cls: 'bg-warning/60 text-warning' },
                          { label: 'Baja (20–40)', cls: 'bg-jade/40 text-jade' },
                          { label: 'Sin tensión (<20)', cls: 'bg-surface-2/60 text-faint' },
                        ].map(l => (
                          <span key={l.label} className={`text-[9px] font-bold px-2.5 py-1 rounded-lg ${l.cls}`}>{l.label}</span>
                        ))}
                      </div>

                      <p className="mt-4 text-[10px] text-faint italic">
                        Las celdas se recalculan automáticamente al mover cualquier slider. Haz clic en una fila para ver la explicación de negocio del parámetro.
                      </p>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* VISTA 5: Timeline de Etapas */}
            {activeTab === 'timeline' && (
              <motion.div
                key="timeline"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h4 className="text-sm font-bold text-foreground">Timeline de Etapas del Flujo</h4>
                  <p className="text-xs text-faint">Cada barra es proporcional al tiempo configurado para esa etapa. Mueve los sliders de tiempo para ver cómo se estira o comprime el flujo total del caso.</p>
                </div>

                {(() => {
                  const stages = [
                    {
                      id: 'invite',
                      label: 'Invitación Fauchard',
                      sublabel: 'El algoritmo selecciona y notifica técnicos',
                      durationMin: 5, // instant
                      paramKey: null,
                      color: 'bg-primary',
                      textColor: 'text-primary',
                      icon: '⚡',
                      fixed: true,
                    },
                    {
                      id: 'quote',
                      label: 'Ventana de Cotización',
                      sublabel: `Técnicos invitados envían su precio (${params.tQuoteMinutes} min)`,
                      durationMin: params.tQuoteMinutes,
                      paramKey: 'tQuoteMinutes',
                      color: 'bg-violet-500',
                      textColor: 'text-violet-400',
                      icon: '💬',
                      fixed: false,
                    },
                    {
                      id: 'proposal',
                      label: 'Dentista Elige Propuesta',
                      sublabel: `Dentista compara y acepta (${params.tProposalHours}h)`,
                      durationMin: params.tProposalHours * 60,
                      paramKey: 'tProposalHours',
                      color: 'bg-jade',
                      textColor: 'text-jade',
                      icon: '🦷',
                      fixed: false,
                    },
                    {
                      id: 'work',
                      label: 'Fabricación / Diseño CAD',
                      sublabel: 'Tiempo estimado en DB (variable por caso)',
                      durationMin: 2 * 24 * 60, // 2d reference
                      paramKey: null,
                      color: 'bg-warning',
                      textColor: 'text-warning',
                      icon: '🔧',
                      fixed: true,
                    },
                    {
                      id: 'review',
                      label: 'Revisión del Dentista',
                      sublabel: `Aprobación o cambios (${params.tDentistReviewHours}h)`,
                      durationMin: params.tDentistReviewHours * 60,
                      paramKey: 'tDentistReviewHours',
                      color: 'bg-orange-400',
                      textColor: 'text-orange-400',
                      icon: '✅',
                      fixed: false,
                    },
                    {
                      id: 'cooldown',
                      label: 'Cooldown por No-Resp',
                      sublabel: `Si un técnico ignora (${params.tCooldownMinutes} min)`,
                      durationMin: params.tCooldownMinutes,
                      paramKey: 'tCooldownMinutes',
                      color: 'bg-error',
                      textColor: 'text-error',
                      icon: '⏸️',
                      fixed: false,
                    },
                  ];

                  const totalMin = stages.reduce((sum, s) => sum + s.durationMin, 0);
                  const fmtDuration = (min: number) => {
                    if (min < 60) return `${min} min`;
                    if (min < 1440) return `${(min / 60).toFixed(1)}h`;
                    return `${(min / 1440).toFixed(1)}d`;
                  };

                  // Cumulative start positions for Gantt-style horizontal layout
                  let cumulative = 0;
                  const segments = stages.map(s => {
                    const pct = totalMin > 0 ? (s.durationMin / totalMin) * 100 : 0;
                    const start = cumulative;
                    cumulative += pct;
                    return { ...s, pct, start };
                  });

                  return (
                    <div className="space-y-8">
                      {/* Gantt horizontal bar */}
                      <div className="space-y-3">
                        <div className="flex w-full h-10 rounded-2xl overflow-hidden border border-divider">
                          {segments.map(s => (
                            <div
                              key={s.id}
                              className={`${s.color} relative flex items-center justify-center transition-all duration-500 cursor-pointer group`}
                              style={{ width: `${Math.max(s.pct, 1)}%` }}
                              onClick={() => s.paramKey && selectParam(s.paramKey)}
                              title={`${s.label}: ${fmtDuration(s.durationMin)}`}
                            >
                              <span className="text-xs opacity-80 group-hover:opacity-100 select-none">{s.icon}</span>
                            </div>
                          ))}
                        </div>

                        {/* Duration label track */}
                        <div className="flex w-full text-center">
                          {segments.map(s => (
                            <div
                              key={s.id}
                              className="overflow-hidden"
                              style={{ width: `${Math.max(s.pct, 1)}%` }}
                            >
                              {s.pct > 5 && (
                                <span className={`text-[8px] font-black ${s.textColor} block truncate`}>
                                  {fmtDuration(s.durationMin)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Detalle por etapa */}
                      <div className="space-y-2">
                        {segments.map((s, i) => {
                          const isSelected = selectedParam?.key === s.paramKey;
                          return (
                            <div
                              key={s.id}
                              className={`flex items-center gap-4 p-3 rounded-2xl border transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-primary/40 bg-primary/5'
                                  : 'border-divider bg-background/10 hover:bg-surface-2/20'
                              }`}
                              onClick={() => s.paramKey && selectParam(s.paramKey)}
                            >
                              {/* Step number */}
                              <div className={`w-8 h-8 rounded-xl ${s.color} flex items-center justify-center text-sm shrink-0`}>
                                {s.icon}
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className={`text-[11px] font-black ${isSelected ? 'text-primary' : 'text-foreground'}`}>{s.label}</p>
                                <p className="text-[9px] text-faint truncate">{s.sublabel}</p>
                              </div>

                              {/* Duration pill */}
                              <div className="shrink-0 text-right">
                                <span className={`text-sm font-mono font-black ${s.textColor}`}>{fmtDuration(s.durationMin)}</span>
                                <p className="text-[8px] text-faint">{s.pct.toFixed(1)}% del flujo</p>
                              </div>

                              {/* Mini bar */}
                              <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden shrink-0">
                                <div className={`h-full ${s.color} transition-all duration-500`} style={{ width: `${s.pct}%` }} />
                              </div>

                              {s.fixed && (
                                <span className="text-[8px] font-bold bg-surface-2 text-faint px-1.5 py-0.5 rounded-md shrink-0">FIJO</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Total summary */}
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-2/60 border border-divider">
                        <span className="text-[10px] font-black text-faint uppercase tracking-wider">Flujo Total (caso sin retrasos)</span>
                        <div className="text-right">
                          <span className="text-lg font-mono font-black text-foreground">{fmtDuration(totalMin)}</span>
                          <p className="text-[8px] text-faint">{(totalMin / 1440).toFixed(1)} días hábiles aprox.</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* VISTA 6: Desglose de Score Apilado por Técnico */}
            {activeTab === 'stackedScore' && (
              <motion.div
                key="stackedScore"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div>
                  <h4 className="text-sm font-bold text-foreground">Desglose de Score Apilado por Técnico</h4>
                  <p className="text-xs text-faint">Cada barra muestra la contribución exacta de cada peso α al score final del técnico. Cambia los sliders para ver en tiempo real quién sube y quién baja en el ranking.</p>
                </div>

                {simulation ? (
                  <div className="space-y-3">
                    {(() => {
                      const visible = simulation.distribution
                        ?.filter((d: any) => !d.excluded)
                        .slice(0, 8) ?? [];

                      if (visible.length === 0) {
                        return (
                          <div className="py-10 text-center text-xs text-faint">
                            No hay técnicos elegibles con la configuración actual.
                          </div>
                        );
                      }

                      const maxScore = Math.max(...visible.map((d: any) => d.score), 0.001);

                      const SEGMENTS = [
                        { key: 'Q', label: 'Calidad (αQ)',     color: 'bg-primary'      },
                        { key: 'P', label: 'Puntualidad (αP)', color: 'bg-jade'         },
                        { key: 'E', label: 'Experiencia (αE)', color: 'bg-violet-500'   },
                        { key: 'C', label: 'Carga (αC)',       color: 'bg-orange-400'   },
                        { key: 'B', label: 'Bono (αB)',        color: 'bg-warning'      },
                        { key: 'N', label: 'No-Resp (αN)',     color: 'bg-error'        },
                      ];

                      return (
                        <>
                          {/* Legend */}
                          <div className="flex flex-wrap gap-2 mb-4">
                            {SEGMENTS.map(seg => (
                              <span key={seg.key} className="flex items-center gap-1.5 text-[9px] font-bold text-muted">
                                <span className={`w-2.5 h-2.5 rounded-sm ${seg.color}`} />
                                {seg.label}
                              </span>
                            ))}
                          </div>

                          {/* Bar rows */}
                          {visible.map((d: any, idx: number) => {
                            const barPct = (d.score / maxScore) * 100;

                            // Segment widths relative to TOTAL bar width
                            const segs = SEGMENTS.map(s => ({
                              ...s,
                              val: d.components?.[s.key] ?? 0,
                              pct: d.score > 0 ? ((d.components?.[s.key] ?? 0) / d.score) * barPct : 0,
                            }));

                            return (
                              <div key={d.technicianId} className="space-y-1">
                                {/* Row header */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-lg bg-surface-2 border border-divider flex items-center justify-center text-[9px] font-black text-faint">
                                      {idx + 1}
                                    </span>
                                    <div>
                                      <span className="text-[11px] font-bold text-foreground">{d.fullName}</span>
                                      <span className="ml-2 text-[8px] font-bold text-faint uppercase">{d.leagueLevel}</span>
                                    </div>
                                  </div>
                                  <span className="text-xs font-mono font-black text-primary">{d.score.toFixed(3)}</span>
                                </div>

                                {/* Stacked bar */}
                                <div className="w-full h-6 bg-surface-2 rounded-xl overflow-hidden flex">
                                  {segs.map(seg => (
                                    seg.pct > 0.3 ? (
                                      <div
                                        key={seg.key}
                                        className={`${seg.color} h-full flex items-center justify-center transition-all duration-500`}
                                        style={{ width: `${seg.pct}%` }}
                                        title={`${seg.label}: ${seg.val.toFixed(3)}`}
                                      >
                                        {seg.pct > 4 && (
                                          <span className="text-[7px] font-black text-white/80 select-none">{seg.key}</span>
                                        )}
                                      </div>
                                    ) : null
                                  ))}
                                  {/* Remaining empty */}
                                  <div className="flex-1 h-full" />
                                </div>

                                {/* Component values */}
                                <div className="flex gap-2">
                                  {segs.map(seg => (
                                    <span key={seg.key} className="text-[8px] font-mono text-faint">
                                      <span className="font-bold">{seg.key}</span>:{seg.val.toFixed(2)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="py-16 flex flex-col items-center gap-3 text-center">
                    <div className="w-10 h-10 rounded-2xl bg-surface-2 border border-divider flex items-center justify-center">
                      <span className="text-xl">📊</span>
                    </div>
                    <p className="text-xs text-faint">Esperando resultados de simulación...<br />Ajusta algún slider para disparar el cálculo.</p>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* 3. Panel de Detalle del Parámetro Seleccionado */}
        {selectedParam && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-[2rem] bg-surface/50 border border-divider shadow-sm space-y-4"
          >
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-black uppercase tracking-wider text-foreground">{selectedParam.label}</h4>
              <span className="text-[10px] font-mono font-bold bg-surface-2 border border-divider px-2 py-0.5 rounded-md text-faint ml-auto">{selectedParam.symbol}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-faint uppercase tracking-widest block">Función del Parámetro</span>
                <p className="text-muted leading-relaxed">{selectedParam.description}</p>
              </div>
              <div className="space-y-1 p-4 bg-background/50 rounded-2xl border border-divider/40">
                <span className="text-[9px] font-black text-primary uppercase tracking-widest block mb-1">Impacto en el Marketplace</span>
                <p className="text-faint leading-relaxed italic">"{selectedParam.example}"</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* 4. Panel de Monitoreo de Salud / Simulación (Frente del pescado) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-[2rem] bg-surface/40 border border-divider flex flex-col gap-2">
            <span className="text-[9px] font-black text-faint uppercase tracking-widest">Foco en Calidad</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground tabular-nums">{health.qualityFocus}%</span>
              <span className={`text-[9px] font-bold ${health.qualityFocus > 60 ? 'text-primary' : 'text-warning'}`}>
                {health.qualityFocus > 60 ? 'Exigente' : 'Balanceado'}
              </span>
            </div>
            <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${health.qualityFocus}%` }} />
            </div>
          </div>

          <div className="p-6 rounded-[2rem] bg-surface/40 border border-divider flex flex-col gap-2">
            <span className="text-[9px] font-black text-faint uppercase tracking-widest">Equidad / Rotación</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground tabular-nums">{health.equityScore}%</span>
              <span className={`text-[9px] font-bold ${health.equityScore > 50 ? 'text-jade' : 'text-error'}`}>
                {health.equityScore > 50 ? 'Estable' : 'Concentrado'}
              </span>
            </div>
            <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-jade" style={{ width: `${health.equityScore}%` }} />
            </div>
          </div>

          <div className="p-6 rounded-[2rem] bg-surface/40 border border-divider flex flex-col gap-2">
            <span className="text-[9px] font-black text-faint uppercase tracking-widest">Agilidad / Velocidad</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground tabular-nums">{health.agilityScore}%</span>
              <span className={`text-[9px] font-bold ${health.agilityScore > 70 ? 'text-jade' : 'text-warning'}`}>
                {health.agilityScore > 70 ? 'Rápida' : 'Lenta'}
              </span>
            </div>
            <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-warning" style={{ width: `${health.agilityScore}%` }} />
            </div>
          </div>

          <div className="p-6 rounded-[2rem] bg-surface/40 border border-divider flex flex-col gap-2">
            <span className="text-[9px] font-black text-faint uppercase tracking-widest">Riesgo Pool Vacío</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground tabular-nums">{health.emptyPoolRisk}%</span>
              <span className={`text-[9px] font-bold ${health.emptyPoolRisk < 40 ? 'text-primary' : 'text-error animate-pulse'}`}>
                {health.emptyPoolRisk < 40 ? 'Seguro' : 'Peligro'}
              </span>
            </div>
            <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-error" style={{ width: `${health.emptyPoolRisk}%` }} />
            </div>
          </div>
        </div>

        {/* 5. Resultados de Simulación Real (Técnicos elegidos debounced) */}
        <div className="p-8 rounded-[3rem] bg-surface/20 border border-divider space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Distribución de Técnicos Reales</h3>
              <p className="text-xs text-faint">Resultados simulados sobre los laboratorios cargados en tu base de datos local (Docker).</p>
            </div>
            {simulation && (
              <span className="text-[10px] font-black px-3 py-1 bg-primary-hl border border-primary/20 text-primary rounded-xl">
                {simulation.eligiblePool} de {simulation.distribution?.length} elegibles
              </span>
            )}
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-error-hl border border-error/20 text-error text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMessage}
            </div>
          )}

          {simulation ? (
            <div className="rounded-[2rem] border border-divider bg-background/20 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface border-b border-divider text-[9px] font-bold uppercase tracking-wider text-faint">
                    <th className="px-6 py-4">Técnico</th>
                    <th className="px-6 py-4">Score Fauchard</th>
                    <th className="px-6 py-4">Probabilidad de Invitación</th>
                    <th className="px-6 py-4">Desglose (αᵢ·Fᵢ)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {simulation.distribution?.slice(0, 10).map((d: any) => (
                    <tr key={d.technicianId} className={`transition-colors ${d.excluded ? 'opacity-30 grayscale bg-background/10' : 'hover:bg-surface-2/20'}`}>
                      <td className="px-6 py-3.5">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-foreground">{d.fullName}</span>
                          <span className="text-[9px] font-bold text-faint uppercase">{d.leagueLevel}</span>
                          {d.excluded && (
                            <span className="text-[8px] font-black uppercase text-error mt-0.5 flex items-center gap-0.5">
                              <AlertCircle className="w-2.5 h-2.5" /> {d.exclusionReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-xs font-mono font-bold text-primary">{d.score.toFixed(3)}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${d.probability * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-foreground">{(d.probability * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex gap-1.5">
                          {['Q', 'P', 'E', 'C', 'B'].map((k) => (
                            <div key={k} className="flex flex-col items-center">
                              <span className="text-[7px] font-black text-faint">{k}</span>
                              <span className="text-[9px] font-mono text-muted">{d.components[k].toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-faint">
              Esperando resultados de simulación...
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
