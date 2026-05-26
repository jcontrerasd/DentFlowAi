'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" /></div>}>
      <ForgotPasswordContent />
    </Suspense>
  );
}

function ForgotPasswordContent() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error] = useState('');
  const searchParams = useSearchParams();

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    }
  }, [searchParams]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simular proceso nativo (Pendiente integración de Mailer en Backend)
    setTimeout(() => {
      setSent(true);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/5 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass-effect p-8 rounded-3xl relative z-10 border border-white/5"
      >
        <Link 
          href={`/auth/login?email=${encodeURIComponent(email)}`}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-teal-400 transition-colors text-sm mb-8 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al Inicio
        </Link>

        {sent ? (
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-teal-500/20 text-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-teal-500/10">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Solicitud Recibida</h2>
            <p className="text-slate-400 mb-8 leading-relaxed">
              Estamos migrando a nuestro nuevo sistema de seguridad nativo. Si necesitas asistencia inmediata, contacta a <span className="text-teal-400 font-bold">soporte@dentflow.ai</span>.
            </p>
            <Link 
              href={`/auth/login?email=${encodeURIComponent(email)}`}
              className="block w-full gradient-teal py-4 rounded-xl font-bold text-white text-center shadow-xl shadow-teal-900/20"
            >
              Regresar al Login
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-10 text-center">
              <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-teal-400" />
              </div>
              <h1 className="text-3xl serif-font text-white mb-2">Recuperar Acceso</h1>
              <p className="text-slate-400 text-sm">Ingresa tu correo para validar tu cuenta nativa de DentFlowAI.</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-200 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleReset} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-black text-slate-500 ml-1">Correo Electrónico</label>
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-700 outline-none focus:border-teal-500/50 transition-all"
                  placeholder="ejemplo@clinica.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 gradient-teal rounded-xl font-bold text-white shadow-xl shadow-teal-900/20 flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Enviar Instrucciones
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
