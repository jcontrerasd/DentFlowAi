'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, X, AlertTriangle, CheckCircle2, AlertCircle, Clock, TrendingUp, XCircle, Calendar } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { restoreConfigVersionAction } from '@/lib/db/actions/fauchard';
import { KEY_LABELS, formatFauchardValue } from '@/lib/constants/fauchardLabels';
import type { ConfigVersionMeta, ConfigVersionKpis, FauchardConfigRow } from '@/lib/db/actions/fauchard';

const METADATA_KEYS = new Set([
  'id', 'version', 'isActive', 'updatedBy', 'createdAt', 'updatedAt', 'changeReason',
  'nInvited', 'tProposalHours', 'qMinSelection', 'platformFee', 'nFloor',
]);

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceVersion: ConfigVersionMeta;
  sourceFullRow: FauchardConfigRow;
  activeConfig: FauchardConfigRow;
  nextVersion: number;
  kpisSource: ConfigVersionKpis | null;
}

function pct(v: number | null) { return v === null ? '—' : `${(v * 100).toFixed(1)}%`; }

export default function ActivateVersionModal({
  isOpen,
  onClose,
  sourceVersion,
  sourceFullRow,
  activeConfig,
  nextVersion,
  kpisSource,
}: Props) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canSubmit = understood && reason.trim().length >= 10 && !loading;

  // Diff entre versión fuente y activa
  const diffParams: { key: string; activeValue: unknown; sourceValue: unknown }[] = [];
  const activeMap = activeConfig as unknown as Record<string, unknown>;
  const sourceMap = sourceFullRow as unknown as Record<string, unknown>;
  for (const key of Object.keys(activeConfig)) {
    if (METADATA_KEYS.has(key)) continue;
    const av = activeMap[key];
    const sv = sourceMap[key];
    if (String(av) !== String(sv)) diffParams.push({ key, activeValue: av, sourceValue: sv });
  }

  const handleSubmit = async () => {
    setLoading(true);
    setFeedback(null);
    const res = await restoreConfigVersionAction(sourceVersion.id, reason.trim());
    setLoading(false);
    if (res.success) {
      setFeedback({ type: 'success', text: `V${res.newVersion} creada correctamente basada en V${sourceVersion.version}.` });
      setTimeout(() => {
        onClose();
        router.refresh();
      }, 1500);
    } else {
      setFeedback({ type: 'error', text: res.error ?? 'Error al restaurar la versión.' });
    }
  };

  const kpiCards: { label: string; sub: string; value: string; icon: React.ReactNode; alert?: boolean }[] = kpisSource
    ? [
        {
          label: 'Tasa respuesta técnico',
          sub: 'Técnicos que respondieron a su asignación',
          value: pct(kpisSource.technicianResponseRate),
          icon: <Clock className="w-3.5 h-3.5" />,
        },
        {
          label: 'Tasa aceptación',
          sub: 'De las respuestas, cuántas terminaron en trabajo aceptado',
          value: pct(kpisSource.technicianAcceptanceRate),
          icon: <TrendingUp className="w-3.5 h-3.5" />,
        },
        {
          label: 'Casos sin asignación',
          sub: 'Casos que no pudieron asignarse a ningún técnico',
          value: String(kpisSource.failedCasesCount),
          icon: <XCircle className="w-3.5 h-3.5" />,
          alert: kpisSource.failedCasesCount > 0,
        },
        {
          label: 'Tiempo medio respuesta',
          sub: 'Tiempo entre recibir asignación y responder',
          value: kpisSource.avgResponseMinutes !== null ? `${Math.round(kpisSource.avgResponseMinutes)}m` : '—',
          icon: <Calendar className="w-3.5 h-3.5" />,
        },
      ]
    : [];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-surface border border-divider rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <FocusTrap onEscape={onClose}>
              <div className="p-6 md:p-8 overflow-y-auto max-h-[90vh] space-y-6">

                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-warning-hl border border-warning/20 flex items-center justify-center text-warning shrink-0">
                      <RotateCcw className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-foreground uppercase tracking-tighter">
                        Crear V{nextVersion} basada en V{sourceVersion.version}
                      </h3>
                      <p className="text-[10px] text-faint">
                        Restauración del motor Fauchard
                      </p>
                    </div>
                  </div>
                  <button onClick={onClose} className="p-2 text-muted hover:text-foreground transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Warning banner */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-warning-hl border border-warning/20 text-warning text-xs font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Se creará <strong>V{nextVersion}</strong> con los parámetros de V{sourceVersion.version}.
                    Los casos ya publicados <strong>no se ven afectados</strong> — cada caso mantiene
                    la versión con la que fue evaluado.
                  </span>
                </div>

                {/* Diff table */}
                {diffParams.length > 0 ? (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted mb-2">
                      Parámetros que cambiarán ({diffParams.length})
                    </p>
                    <div className="rounded-xl border border-divider overflow-hidden">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-surface border-b border-divider">
                            <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-muted">Parámetro</th>
                            <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-muted">
                              Activo (V{activeConfig.version})
                            </th>
                            <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-primary">
                              V{nextVersion} (desde V{sourceVersion.version})
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/50">
                          {diffParams.map((p) => (
                            <tr key={p.key} className="hover:bg-surface-2/30">
                              <td className="px-3 py-2 text-muted">{KEY_LABELS[p.key] ?? p.key}</td>
                              <td className="px-3 py-2 text-right font-mono text-faint">
                                {formatFauchardValue(p.key, p.activeValue)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-primary font-bold">
                                {formatFauchardValue(p.key, p.sourceValue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted p-3 bg-surface-2/50 rounded-xl border border-divider">
                    <CheckCircle2 className="w-4 h-4 text-muted shrink-0" />
                    Esta versión es idéntica a la activa en todos los parámetros editables. La restauración no producirá ningún cambio.
                  </div>
                )}

                {/* KPIs de la versión fuente — mismo formato que el monitor */}
                {kpisSource && kpiCards.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted mb-2">
                      KPIs de V{sourceVersion.version}
                      <span className="ml-2 font-normal text-faint">({kpisSource.totalCasesPublished} casos)</span>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {kpiCards.map((card) => (
                        <div key={card.label} className="bg-surface/40 border border-divider rounded-xl p-3 flex flex-col gap-1.5">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                            card.alert
                              ? 'text-error bg-error-hl border border-error/30'
                              : 'text-primary bg-primary-hl border border-primary/20'
                          }`}>
                            {card.icon}
                          </div>
                          <div>
                            <p className="text-[8px] font-bold uppercase tracking-wider text-faint mb-0.5">{card.label}</p>
                            <p className={`text-base font-black ${card.alert ? 'text-error' : 'text-foreground'}`}>{card.value}</p>
                            <p className="text-[7px] text-faint/60 leading-tight mt-0.5">{card.sub}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Motivo */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted">
                    Motivo de la restauración <span className="text-error">*</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Ej: Revertir cambio del 01/07 — la tasa de aceptación bajó del 80% al 60% con la nueva calibración…"
                    className="w-full rounded-2xl bg-surface-2 border border-divider p-3 text-sm text-foreground placeholder:text-muted placeholder:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
                  />
                  {reason.trim().length > 0 && reason.trim().length < 10 && (
                    <p className="text-[10px] text-error">Mínimo 10 caracteres.</p>
                  )}
                </div>

                {/* Checkbox de entendimiento */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                    className="mt-0.5 accent-teal-400 w-4 h-4 shrink-0"
                  />
                  <span className="text-xs text-muted leading-relaxed">
                    Entiendo que esta acción crea <strong className="text-foreground">V{nextVersion}</strong> como
                    nueva versión activa y afecta <strong className="text-foreground">solo casos futuros</strong>.
                    Los casos ya publicados mantienen su versión anclada.
                  </span>
                </label>

                {/* Feedback */}
                {feedback && (
                  <div className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-medium ${
                    feedback.type === 'success'
                      ? 'bg-primary-hl border-primary/20 text-primary'
                      : 'bg-error-hl border-error/30 text-error'
                  }`}>
                    {feedback.type === 'success'
                      ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                      : <AlertCircle className="w-4 h-4 shrink-0" />
                    }
                    {feedback.text}
                  </div>
                )}

                {/* CTA */}
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={handleSubmit}
                    loading={loading}
                    disabled={!canSubmit}
                    variant="primary"
                    className="w-full bg-primary hover:opacity-90 text-inverse font-bold uppercase tracking-wider text-xs h-12 rounded-2xl"
                    icon={<RotateCcw className="w-4 h-4" />}
                  >
                    Crear V{nextVersion} basada en V{sourceVersion.version}
                  </Button>
                  <Button
                    onClick={onClose}
                    disabled={loading}
                    variant="secondary"
                    className="w-full bg-surface-2 hover:bg-surface-off text-foreground font-bold uppercase tracking-wider text-xs h-12 rounded-2xl border-none"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>

              <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-500" />
            </FocusTrap>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
