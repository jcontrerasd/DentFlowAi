'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, ArrowLeft, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { resetPasswordAction } from '@/lib/db/actions/auth';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary/30 border-t-teal-500 rounded-full animate-spin" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('El enlace no es válido. Solicita uno nuevo desde "¿Olvidaste tu clave?".');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const result = await resetPasswordAction(token, password);
    setLoading(false);

    if (!result.success) {
      setError(result.error || 'No se pudo restablecer la contraseña.');
      return;
    }

    setDone(true);
    setTimeout(() => router.push('/auth/login'), 2000);
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
        className="w-full max-w-md bg-surface shadow-sm border border-divider p-8 rounded-3xl relative z-10"
      >
        <Link href="/auth/login" className="inline-flex items-center gap-2 text-faint hover:text-primary transition-colors text-sm mb-8 font-medium">
          <ArrowLeft className="w-4 h-4" />
          Volver al Inicio
        </Link>

        {done ? (
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-primary-hl text-primary rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-4">Contraseña actualizada</h2>
            <p className="text-muted mb-2">Ya puedes iniciar sesión con tu nueva contraseña.</p>
          </div>
        ) : (
          <>
            <div className="mb-10 text-center">
              <div className="w-16 h-16 bg-surface border border-divider rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl serif-font text-foreground mb-2">Nueva Contraseña</h1>
              <p className="text-muted text-sm">Define una contraseña nueva para tu cuenta.</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-error-hl border border-error/20 rounded-xl flex items-center gap-3 text-red-200 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-black text-faint ml-1">Contraseña nueva</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface border border-divider rounded-xl px-4 py-3.5 text-foreground placeholder:text-faint outline-none focus:border-primary/30 transition-all"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-faint">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-black text-faint ml-1">Confirmar contraseña</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-surface border border-divider rounded-xl px-4 py-3.5 text-foreground placeholder:text-faint outline-none focus:border-primary/30 transition-all"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-surface rounded-xl font-bold text-foreground shadow-xl shadow-sm flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all"
              >
                {loading ? <div className="w-5 h-5 border-2 border-border border-t-white rounded-full animate-spin" /> : 'Restablecer Contraseña'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
