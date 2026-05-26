'use client';

import { useState, useEffect } from 'react';
import { getFauchardConfigLogAction } from '@/lib/db/actions/fauchard';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { History, User, Settings, ArrowRight, Loader2, Search } from 'lucide-react';

const KEY_LABELS: Record<string, string> = {
  // Pesos del Score
  alphaQuality: 'Calidad Histórica (Q)',
  alphaPunctuality: 'Puntualidad (P)',
  alphaExperience: 'Experiencia Especializada (E)',
  alphaLoad: 'Penalización por Carga (C)',
  alphaBonus: 'Bono de Infrautilización (B)',
  
  // Filtros y Tiempos / General
  wQualityDays: 'Calidad Histórica (días)',
  wLoadDays: 'Carga Reciente (días)',
  cMax: 'Techo Índice de Carga (C_max)',
  dBonusMaxDays: 'Bono Infrautilización (días máx)',
  tCooldownMinutes: 'Cooldown Invitaciones (min)',
  dInactivityDays: 'Inactividad Máxima (días)',
  nInvited: 'Técnicos a invitar por caso',
  nFloor: 'Mínimo Cuartil Inferior (nFloor)',
  tQuoteMinutes: 'Tiempo para Cotizar (minutos)',
  tProposalHours: 'Validez de Propuesta (horas)',
  platformFee: 'Margen de Plataforma (Platform Fee)',
  
  // Sistema de Categorías
  lMinRating: 'Calificación Mínima',
  lCasesEvaluated: 'Ventana de Evaluación (Casos)',
  lMinPunctuality: 'Puntualidad Mínima (%)',
  lCasesCompleted: 'Casos Completados Totales',
  lCasesTransition: 'Casos en Transición',
  lPenaltyTransition: 'Penalización Transición (%)',
  lDescentRating: 'Calificación para Descenso',
  lDescentDays: 'Días en Baja Calificación',
  qMinSelection: 'Umbral Mínimo de Selección (Q)',
};

function formatValue(key: string, value: any) {
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  if (['platformFee', 'lMinPunctuality', 'lPenaltyTransition'].includes(key)) {
    return `${(num * 100).toFixed(0)}%`;
  }

  if (key.startsWith('alpha') || ['cMax', 'lMinRating', 'lDescentRating'].includes(key)) {
    return num.toFixed(3).replace(/\.?0+$/, '');
  }

  return num.toString();
}

export default function ConfigChangeLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      const res = await getFauchardConfigLogAction(100);
      if (res.success) {
        setLogs(res.logs);
      }
      setLoading(false);
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const metadataKeys = ['id', 'version', 'isActive', 'updatedBy', 'createdAt', 'updatedAt'];
    if (metadataKeys.includes(log.parameterKey)) return false;

    const label = KEY_LABELS[log.parameterKey] || log.parameterKey;
    return (
      label.toLowerCase().includes(filter.toLowerCase()) ||
      log.parameterKey.toLowerCase().includes(filter.toLowerCase()) ||
      log.changedByName?.toLowerCase().includes(filter.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        <p className="text-slate-500 text-sm font-medium">Cargando historial de cambios...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-200">Historial de Cambios</h3>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Filtrar por parámetro o admin..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-[11px] text-white focus:outline-none focus:border-slate-600 transition-colors"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-800 overflow-hidden bg-slate-900/20 shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 border-b border-slate-800">
              <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-500">Fecha y Hora</th>
              <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-500">Administrador</th>
              <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-500">Parámetro</th>
              <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-500 text-center">Cambio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-800/30 transition-colors group">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-[10px] font-medium text-slate-400">
                    {format(new Date(log.changedAt), "dd MMM yyyy, HH:mm", { locale: es })}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700/50 group-hover:border-slate-600">
                      <User className="w-3 h-3 text-slate-400" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-200">{log.changedByName || 'Sistema'}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-black text-slate-200 uppercase tracking-tight">
                      {KEY_LABELS[log.parameterKey] || log.parameterKey}
                    </span>
                    <code className="text-[9px] text-teal-400/60 font-mono">
                      {log.parameterKey}
                    </code>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded border border-slate-700/30">
                      {formatValue(log.parameterKey, log.oldValue)}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className="text-[10px] font-mono text-white bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                      {formatValue(log.parameterKey, log.newValue)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-20 text-center text-slate-500 text-sm italic font-medium">
                  No se encontraron registros de cambios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
