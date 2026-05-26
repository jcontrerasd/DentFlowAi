'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary/30 border-t-teal-500 rounded-full animate-spin" /></div>}>
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-surface-2 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-hl blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-surface shadow-sm border border-divider p-8 rounded-3xl relative z-10 border border-divider"
      >
        <Link 
          href={`/auth/login?email=${encodeURIComponent(email)}`}
          className="inline-flex items-center gap-2 text-faint hover:text-primary transition-colors text-sm mb-8 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al Inicio
        </Link>

        {sent ? (
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-primary-hl text-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-sm">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-4">Solicitud Recibida</h2>
            <p className="text-muted mb-8 leading-relaxed">
              Estamos migrando a nuestro nuevo sistema de seguridad nativo. Si necesitas asistencia inmediata, contacta a <span className="text-primary font-bold">soporte@dentflow.ai</span>.
            </p>
            <Link 
              href={`/auth/login?email=${encodeURIComponent(email)}`}
              className="block w-full bg-surface py-4 rounded-xl font-bold text-foreground text-center shadow-xl shadow-sm"
            >
              Regresar al Login
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-10 text-center">
              <div className="w-16 h-16 bg-surface border border-divider rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl serif-font text-foreground mb-2">Recuperar Acceso</h1>
              <p className="text-muted text-sm">Ingresa tu correo para validar tu cuenta nativa de DentFlowAI.</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-error-hl border border-error/20 rounded-xl flex items-center gap-3 text-red-200 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleReset} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-black text-faint ml-1">Correo Electrónico</label>
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-surface border border-divider rounded-xl px-4 py-3.5 text-foreground placeholder:text-faint outline-none focus:border-primary/30 transition-all"
                  placeholder="ejemplo@clinica.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-surface rounded-xl font-bold text-foreground shadow-xl shadow-sm flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-border border-t-white rounded-full animate-spin" />
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
