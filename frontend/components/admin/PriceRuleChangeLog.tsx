'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowRight, History, Loader2, Search, User } from 'lucide-react';
import {
  listPriceRuleChangeLogAction,
  type PriceRuleChangeLogEntry,
} from '@/lib/db/actions/priceRules';
import {
  PRICE_RULE_ACTION_LABELS,
  PRICE_RULE_FIELD_LABELS,
} from '@/lib/pricing/priceRuleAudit';
import { formatUchQuoteClp } from '@/lib/uchQuoteDisplay';

function formatDisplayValue(
  fieldKey: string,
  label: string | null,
  raw: string | null,
): string {
  if (raw === null) return '—';
  if (label) return label;
  if (fieldKey === 'cost' || fieldKey === 'sale_price') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? formatUchQuoteClp(n) : raw;
  }
  return raw;
}

type PriceRuleChangeLogProps = {
  ruleId?: string | null;
  onClearRuleFilter?: () => void;
};

export default function PriceRuleChangeLog({ ruleId, onClearRuleFilter }: PriceRuleChangeLogProps) {
  const [logs, setLogs] = useState<PriceRuleChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listPriceRuleChangeLogAction({
      ruleId: ruleId ?? undefined,
      limit: 150,
    });
    if (res.success && res.data) setLogs(res.data);
    else setLogs([]);
    setLoading(false);
  }, [ruleId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredLogs = logs.filter((log) => {
    const fieldLabel = PRICE_RULE_FIELD_LABELS[log.fieldKey] ?? log.fieldKey;
    const actionLabel = PRICE_RULE_ACTION_LABELS[log.action] ?? log.action;
    const haystack = [
      fieldLabel,
      log.fieldKey,
      actionLabel,
      log.changeReason,
      log.changedByName,
      log.oldValueLabel,
      log.newValueLabel,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(filter.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
        <p className="text-muted text-sm">Cargando historial...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-muted" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            {ruleId ? 'Historial de la regla' : 'Historial global'}
          </h3>
          {ruleId && onClearRuleFilter && (
            <button
              onClick={onClearRuleFilter}
              className="text-xs font-bold uppercase tracking-wide text-primary hover:underline"
            >
              Ver todo
            </button>
          )}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            placeholder="Filtrar por campo, admin o motivo..."
            className="w-full bg-surface border border-divider rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-primary/40"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-divider overflow-hidden bg-surface/20">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface border-b border-divider">
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted">Fecha</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted">Admin</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted">Acción</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted">Campo</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted text-center">Cambio</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider/50">
            {filteredLogs.map((log) => {
              const caseId = typeof log.context.caseId === 'string' ? log.context.caseId : null;
              const caseNumber =
                typeof log.context.caseNumber === 'string' ? log.context.caseNumber : null;
              return (
                <tr key={log.id} className="hover:bg-surface-2/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted">
                    {format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm', { locale: es })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-surface-2 flex items-center justify-center border border-divider">
                        <User className="w-3 h-3 text-muted" />
                      </div>
                      <span className="text-xs font-bold">{log.changedByName ?? 'Sistema'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-foreground">
                    {PRICE_RULE_ACTION_LABELS[log.action] ?? log.action}
                    {caseId && (
                      <p className="text-xs font-normal normal-case text-muted mt-0.5">
                        Caso{' '}
                        <Link href={`/dashboard/cases/${caseId}`} className="text-primary hover:underline">
                          {caseNumber ?? caseId.slice(0, 8)}
                        </Link>
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold">
                    {PRICE_RULE_FIELD_LABELS[log.fieldKey] ?? log.fieldKey}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs font-mono text-muted bg-surface-2 px-2 py-0.5 rounded border border-divider/30">
                        {formatDisplayValue(log.fieldKey, log.oldValueLabel, log.oldValue)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted shrink-0" />
                      <span className="text-xs font-mono text-foreground bg-primary-hl px-2 py-0.5 rounded border border-primary/20">
                        {formatDisplayValue(log.fieldKey, log.newValueLabel, log.newValue)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted max-w-[14rem]">
                    {log.changeReason}
                  </td>
                </tr>
              );
            })}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-muted opacity-50 text-sm italic">
                  No hay registros de auditoría.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
