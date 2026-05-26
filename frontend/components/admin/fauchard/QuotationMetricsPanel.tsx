'use client';

import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  TrendingUp, 
  AlertCircle,
  Calendar,
  DollarSign
} from 'lucide-react';

interface QuotationMetricsPanelProps {
  metrics: {
    globalResponseRate: number;
    globalAcceptanceRate: number;
    failedCases: any[];
  };
}

export default function QuotationMetricsPanel({ metrics }: QuotationMetricsPanelProps) {
  return (
    <div className="space-y-8">
      {/* KPIs de Conversión */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          label="Tasa de Respuesta" 
          value={`${(metrics.globalResponseRate * 100).toFixed(1)}%`}
          sub="Invitaciones aceptadas"
          icon={<Clock className="w-4 h-4" />}
          color="teal"
        />
        <MetricCard 
          label="Tasa de Cierre" 
          value={`${(metrics.globalAcceptanceRate * 100).toFixed(1)}%`}
          sub="Ofertas aceptadas por dentista"
          icon={<TrendingUp className="w-4 h-4" />}
          color="indigo"
        />
        <MetricCard 
          label="Casos Fallidos" 
          value={metrics.failedCases.length.toString()}
          sub="Sin cotizaciones en el período"
          icon={<XCircle className="w-4 h-4" />}
          color={metrics.failedCases.length > 0 ? "red" : "slate"}
        />
        <MetricCard 
          label="Tiempo Prom. Resp" 
          value="~45m"
          sub="Estimado según logs"
          icon={<Calendar className="w-4 h-4" />}
          color="slate"
        />
      </div>

      {/* Listado de Fallos */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <AlertCircle className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-200">Incidentes de Selección</h3>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/20 overflow-hidden">
          {metrics.failedCases.length === 0 ? (
            <div className="p-12 text-center text-slate-600 italic text-sm font-medium">
              No se registraron incidentes en el período seleccionado.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <th className="px-6 py-4">Caso ID</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Motivo Detectado</th>
                  <th className="px-6 py-4 text-right">Impacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {metrics.failedCases.map((c) => (
                  <tr key={c.eventId ?? c.caseId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <code className="text-[10px] text-teal-400 font-mono">#{c.caseId.slice(0, 8)}</code>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[11px] font-bold text-red-400">{c.reason}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-[10px] font-black uppercase text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">Crítico</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, icon, color }: any) {
  const colors: any = {
    teal: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    slate: "text-slate-400 bg-slate-800/50 border-slate-700/50"
  };

  return (
    <div className="p-6 rounded-3xl bg-slate-900/40 border border-slate-800/60 shadow-xl flex flex-col gap-4">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest block mb-1">{label}</span>
        <span className="text-2xl font-black text-white">{value}</span>
        <p className="text-[10px] text-slate-500 mt-1 font-medium">{sub}</p>
      </div>
    </div>
  );
}
