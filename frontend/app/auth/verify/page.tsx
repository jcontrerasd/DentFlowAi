'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

function VerifyHandler() {
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success'>('verifying');
  const [message] = useState('Tu identidad ha sido verificada exitosamente.');

  useEffect(() => {
    // En el modo nativo, llegamos aquí ya verificados o auto-verificados
    const timer = setTimeout(() => {
      setStatus('success');
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    }, 1000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-white/10 p-10 rounded-[2rem] text-center shadow-2xl">

        <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-8">DentFlowAI · Seguridad</p>

        {status === 'verifying' && (
          <div className="animate-in fade-in duration-500">
            <div className="relative w-20 h-20 mx-auto mb-8">
              <div className="absolute inset-0 bg-teal-500/10 rounded-full animate-pulse" />
              <div className="relative w-full h-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
              </div>
            </div>
            <h1 className="text-2xl font-black text-white mb-3 serif-font italic">Verificando...</h1>
          </div>
        )}

        {status === 'success' && (
          <div className="animate-in fade-in zoom-in duration-500 space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping opacity-30" />
              <div className="relative w-full h-full bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-black text-white mb-2 serif-font italic">Acceso Habilitado.</h1>
              <p className="text-slate-400 text-sm">{message}</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-teal-400 text-xs font-bold">
              <div className="w-3 h-3 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
              Redirigiendo al Dashboard...
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-teal-400 animate-spin" />
      </div>
    }>
      <VerifyHandler />
    </Suspense>
  );
}
