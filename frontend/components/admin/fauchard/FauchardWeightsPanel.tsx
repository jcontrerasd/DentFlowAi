'use client';

import { useState, useEffect } from 'react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';
import { Save, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmSaveModal from './ConfirmSaveModal';

interface FauchardWeightsPanelProps {
  initialConfig: {
    alphaQuality: string | number;
    alphaPunctuality: string | number;
    alphaExperience: string | number;
    alphaLoad: string | number;
    alphaBonus: string | number;
  };
}

export default function FauchardWeightsPanel({ initialConfig }: FauchardWeightsPanelProps) {
  const [weights, setWeights] = useState({
    alphaQuality: Number(initialConfig.alphaQuality),
    alphaPunctuality: Number(initialConfig.alphaPunctuality),
    alphaExperience: Number(initialConfig.alphaExperience),
    alphaLoad: Number(initialConfig.alphaLoad),
    alphaBonus: Number(initialConfig.alphaBonus),
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const isSumValid = Math.abs(sum - 1.0) < 0.001;

  const handleWeightChange = (key: keyof typeof weights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!isSumValid) return;
    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await updateFauchardParamsAction(weights);
      if (res.success) {
        setMessage({ type: 'success', text: 'Pesos actualizados correctamente' });
        setShowConfirm(false);
      } else {
        setMessage({ type: 'error', text: res.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error de red al actualizar' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
        {/* Q: Calidad */}
        <div className="space-y-2">
          <Slider
            label="Calidad Histórica (Q)"
            value={weights.alphaQuality}
            onChange={(e) => handleWeightChange('alphaQuality', parseFloat(e.target.value))}
            min={0}
            max={0.5}
            step={0.01}
            valueSuffix=" (w)"
            tooltip="Mide la importancia de las valoraciones y el feedback de casos anteriores. Un valor alto hace que los técnicos con mejores calificaciones tengan mayor prioridad para nuevos casos."
          />
          <p className="text-[10px] text-faint italic px-1">
            Importancia de los ratings promedio de casos anteriores.
          </p>
        </div>

        {/* P: Puntualidad */}
        <div className="space-y-2">
          <Slider
            label="Puntualidad (P)"
            value={weights.alphaPunctuality}
            onChange={(e) => handleWeightChange('alphaPunctuality', parseFloat(e.target.value))}
            min={0}
            max={0.5}
            step={0.01}
            valueSuffix=" (w)"
            tooltip="Evalúa la frecuencia con la que el técnico entrega los trabajos a tiempo. Aumentar este peso prioriza a los técnicos que no se atrasan en sus fechas de entrega prometidas."
          />
          <p className="text-[10px] text-faint italic px-1">
            Historial de entregas en el plazo prometido.
          </p>
        </div>

        {/* E: Experiencia */}
        <div className="space-y-2">
          <Slider
            label="Experiencia Especializada (E)"
            value={weights.alphaExperience}
            onChange={(e) => handleWeightChange('alphaExperience', parseFloat(e.target.value))}
            min={0}
            max={0.5}
            step={0.01}
            valueSuffix=" (w)"
            tooltip="Considera el nivel de habilidad declarado o verificado del técnico para el tipo de trabajo específico. Darle más peso favorece a los especialistas."
          />
          <p className="text-[10px] text-faint italic px-1">
            Nivel de habilidad declarado para el tipo de trabajo específico.
          </p>
        </div>

        {/* C: Carga */}
        <div className="space-y-2">
          <Slider
            label="Penalización por Carga (C)"
            value={weights.alphaLoad}
            onChange={(e) => handleWeightChange('alphaLoad', parseFloat(e.target.value))}
            min={0}
            max={0.5}
            step={0.01}
            valueSuffix=" (w)"
            tooltip="Reduce el score de los técnicos que ya tienen muchos casos asignados o invitaciones pendientes. Ayuda a distribuir el trabajo de forma más equitativa y evita cuellos de botella."
          />
          <p className="text-[10px] text-faint italic px-1">
            Reduce prioridad a técnicos con muchas invitaciones recientes.
          </p>
        </div>

        {/* B: Bono */}
        <div className="space-y-2">
          <Slider
            label="Bono de Infrautilización (B)"
            value={weights.alphaBonus}
            onChange={(e) => handleWeightChange('alphaBonus', parseFloat(e.target.value))}
            min={0}
            max={0.5}
            step={0.01}
            valueSuffix=" (w)"
            tooltip="Otorga un aumento de score temporal a técnicos que llevan mucho tiempo sin recibir casos nuevos. Fomenta la participación de todo el pool de técnicos activos."
          />
          <p className="text-[10px] text-faint italic px-1">
            Prioriza a técnicos que llevan tiempo sin ser invitados.
          </p>
        </div>
      </div>

      {/* Sum Validation Indicator */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 p-6 rounded-[2rem] bg-surface/40 border border-divider shadow-2xl">
        <div className="flex items-center gap-4">
          <div className={`
            w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300
            ${isSumValid ? 'bg-primary-hl text-primary border border-primary/20' : 'bg-warning-hl text-warning border border-warning/20'}
          `}>
            {isSumValid ? <Save className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-black ${isSumValid ? 'text-primary' : 'text-warning'}`}>
                Suma: {sum.toFixed(3)}
              </span>
              <span className="text-faint text-sm font-medium">/ 1.000</span>
            </div>
            <p className="text-xs text-faint">
              {isSumValid 
                ? 'La configuración es válida y puede ser guardada.' 
                : 'La suma de todos los pesos (α) debe ser exactamente 1.000.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={!isSumValid || isSubmitting}
            loading={isSubmitting}
            icon={<Save className="w-4 h-4" />}
            className="w-full md:w-auto"
          >
            Guardar Pesos
          </Button>
        </div>
      </div>

      <ConfirmSaveModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSave}
        isLoading={isSubmitting}
        title="¿Confirmar Ajuste de Pesos?"
        description="Vas a cambiar la importancia relativa de los factores de selección. Esto altera directamente cómo se calcula el score de los técnicos."
      />

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`
              p-4 rounded-2xl border text-sm flex items-center gap-3
              ${message.type === 'success' 
                ? 'bg-primary-hl border-primary/20 text-primary' 
                : 'bg-error-hl border-error/30 text-error'}
            `}
          >
            {message.type === 'success' ? <Info className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
