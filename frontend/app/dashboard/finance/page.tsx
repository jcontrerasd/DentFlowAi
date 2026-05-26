'use client';

import {
  CreditCard, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  Download, 
  TrendingUp,
  Clock,
  CheckCircle2
} from 'lucide-react';

export default function FinancePage() {
  const transactions = [
    { id: 1, type: 'income', amount: 450000, description: 'Pago Caso #1245 - Clínica Dental Las Condes', date: '2026-04-15', status: 'completado' },
    { id: 2, type: 'income', amount: 120000, description: 'Pago Caso #1240 - Clínica Providencia', date: '2026-04-14', status: 'completado' },
    { id: 3, type: 'expense', amount: 15000, description: 'Comisión de Plataforma DentFlowAi - Abril', date: '2026-04-10', status: 'pendiente' },
    { id: 4, type: 'income', amount: 850000, description: 'Abono Cuenta Corriente - Transferencia', date: '2026-04-01', status: 'completado' },
  ];

  return (
    <div className="space-y-4 pb-20 font-sans">
      <div className="sticky top-20 -mt-10 z-20 px-10 -mx-10 pt-10 pb-2 bg-background space-y-4">
        <header>
          <h1 className="text-3xl serif-font text-foreground mb-2 flex items-center gap-3">
            <Wallet className="text-primary w-8 h-8" /> Mi Cuenta Corriente
          </h1>
          <p className="text-faint text-sm">Gestiona tus ingresos, pagos y facturación de forma centralizada.</p>
        </header>

        {/* Cards de Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-divider p-6 rounded-[2rem] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
            <TrendingUp className="w-14 h-14 text-primary" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1.5">Saldo Disponible</p>
          <h2 className="text-3xl serif-font text-foreground">$1.420.000</h2>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-primary font-bold bg-primary-hl w-max px-2.5 py-1 rounded-full">
            <ArrowUpRight className="w-3 h-3" /> +12.5% este mes
          </div>
        </div>

        <div className="bg-surface/30 border border-divider p-6 rounded-[2rem]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-faint mb-1.5">Retiros Pendientes</p>
          <h2 className="text-3xl serif-font text-muted">$0</h2>
          <button className="mt-4 text-[10px] font-bold uppercase tracking-wider text-primary hover:text-foreground transition-colors">Solicitar Retiro →</button>
        </div>

        <div className="bg-surface/30 border border-divider p-6 rounded-[2rem]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-faint mb-1.5">Próxima Facturación</p>
          <h2 className="text-xl serif-font text-muted">01 de Mayo, 2026</h2>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-faint">
            <Clock className="w-3 h-3" /> 14 días restantes
          </div>
        </div>
        </div>
      </div>

      {/* Tabla de Movimientos */}
      <div className="bg-surface/40 border border-divider rounded-[2.5rem] p-10 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl serif-font text-foreground">Últimos Movimientos</h3>
          <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-foreground transition-colors">
            <Download className="w-4 h-4" /> Exportar PDF
          </button>
        </div>

        <div className="space-y-4">
          {transactions.map((t) => (
            <div key={t.id} className="group flex items-center justify-between p-4 bg-background/40 hover:bg-primary/5 border border-transparent hover:border-primary/30/10 rounded-2xl transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'income' ? 'bg-primary-hl text-primary' : 'bg-error-hl text-error'}`}>
                  {t.type === 'income' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground tracking-tight">{t.description}</p>
                  <p className="text-[10px] uppercase font-black tracking-widest text-faint">{t.date}</p>
                </div>
              </div>
              
              <div className="text-right">
                <p className={`text-sm font-black ${t.type === 'income' ? 'text-primary' : 'text-error'}`}>
                  {t.type === 'income' ? '+' : '-'} ${t.amount.toLocaleString()}
                </p>
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${t.status === 'completado' ? 'text-primary' : 'text-orange-500'}`}>
                    {t.status}
                  </span>
                  {t.status === 'completado' && <CheckCircle2 className="w-2.5 h-2.5 text-primary" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Banner de Ayuda */}
      <div className="bg-gradient-to-r from-teal-600/10 to-blue-600/10 border border-primary/20 p-10 rounded-[2.5rem] flex flex-col md:flex-row items-center gap-8 justify-between">
        <div>
          <h4 className="text-lg serif-font text-foreground mb-2">¿Necesitas ayuda con tus pagos?</h4>
          <p className="text-muted text-sm max-w-md">Nuestro equipo administrativo está disponible para resolver dudas sobre tus liquidaciones y facturas.</p>
        </div>
        <button className="px-8 py-3 bg-primary hover:bg-primary text-inverse rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xl shadow-sm">
          Contactar Soporte
        </button>
      </div>
    </div>
  );
}
