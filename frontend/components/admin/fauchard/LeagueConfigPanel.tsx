'use client';

import { useState, useEffect } from 'react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';
import { getLeagueEngineEnabledAction } from '@/lib/db/actions/league';
import { Save, Trophy, TrendingUp, TrendingDown, Construction, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmSaveModal from './ConfirmSaveModal';

interface LeagueConfigPanelProps {
  initialConfig: any;
}

/**
 * Espacio independiente "Sistema de Categorías (Liga)". Panel autónomo con su propio
 * Guardar, que persiste **solo** las keys `l*` (disjuntas del borrador del modelo,
 * sin lost-update). El motor de promoción/descenso está dormido (Fase 2).
 */
export default function LeagueConfigPanel({ initialConfig }: LeagueConfigPanelProps) {
  const [v, setV] = useState({
    lMinRating: Number(initialConfig.lMinRating ?? 4.2),
    lCasesEvaluated: Number(initialConfig.lCasesEvaluated ?? 10),
    lMinPunctuality: Number(initialConfig.lMinPunctuality ?? 0.85),
    lCasesCompleted: Number(initialConfig.lCasesCompleted ?? 15),
    lCasesTransition: Number(initialConfig.lCasesTransition ?? 3),
    lPenaltyTransition: Number(initialConfig.lPenaltyTransition ?? 0.2),
    lDescentRating: Number(initialConfig.lDescentRating ?? 3.0),
    lDescentDays: Number(initialConfig.lDescentDays ?? 60),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [engineEnabled, setEngineEnabled] = useState(false);

  useEffect(() => {
    getLeagueEngineEnabledAction().then((r) => setEngineEnabled(r.enabled)).catch(() => {});
  }, []);

  const set = (k: keyof typeof v, value: number) => setV((p) => ({ ...p, [k]: value }));

  // Invariante: el umbral de descenso debe ser estrictamente menor al de ascenso
  // (evita el flip-flop ascenso/descenso inmediato).
  const invariantBroken = v.lDescentRating >= v.lMinRating;

  const requestSave = () => {
    if (invariantBroken) {
      setMessage({
        type: 'error',
        text: 'La calificación para descenso debe ser menor que la calificación mínima de ascenso.',
      });
      return;
    }
    setMessage(null);
    setShowConfirm(true);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await updateFauchardParamsAction(v);
      if (res.success) {
        setMessage({ type: 'success', text: 'Parámetros de categorías actualizados' });
        setShowConfirm(false);
      } else {
        setMessage({ type: 'error', text: res.error });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de red' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-12">
      {/* Banner — estado del motor (depende de LEAGUE_ENGINE_ENABLED) */}
      {engineEnabled ? (
        <div className="p-5 rounded-2xl bg-primary-hl border border-primary/30 flex gap-3 items-start">
          <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-primary">Motor de categorías activo</p>
            <p className="text-xs text-primary/80 leading-relaxed">
              El motor de ascenso, transición y descenso está <strong>operativo</strong>: el cron diario
              aplica estos umbrales para mover a los técnicos entre categorías.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-warning-hl border border-warning/30 flex gap-3 items-start">
          <Construction className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-warning">Motor de categorías apagado</p>
            <p className="text-xs text-warning/80 leading-relaxed">
              Estos umbrales <strong>se guardan</strong> en la configuración, pero el motor automático está
              desactivado (<code>LEAGUE_ENGINE_ENABLED=false</code>): por ahora <strong>no tienen efecto</strong>.
              La selección por liga sí opera con la categoría actual de cada técnico.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Requisitos de Ascenso */}
        <div className="space-y-8">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Requisitos de Ascenso</h3>
          </div>
          <div className="space-y-8 pl-1">
            <Slider label="Calificación Mínima" value={v.lMinRating} min={3.5} max={5.0} step={0.1} onChange={(e) => set('lMinRating', parseFloat(e.target.value))} valueSuffix=" ⭐" tooltip="Calificación promedio mínima (en la ventana de evaluación) requerida para ascender de categoría." />
            <Slider label="Ventana de Evaluación (Casos)" value={v.lCasesEvaluated} min={5} max={20} step={1} onChange={(e) => set('lCasesEvaluated', parseInt(e.target.value))} valueSuffix=" casos" tooltip="Número de casos recientes que se analizan para verificar requisitos de ascenso." />
            <Slider label="Puntualidad Mínima (%)" value={v.lMinPunctuality * 100} min={70} max={100} step={1} onChange={(e) => set('lMinPunctuality', parseFloat(e.target.value) / 100)} valueSuffix=" %" tooltip="Porcentaje mínimo de entregas a tiempo exigido para ascender." />
            <Slider label="Casos Completados Totales" value={v.lCasesCompleted} min={5} max={50} step={1} onChange={(e) => set('lCasesCompleted', parseInt(e.target.value))} valueSuffix=" casos" tooltip="Casos finalizados exitosamente requeridos como condición absoluta para ascender." />
          </div>
        </div>

        {/* Transición y Descenso */}
        <div className="space-y-8">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-warning" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Transición y Descenso</h3>
          </div>
          <div className="space-y-8 pl-1">
            <Slider label="Casos en Transición" value={v.lCasesTransition} min={1} max={10} step={1} onChange={(e) => set('lCasesTransition', parseInt(e.target.value))} valueSuffix=" casos" tooltip="Casos a completar en la nueva categoría antes de consolidar el ascenso (período de prueba)." />
            <Slider label="Penalización Transición (%)" value={v.lPenaltyTransition * 100} min={5} max={50} step={1} onChange={(e) => set('lPenaltyTransition', parseFloat(e.target.value) / 100)} valueSuffix=" %" tooltip="Reducción temporal del score durante el período de transición tras ascender." />
            <Slider label="Calificación para Descenso" value={v.lDescentRating} min={2.0} max={3.5} step={0.1} onChange={(e) => set('lDescentRating', parseFloat(e.target.value))} valueSuffix=" ⭐" tooltip="Si el promedio cae bajo este valor durante el período, el técnico desciende de categoría." />
            <Slider label="Días en Baja Calificación" value={v.lDescentDays} min={15} max={120} step={1} onChange={(e) => set('lDescentDays', parseInt(e.target.value))} valueSuffix=" d" tooltip="Días consecutivos bajo el umbral de descenso para que la bajada se haga efectiva." />
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="p-6 rounded-[2rem] bg-primary-hl border border-primary/10 flex gap-4">
        <Trophy className="w-8 h-8 text-primary shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-primary">Sobre el sistema de categorías</h4>
          <p className="text-xs text-primary/70 leading-relaxed">
            Las categorías (Bronce, Plata, Oro, Élite) determinan el acceso a casos de mayor complejidad.
            Cuando el motor de ligas se active (Fase 2), estos parámetros automatizarán ascensos y descensos.
          </p>
        </div>
      </div>

      {invariantBroken && (
        <div className="p-4 rounded-2xl bg-error-hl border border-error/30 text-sm text-error">
          La <strong>calificación para descenso</strong> ({v.lDescentRating.toFixed(1)} ⭐) debe ser menor que la
          <strong> calificación mínima de ascenso</strong> ({v.lMinRating.toFixed(1)} ⭐).
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={requestSave} loading={isSubmitting} disabled={invariantBroken} icon={<Save className="w-4 h-4" />} className="w-full md:w-auto">
          Guardar Configuración de Categorías
        </Button>
      </div>

      <ConfirmSaveModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSave}
        isLoading={isSubmitting}
        title="¿Confirmar Sistema de Categorías?"
        description={
          engineEnabled
            ? 'Vas a modificar las reglas de ascenso, transición y descenso. El motor está activo, así que aplicarán en la próxima corrida del cron diario.'
            : 'Vas a modificar las reglas de ascenso y descenso. Se guardarán, pero no tienen efecto hasta encender el motor (LEAGUE_ENGINE_ENABLED).'
        }
      />

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`p-4 rounded-2xl border text-sm ${message.type === 'success' ? 'bg-primary-hl border-primary/20 text-primary' : 'bg-error-hl border-error/30 text-error'}`}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
