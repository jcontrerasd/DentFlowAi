'use client';

import { AlertTriangle, AlertCircle, TrendingUp, Settings } from 'lucide-react';
import Link from 'next/link';

interface ConcentrationAlertProps {
  alerts: {
    type: 'concentration' | 'inactive_technician' | 'empty_pool';
    message: string;
    severity: 'warning' | 'critical';
  }[];
  topQuartileShare: number;
}

export default function ConcentrationAlert({ alerts, topQuartileShare }: ConcentrationAlertProps) {
  if (alerts.length === 0 && topQuartileShare <= 0.60) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`
            px-4 py-2.5 rounded-2xl border flex items-center gap-3
            ${alert.severity === 'critical'
              ? 'bg-error-hl border-error/30 text-error'
              : 'bg-warning-hl border-warning/20 text-warning'}
          `}
        >
          <div className={`
            w-7 h-7 rounded-xl flex items-center justify-center shrink-0
            ${alert.severity === 'critical' ? 'bg-error/20' : 'bg-warning/20'}
          `}>
            {alert.severity === 'critical' ? <AlertCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          </div>

          <span className="text-xs font-bold uppercase tracking-wider shrink-0">
            {alert.type === 'concentration' ? 'Alerta de Concentración' :
             alert.type === 'empty_pool' ? 'Fallo Crítico de Selección' : 'Alerta de Equidad'}
          </span>

          <span className="text-xs font-medium opacity-80 truncate">
            {alert.message}
          </span>

          {alert.type === 'concentration' && (
            <div className="flex items-center gap-3 ml-auto shrink-0">
              <Link
                href="/dashboard/admin/fauchard"
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-warning/20 px-3 py-1 rounded-lg hover:bg-warning/30 transition-colors"
              >
                <Settings className="w-3 h-3" />
                Ajustar Pesos
              </Link>
              <span className="text-[10px] italic font-medium opacity-70 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Incrementar penalización por carga (αL)
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
