'use client';

import { AlertTriangle, Info, AlertCircle, TrendingUp, Settings } from 'lucide-react';
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
    <div className="space-y-4">
      {alerts.map((alert, i) => (
        <div 
          key={i}
          className={`
            p-6 rounded-[2rem] border flex gap-5 items-start relative overflow-hidden
            ${alert.severity === 'critical' 
              ? 'bg-red-500/10 border-red-500/20 text-red-400' 
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}
          `}
        >
          <div className={`
            w-12 h-12 rounded-2xl flex items-center justify-center shrink-0
            ${alert.severity === 'critical' ? 'bg-red-500/20' : 'bg-amber-500/20'}
          `}>
            {alert.severity === 'critical' ? <AlertCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
          </div>
          
          <div className="space-y-2 flex-1">
            <h4 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              {alert.type === 'concentration' ? 'Alerta de Concentración' : 
               alert.type === 'empty_pool' ? 'Fallo Crítico de Selección' : 'Alerta de Equidad'}
            </h4>
            <p className="text-sm leading-relaxed font-medium opacity-90">
              {alert.message}
            </p>
            
            {alert.type === 'concentration' && (
              <div className="pt-2 flex flex-wrap gap-4">
                <Link 
                  href="/dashboard/admin/algorithm"
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-amber-500 text-slate-950 px-4 py-1.5 rounded-xl hover:bg-amber-400 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  Ajustar Pesos (C / B)
                </Link>
                <p className="text-[10px] italic font-medium opacity-60 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Sugerencia: Incrementar Penalización por Carga
                </p>
              </div>
            )}
          </div>

          <div className="absolute -right-8 -bottom-8 opacity-5">
            {alert.type === 'concentration' ? <TrendingUp className="w-32 h-32" /> : <AlertCircle className="w-32 h-32" />}
          </div>
        </div>
      ))}
    </div>
  );
}
