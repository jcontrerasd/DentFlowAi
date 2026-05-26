'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { logError } from '@/lib/logger';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Registrar el error en un servicio de monitoreo (Sentry, etc.) en producción
    logError('Unhandled application error', error, { digest: error?.digest });
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Fondo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-900/20 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass-effect p-10 rounded-[2.5rem] border border-red-500/20 text-center relative z-10"
      >
        <div className="w-20 h-20 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>

        <h1 className="text-2xl serif-font text-white mb-3 uppercase">
          Error Inesperado
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-8">
          Algo salió mal. Si el problema persiste, contacta al soporte de DentFlowAi.
        </p>

        {error?.digest && (
          <p className="text-[10px] text-slate-600 font-mono mb-6">
            ID: {error.digest}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full py-3 bg-red-600/20 border border-red-500/30 text-red-400 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-red-600/30 transition-all flex items-center justify-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Reintentar
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 text-slate-500 hover:text-white text-[10px] uppercase tracking-widest font-bold transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Ir al Dashboard
          </button>
        </div>
      </motion.div>
    </div>
  );
}
