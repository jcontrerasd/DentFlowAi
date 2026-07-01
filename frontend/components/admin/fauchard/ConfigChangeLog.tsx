'use client';

import { useState, useEffect, useMemo } from 'react';
import { getFauchardConfigLogAction } from '@/lib/db/actions/fauchard';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { History, User, ArrowRight, Loader2, Search } from 'lucide-react';
import FauchardHelpButton from './FauchardHelpButton';
import FauchardHelpWindow from './FauchardHelpWindow';
import { HISTORY_HELP } from '@/lib/constants/fauchardHelp';

const HIDDEN_KEYS = new Set([
  'id', 'version', 'isActive', 'updatedBy', 'createdAt', 'updatedAt', 'changeReason',
  'nInvited', 'tProposalHours', 'qMinSelection', 'platformFee',
]);

const KEY_LABELS: Record<string, string> = {
  alphaQuality: 'Calidad Histórica (Q)',
  alphaPunctuality: 'Puntualidad (P)',
  alphaExperience: 'Experiencia Especializada (E)',
  alphaBonus: 'Bono de Infrautilización (B)',
  alphaLoad: 'Carga activa (L)',
  alphaNoResponse: 'Penalización por No-respuesta (N)',
  wQualityDays: 'Ventana histórica (días)',
  loadReferenceMin: 'Carga de Trabajo (Min)',
  // Legacy (retirados del panel; se conservan para renderizar auditoría histórica):
  wLoadDays: 'Carga Reciente (días)',
  cMax: 'Techo Índice de Carga (C_max)',
  dBonusMaxDays: 'Bono Infrautilización (días máx)',
  tCooldownMinutes: 'Cooldown asignación (min)',
  dInactivityDays: 'Inactividad Máxima (días)',
  maxAssignmentAttempts: 'Intentos máximos de asignación',
  tQuoteMinutes: 'Tiempo para responder asignación (min)',
  tDentistReviewHours: 'Revisión del dentista (h)',
  tNoEligiblePoolHours: 'Espera pool sin elegibles (h)',
  maxPoolCycles: 'Ciclos de espera pool',
  replacementCutoffMinutes: 'Margen de reemplazo (min)',
  noResponseWindowDays: 'Ventana no-respuesta (días)',
  noResponseRehabilitationDays: 'Rehabilitación no-respuesta (días)',
  level1Threshold: 'Umbral Nivel 1',
  level2Threshold: 'Umbral Nivel 2',
  level3Threshold: 'Umbral Nivel 3',
  inactivityAutoOffDays: 'Auto-OFF preventivo (días)',
  inactivityReminderDays: 'Recordatorio de actividad (días)',
  lMinRating: 'Calificación Mínima',
  lCasesEvaluated: 'Ventana de Evaluación (Casos)',
  lMinPunctuality: 'Puntualidad Mínima (%)',
  lCasesCompleted: 'Casos Completados Totales',
  lCasesTransition: 'Casos en Transición',
  lPenaltyTransition: 'Penalización Transición (%)',
  lDescentRating: 'Calificación para Descenso',
  lDescentDays: 'Días en Baja Calificación',
};

function formatValue(key: string, value: unknown) {
  const num = parseFloat(String(value));
  if (isNaN(num)) return String(value ?? '');

  if (['lMinPunctuality', 'lPenaltyTransition'].includes(key)) {
    return `${(num * 100).toFixed(0)}%`;
  }

  if (key.startsWith('alpha') || ['cMax', 'lMinRating', 'lDescentRating'].includes(key)) {
    return num.toFixed(3).replace(/\.?0+$/, '');
  }

  return num.toString();
}

type LogRow = {
  id: string;
  configId: string;
  parameterKey: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date | string;
  changedByName: string | null;
};

type GroupedLog = {
  key: string;
  changedAt: Date;
  changedByName: string | null;
  entries: LogRow[];
};

function groupLogs(logs: LogRow[]): GroupedLog[] {
  const byConfig = new Map<string, LogRow[]>();
  for (const log of logs) {
    const bucket = byConfig.get(log.configId) ?? [];
    bucket.push(log);
    byConfig.set(log.configId, bucket);
  }

  const groups: GroupedLog[] = [];
  for (const [configId, entries] of byConfig) {
    const sorted = [...entries].sort((a, b) => a.parameterKey.localeCompare(b.parameterKey));
    const changedAt = new Date(Math.max(...entries.map((e) => new Date(e.changedAt).getTime())));
    groups.push({
      key: configId,
      changedAt,
      changedByName: entries[0]?.changedByName ?? null,
      entries: sorted,
    });
  }

  return groups.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
}

export default function ConfigChangeLog() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      const res = await getFauchardConfigLogAction(100);
      if (res.success && res.logs) {
        setLogs(res.logs as LogRow[]);
      }
      setLoading(false);
    };
    fetchLogs();
  }, []);

  const visibleLogs = useMemo(
    () => logs.filter((log) => !HIDDEN_KEYS.has(log.parameterKey)),
    [logs],
  );

  const grouped = useMemo(() => groupLogs(visibleLogs), [visibleLogs]);

  const filteredGroups = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return grouped;
    return grouped.filter((g) => {
      if (g.changedByName?.toLowerCase().includes(q)) return true;
      return g.entries.some((e) => {
        const label = KEY_LABELS[e.parameterKey] || e.parameterKey;
        return label.toLowerCase().includes(q) || e.parameterKey.toLowerCase().includes(q);
      });
    });
  }, [grouped, filter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-muted text-sm font-medium">Cargando historial de cambios...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-muted" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Historial de Cambios</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint" />
            <input
              type="text"
              placeholder="Filtrar por parámetro o admin..."
              className="w-full bg-surface border border-divider rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-divider transition-colors"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <FauchardHelpButton onClick={() => setShowHelp(true)} label="Historial" />
        </div>
      </div>

      <FauchardHelpWindow isOpen={showHelp} onClose={() => setShowHelp(false)} section={HISTORY_HELP} />

      <div className="rounded-[2rem] border border-divider overflow-hidden bg-surface/20 shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface border-b border-divider">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted">Fecha y Hora</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted">Administrador</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted">Parámetro(s)</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted text-center">Cambio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filteredGroups.map((group) => (
              group.entries.length === 1 ? (
                <tr key={group.key} className="hover:bg-surface-2/30 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-medium text-muted">
                      {format(group.changedAt, "dd MMM yyyy, HH:mm", { locale: es })}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-surface-2 flex items-center justify-center border border-divider group-hover:border-divider">
                        <User className="w-3 h-3 text-muted" />
                      </div>
                      <span className="text-xs font-bold text-foreground">{group.changedByName || 'Sistema'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-black text-foreground uppercase tracking-tight">
                        {KEY_LABELS[group.entries[0].parameterKey] || group.entries[0].parameterKey}
                      </span>
                      <code className="text-xs text-primary/60 font-mono">{group.entries[0].parameterKey}</code>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-xs font-mono text-muted bg-surface-2 px-2 py-0.5 rounded border border-divider/30">
                        {formatValue(group.entries[0].parameterKey, group.entries[0].oldValue)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-faint" />
                      <span className="text-xs font-mono text-foreground bg-primary-hl px-2 py-0.5 rounded border border-primary/20">
                        {formatValue(group.entries[0].parameterKey, group.entries[0].newValue)}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={group.key} className="hover:bg-surface-2/30 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap align-top">
                    <span className="text-xs font-medium text-muted">
                      {format(group.changedAt, "dd MMM yyyy, HH:mm", { locale: es })}
                    </span>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-surface-2 flex items-center justify-center border border-divider">
                        <User className="w-3 h-3 text-muted" />
                      </div>
                      <span className="text-xs font-bold text-foreground">{group.changedByName || 'Sistema'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top" colSpan={2}>
                    <div className="space-y-2">
                      <span className="text-xs font-black text-foreground uppercase tracking-tight">
                        Actualización ({group.entries.length} parámetros)
                      </span>
                      <ul className="space-y-1.5">
                        {group.entries.map((e) => (
                          <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-bold text-foreground">{KEY_LABELS[e.parameterKey] || e.parameterKey}</span>
                            <span className="font-mono text-muted">{formatValue(e.parameterKey, e.oldValue)}</span>
                            <ArrowRight className="w-3 h-3 text-faint" />
                            <span className="font-mono text-primary">{formatValue(e.parameterKey, e.newValue)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {filteredGroups.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-20 text-center text-muted opacity-50 text-sm italic font-medium">
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
