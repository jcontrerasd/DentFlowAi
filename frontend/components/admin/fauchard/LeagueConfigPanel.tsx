'use client';

import { useState } from 'react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';
import { Save, Trophy, TrendingUp, TrendingDown, ShieldCheck, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmSaveModal from './ConfirmSaveModal';

interface LeagueConfigPanelProps {
  initialConfig: any;
}

export default function LeagueConfigPanel({ initialConfig }: LeagueConfigPanelProps) {
  const [params, setParams] = useState({ ...initialConfig });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (key: string, value: any) => {
    setParams((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await updateFauchardParamsAction(params);
      if (res.success) {
        setMessage({ type: 'success', text: 'Parámetros de categorías actualizados' });
        setShowConfirm(false);
      } else {
        setMessage({ type: 'error', text: res.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error de red' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        
        {/* Requisitos de Ascenso */}
        <div className="space-y-8">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Requisitos de Ascenso</h3>
          </div>
          
          <div className="space-y-8 pl-1">
            <Slider
              label="Calificación Mínima"
              value={parseFloat(params.lMinRating)}
              min={3.5} max={5.0} step={0.1}
              onChange={(e) => handleChange('lMinRating', parseFloat(e.target.value))}
              valueSuffix=" ⭐"
              tooltip="Calificación promedio mínima (en la ventana de evaluación) requerida para que un técnico sea considerado para el ascenso a la siguiente categoría."
            />
            <Slider
              label="Ventana de Evaluación (Casos)"
              value={params.lCasesEvaluated}
              min={5} max={20} step={1}
              onChange={(e) => handleChange('lCasesEvaluated', parseInt(e.target.value))}
              valueSuffix=" casos"
              tooltip="Número de casos recientes que se analizan para verificar si el técnico cumple con los requisitos de calificación y puntualidad para ascender."
            />
            <Slider
              label="Puntualidad Mínima (%)"
              value={parseFloat(params.lMinPunctuality) * 100}
              min={70} max={100} step={1}
              onChange={(e) => handleChange('lMinPunctuality', parseFloat(e.target.value) / 100)}
              valueSuffix=" %"
              tooltip="Porcentaje mínimo de entregas a tiempo (sobre la ventana de evaluación) exigido para poder ascender de categoría."
            />
            <Slider
              label="Casos Completados Totales"
              value={params.lCasesCompleted}
              min={5} max={50} step={1}
              onChange={(e) => handleChange('lCasesCompleted', parseInt(e.target.value))}
              valueSuffix=" casos"
              tooltip="Número histórico total de casos finalizados exitosamente que debe tener el técnico como requisito absoluto para ascender."
            />
          </div>
        </div>

        {/* Transición y Descenso */}
        <div className="space-y-8">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-warning" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Transición y Descenso</h3>
          </div>

          <div className="space-y-8 pl-1">
            <Slider
              label="Casos en Transición"
              value={params.lCasesTransition}
              min={1} max={10} step={1}
              onChange={(e) => handleChange('lCasesTransition', parseInt(e.target.value))}
              valueSuffix=" casos"
              tooltip="Cantidad de casos que el técnico debe completar en su nueva categoría antes de estar plenamente consolidado (período de prueba al ascender)."
            />
            <Slider
              label="Penalización Transición (%)"
              value={parseFloat(params.lPenaltyTransition) * 100}
              min={5} max={50} step={1}
              onChange={(e) => handleChange('lPenaltyTransition', parseFloat(e.target.value) / 100)}
              valueSuffix=" %"
              tooltip="Reducción temporal aplicada al score mientras el técnico está en período de transición (ascenso reciente) para balancear la dificultad de la nueva categoría."
            />
            <Slider
              label="Calificación para Descenso"
              value={parseFloat(params.lDescentRating)}
              min={2.0} max={3.5} step={0.1}
              onChange={(e) => handleChange('lDescentRating', parseFloat(e.target.value))}
              valueSuffix=" ⭐"
              tooltip="Si el promedio del técnico cae por debajo de este valor durante el período especificado, será degradado a la categoría inferior."
            />
            <Slider
              label="Días en Baja Calificación"
              value={params.lDescentDays}
              min={15} max={120} step={1}
              onChange={(e) => handleChange('lDescentDays', parseInt(e.target.value))}
              valueSuffix=" d"
              tooltip="Número de días consecutivos que el técnico debe mantener una calificación por debajo del umbral de descenso para que se haga efectiva su bajada de categoría."
            />
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
            El algoritmo utiliza estos parámetros para automatizar los ascensos y descensos basados en el desempeño real.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => setShowConfirm(true)}
          loading={isSubmitting}
          icon={<Save className="w-4 h-4" />}
          className="w-full md:w-auto"
        >
          Guardar Configuración de Categorías
        </Button>
      </div>

      <ConfirmSaveModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSave}
        isLoading={isSubmitting}
        title="¿Confirmar Sistema de Categorías?"
        description="Vas a modificar las reglas de ascenso y descenso de técnicos. Esto afectará la movilidad de los técnicos entre los diferentes niveles de la plataforma."
      />

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`
              p-4 rounded-2xl border text-sm
              ${message.type === 'success' ? 'bg-primary-hl border-primary/20 text-primary' : 'bg-error-hl border-error/30 text-error'}
            `}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
