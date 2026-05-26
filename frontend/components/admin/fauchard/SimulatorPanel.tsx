'use client';

import { useState } from 'react';
import { simulateFauchardAction } from '@/lib/db/actions/fauchard';
import { 
  Play, 
  Settings2, 
  Users, 
  ChevronRight, 
  AlertCircle,
  FlaskConical,
  XCircle,
  CheckCircle2,
  Trophy,
  Info
} from 'lucide-react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { CASE_COMPLEXITY, SERVICE_TYPES, WORK_TYPES, WORK_TYPE_LABELS } from '@/lib/constants/dental';

interface SimulatorPanelProps {
  currentConfig: any;
}

type AlgorithmParams = {
  restorationType: typeof WORK_TYPES[number];
  caseComplexity: keyof typeof CASE_COMPLEXITY;
  serviceType: typeof SERVICE_TYPES[keyof typeof SERVICE_TYPES];
};

export default function SimulatorPanel({ currentConfig }: SimulatorPanelProps) {
  const [params, setParams] = useState<AlgorithmParams>({
    restorationType: 'corona_posterior',
    caseComplexity: 'INTERMEDIO',
    serviceType: SERVICE_TYPES.INTEGRAL,
  });

  const [useOverride, setUseOverride] = useState(false);
  const [configOverride, setConfigOverride] = useState({
    alphaQuality: Number(currentConfig.alphaQuality),
    alphaPunctuality: Number(currentConfig.alphaPunctuality),
    alphaExperience: Number(currentConfig.alphaExperience),
    alphaLoad: Number(currentConfig.alphaLoad),
    alphaBonus: Number(currentConfig.alphaBonus),
  });

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = async () => {
    setLoading(true);
    const res = await simulateFauchardAction({
      ...params,
      configOverride: useOverride ? configOverride : undefined,
    });
    if (res.success) {
      setResult(res.simulation);
    }
    setLoading(false);
  };

  const handleOverrideChange = (key: string, val: number) => {
    setConfigOverride(prev => ({ ...prev, [key]: val }));
  };

  const sumOverride = Object.values(configOverride).reduce((a, b) => a + b, 0);
  const isSumValid = Math.abs(sumOverride - 1.0) < 0.001;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
      
      {/* Sidebar de Configuración */}
      <div className="lg:col-span-4 space-y-8">
        <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider shadow-xl space-y-8">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Configurar Escenario</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[9px] font-bold uppercase tracking-wider text-faint px-1">Tipo de Trabajo</label>
              <select 
                className="w-full bg-background border border-divider rounded-2xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/30"
                value={params.restorationType}
                onChange={(e) => setParams(prev => ({ ...prev, restorationType: e.target.value as AlgorithmParams['restorationType'] }))}
              >
                {WORK_TYPES.map((type) => (
                  <option key={type} value={type}>{WORK_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-bold uppercase tracking-wider text-faint px-1">Complejidad</label>
              <select 
                className="w-full bg-background border border-divider rounded-2xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/30"
                value={params.caseComplexity}
                onChange={(e) => setParams(prev => ({ ...prev, caseComplexity: e.target.value as AlgorithmParams['caseComplexity'] }))}
              >
                {Object.entries(CASE_COMPLEXITY).map(([k, v]) => (
                  <option key={k} value={k}>{v as string}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-bold uppercase tracking-wider text-faint px-1">Tipo de Servicio</label>
              <select 
                className="w-full bg-background border border-divider rounded-2xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/30"
                value={params.serviceType}
                onChange={(e) => setParams(prev => ({ ...prev, serviceType: e.target.value as AlgorithmParams['serviceType'] }))}
              >
                <option value={SERVICE_TYPES.INTEGRAL}>Integral (Diseño + Fabricación)</option>
                <option value={SERVICE_TYPES.SOLO_DISENO}>Solo Diseño (STL)</option>
                <option value={SERVICE_TYPES.SOLO_FABRICACION}>Solo Fabricación</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-divider space-y-6">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Modo Sandbox</label>
              <button 
                onClick={() => setUseOverride(!useOverride)}
                className={`relative w-10 h-5 rounded-full transition-colors ${useOverride ? 'bg-indigo-500' : 'bg-surface-2'}`}
              >
                <motion.div animate={{ x: useOverride ? 22 : 2 }} className="w-4 h-4 bg-white rounded-full shadow-sm mt-0.5" />
              </button>
            </div>

            {useOverride && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                <Slider label="Q: Calidad" value={configOverride.alphaQuality} onChange={(e) => handleOverrideChange('alphaQuality', parseFloat(e.target.value))} min={0} max={0.5} />
                <Slider label="P: Puntualidad" value={configOverride.alphaPunctuality} onChange={(e) => handleOverrideChange('alphaPunctuality', parseFloat(e.target.value))} min={0} max={0.5} />
                <Slider label="E: Experiencia" value={configOverride.alphaExperience} onChange={(e) => handleOverrideChange('alphaExperience', parseFloat(e.target.value))} min={0} max={0.5} />
                <Slider label="C: Carga" value={configOverride.alphaLoad} onChange={(e) => handleOverrideChange('alphaLoad', parseFloat(e.target.value))} min={0} max={0.5} />
                <Slider label="B: Bono" value={configOverride.alphaBonus} onChange={(e) => handleOverrideChange('alphaBonus', parseFloat(e.target.value))} min={0} max={0.5} />
                
                <div className={`text-[10px] font-bold p-3 rounded-xl border ${isSumValid ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-error-hl border-error/30 text-error'}`}>
                  Suma α: {sumOverride.toFixed(3)} {isSumValid ? '✓' : ' (Debe ser 1.0)'}
                </div>
              </div>
            )}
          </div>

          <Button 
            onClick={handleSimulate}
            disabled={loading || (useOverride && !isSumValid)}
            loading={loading}
            className="w-full py-4 rounded-2xl"
            icon={<Play className="w-4 h-4" />}
          >
            Ejecutar Simulación
          </Button>
        </div>
      </div>

      {/* Resultados de la Simulación */}
      <div className="lg:col-span-8 space-y-6">
        {!result ? (
          <div className="h-full flex flex-col items-center justify-center p-20 border-2 border-dashed border-divider rounded-[3rem] text-center gap-4">
            <div className="w-20 h-20 rounded-[2.5rem] bg-surface flex items-center justify-center text-faint">
              <FlaskConical className="w-10 h-10" />
            </div>
            <div className="max-w-xs">
              <h4 className="text-foreground font-bold mb-1">Listo para simular</h4>
              <p className="text-faint text-sm">Ajusta los parámetros y presiona "Ejecutar Simulación" para ver la distribución de probabilidades.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 rounded-3xl bg-primary/5 border border-primary/30/10 flex items-center gap-4">
                <Users className="w-6 h-6 text-primary" />
                <div>
                  <span className="text-[9px] font-black uppercase text-primary/60 block">Pool Elegible</span>
                  <span className="text-xl font-black text-foreground">{result.eligiblePool} Técnicos</span>
                </div>
              </div>
              <div className="p-6 rounded-3xl bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-4">
                <Settings2 className="w-6 h-6 text-indigo-400" />
                <div>
                  <span className="text-[9px] font-black uppercase text-indigo-500/60 block">N Invitados</span>
                  <span className="text-xl font-black text-foreground">{result.invitedCount}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-divider bg-surface/20 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface border-b border-divider text-[9px] font-bold uppercase tracking-wider text-faint">
                    <th className="px-6 py-5">Técnico</th>
                    <th className="px-6 py-5">Score Total</th>
                    <th className="px-6 py-5">Probabilidad</th>
                    <th className="px-6 py-5">Desglose (αᵢ·Fᵢ)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {result.distribution.map((d: any, i: number) => (
                    <tr key={d.technicianId} className={`transition-colors ${d.excluded ? 'opacity-30 grayscale' : 'hover:bg-surface-2/30'}`}>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-foreground">{d.fullName}</span>
                          <span className="text-[9px] font-bold uppercase text-faint">{d.leagueLevel}</span>
                          {d.excluded && (
                            <span className="text-[8px] font-black uppercase text-error mt-1 flex items-center gap-1">
                              <AlertCircle className="w-2.5 h-2.5" /> {d.exclusionReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono font-bold text-primary">{d.score.toFixed(3)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1 bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${d.probability * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-foreground">{(d.probability * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
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

            <div className="p-6 rounded-3xl bg-surface border border-divider flex gap-4">
              <Info className="w-5 h-5 text-faint shrink-0" />
              <p className="text-[11px] text-faint leading-relaxed italic">
                Nota: Esta simulación muestra las probabilidades teóricas. En una ejecución real, el sistema realiza un sorteo ponderado donde los técnicos con mayor probabilidad tienen más chances de ser elegidos, pero no es determinístico.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
