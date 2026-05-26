'use client';

import { useState } from 'react';
import Slider from '@/components/ui/Slider';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';
import { Save, Clock, Users, ShieldAlert, BadgePercent, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmSaveModal from './ConfirmSaveModal';

interface FauchardFiltersPanelProps {
  initialConfig: any;
}

export default function FauchardFiltersPanel({ initialConfig }: FauchardFiltersPanelProps) {
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
        setMessage({ type: 'success', text: 'Parámetros actualizados correctamente' });
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
        
        {/* Ventanas Temporales */}
        <Section title="Ventanas Temporales" icon={<Clock className="w-4 h-4" />}>
          <Slider
            label="Calidad Histórica (días)"
            value={params.wQualityDays}
            min={30} max={365} step={1}
            onChange={(e) => handleChange('wQualityDays', parseInt(e.target.value))}
            valueSuffix=" d"
            tooltip="Cuántos días hacia atrás se consideran para calcular el promedio de calificaciones de calidad. Si se setea a 30, solo importa la calidad del último mes."
          />
          <Slider
            label="Carga Reciente (días)"
            value={params.wLoadDays}
            min={7} max={90} step={1}
            onChange={(e) => handleChange('wLoadDays', parseInt(e.target.value))}
            valueSuffix=" d"
            tooltip="Ventana de tiempo para calcular la carga de trabajo reciente de un técnico (casos en proceso e invitaciones pendientes)."
          />
          <Slider
            label="Techo Índice de Carga (C_max)"
            value={parseFloat(params.cMax)}
            min={1} max={5} step={0.1}
            onChange={(e) => handleChange('cMax', parseFloat(e.target.value))}
            valueSuffix=" uds"
            tooltip="Límite superior para la normalización de la carga. Si un técnico tiene una carga igual o mayor a C_max, recibirá la penalización máxima por carga en su score."
          />
          <Slider
            label="Bono Infrautilización (días máx)"
            value={params.dBonusMaxDays}
            min={7} max={60} step={1}
            onChange={(e) => handleChange('dBonusMaxDays', parseInt(e.target.value))}
            valueSuffix=" d"
            tooltip="Máximo de días para el cual el bono de infrautilización sigue creciendo. Pasado este umbral, el bono llega a su tope máximo."
          />
        </Section>

        {/* Filtros de Exclusión */}
        <Section title="Filtros de Exclusión" icon={<ShieldAlert className="w-4 h-4" />}>
          <Slider
            label="Cooldown Invitaciones"
            value={params.tCooldownMinutes}
            min={1} max={1440} step={1}
            onChange={(e) => handleChange('tCooldownMinutes', parseInt(e.target.value))}
            valueFormatter={(v) => {
              if (v < 60) return `${v} min`;
              const h = Math.floor(v / 60);
              const m = v % 60;
              return m === 0 ? `${h} h` : `${h} h ${m} min`;
            }}
            tooltip="Si un técnico rechaza o deja expirar una invitación, este es el tiempo que debe esperar antes de que el algoritmo vuelva a seleccionarlo. Rango: 1 min – 24 h."
          />
          <Slider
            label="Inactividad Máxima (días)"
            value={params.dInactivityDays}
            min={3} max={30} step={1}
            onChange={(e) => handleChange('dInactivityDays', parseInt(e.target.value))}
            valueSuffix=" d"
            tooltip="Si un técnico no ha iniciado sesión ni interactuado en este número de días, es excluido de la selección temporalmente."
          />
          <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 mt-2">
            <p className="text-[10px] text-amber-500 leading-relaxed font-medium">
              Estos filtros se aplican antes del score. Técnicos que no cumplan son excluidos del pool inmediatamente.
            </p>
          </div>
        </Section>

        {/* Selección */}
        <Section title="Reglas de Selección" icon={<Users className="w-4 h-4" />}>
          <Slider
            label="Técnicos a invitar por caso"
            value={params.nInvited}
            min={3} max={10} step={1}
            onChange={(e) => handleChange('nInvited', parseInt(e.target.value))}
            valueSuffix=" tech"
            tooltip="Número base de técnicos que el algoritmo intentará seleccionar y notificar simultáneamente por cada caso nuevo."
          />
          <Slider
            label="Mínimo Cuartil Inferior (nFloor)"
            value={params.nFloor}
            min={0} max={3} step={1}
            onChange={(e) => handleChange('nFloor', parseInt(e.target.value))}
            valueSuffix=" tech"
            tooltip="Asegura que al menos este número de técnicos sean seleccionados de un cuartil inferior (menos experiencia/menos score) para darles oportunidad de crecer."
          />
        </Section>

        {/* Cotización y Propuesta */}
        <Section title="Tiempos y Fee" icon={<BadgePercent className="w-4 h-4" />}>
          <Slider
            label="Tiempo para Cotizar"
            value={params.tQuoteMinutes}
            min={1} max={1440} step={1}
            onChange={(e) => handleChange('tQuoteMinutes', parseInt(e.target.value))}
            valueFormatter={(v) => {
              if (v < 60) return `${v} min`;
              const h = Math.floor(v / 60);
              const m = v % 60;
              return m > 0 ? `${h}h ${m}m` : `${h}h`;
            }}
            tooltip="Tiempo máximo que tiene un técnico invitado para revisar el caso y enviar su oferta (precio y fecha) antes de que la invitación expire. Entre 1 minuto y 24 horas."
          />
          <Slider
            label="Validez de Propuesta (horas)"
            value={params.tProposalHours}
            min={1} max={24} step={1}
            onChange={(e) => handleChange('tProposalHours', parseInt(e.target.value))}
            valueSuffix=" h"
            tooltip="Tiempo máximo que tiene el dentista para aceptar o rechazar la oferta enviada por el técnico."
          />
          <Slider
            label="Margen de Plataforma (Platform Fee)"
            value={parseFloat(params.platformFee) * 100}
            min={5} max={50} step={1}
            onChange={(e) => handleChange('platformFee', parseFloat(e.target.value) / 100)}
            valueSuffix=" %"
            tooltip="Porcentaje que DentFlowAi cobra como comisión sobre el precio base propuesto por el técnico. Afecta el precio final que ve el dentista."
          />
        </Section>
      </div>

      <div className="flex justify-end pt-4">
        <Button
          onClick={() => setShowConfirm(true)}
          loading={isSubmitting}
          icon={<Save className="w-4 h-4" />}
          size="lg"
          className="w-full md:w-auto"
        >
          Guardar Configuración General
        </Button>
      </div>

      <ConfirmSaveModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSave}
        isLoading={isSubmitting}
        title="¿Confirmar Configuración General?"
        description="Vas a modificar umbrales de tiempo, límites de carga y reglas de exclusión. Esto impacta directamente en qué técnicos son elegibles para recibir casos."
      />

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`
              p-4 rounded-3xl border flex items-center gap-4
              ${message.type === 'success' ? 'bg-teal-500/10 border-teal-500/20 text-teal-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}
            `}
          >
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-medium text-sm">{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700/50">
          {icon}
        </div>
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-200">{title}</h3>
      </div>
      <div className="space-y-8 pl-1">
        {children}
      </div>
    </div>
  );
}
