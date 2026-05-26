'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Activity, AlertCircle, Mail, Lock } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import Link from 'next/link';
import { checkUserStatusAction } from '@/lib/db/actions/user';
import AuthNavbar from '@/components/auth/AuthNavbar';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" /></div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const [email, setEmail] = useState('');
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = useSession();

  // Redirect authenticated users away from the login page
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    }
  }, [searchParams]);

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // 1. Pre-check de existencia y estado (Bloqueo Admin)
      const status = await checkUserStatusAction(email);
      
      if (!status.exists) {
        setError('Este correo electrónico no está registrado en nuestro sistema.');
        setLoading(false);
        return;
      }

      if (!status.active) {
        setError('Tu cuenta ha sido desactivada por un administrador. Contacta a soporte para más detalles.');
        setLoading(false);
        return;
      }

      // 2. Si existe y está activo, procedemos a validar la contraseña
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('La contraseña ingresada es incorrecta. Por favor, inténtalo de nuevo.');
        setLoading(false);
      }
      // On success: keep loading=true — the status='authenticated' effect handles redirect.
    } catch (err: unknown) {
      setError('Ocurrió un error al intentar iniciar sesión.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 pt-28 relative overflow-hidden">
      <AuthNavbar />
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass-effect p-8 sm:p-12 rounded-[2.5rem] relative z-10 border border-white/5"
      >
        <div className="text-center mb-10">
          <Activity className="w-12 h-12 text-teal-500 mx-auto mb-4" />
          {/* Fix: eliminado 'italic' duplicado */}
          <h1 className="text-5xl serif-font italic text-white mb-2">DentFlowAI.</h1>
          <p className="text-slate-500 text-xs tracking-widest uppercase font-black">Panel de Acceso</p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-900/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-200 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-1.5 transition-transform">
            <label className="block text-[10px] uppercase tracking-widest font-black text-slate-600 mb-2 ml-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/30 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white placeholder:text-slate-700 focus:border-teal-500/50 outline-none transition-all"
                placeholder="ejemplo@dentflow.ai"
              />
            </div>
          </div>

          <div className="space-y-1.5 transition-transform">
            <div className="flex justify-between items-center mb-2 ml-1">
              <label className="block text-[10px] uppercase tracking-widest font-black text-slate-600">Contraseña</label>
              <Link href={`/auth/forgot-password?email=${encodeURIComponent(email)}`} className="text-[10px] text-teal-600 hover:text-teal-400 font-black uppercase tracking-widest transition-colors">
                ¿Olvidaste la clave?
              </Link>
            </div>
            <div className="relative">
              {/* Fix: reemplazado el SVG manual 'Locke' (typo) por Lock de lucide-react */}
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900/30 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white placeholder:text-slate-700 focus:border-teal-500/50 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-16 gradient-teal rounded-2xl font-black uppercase tracking-widest text-white shadow-xl shadow-teal-900/20 flex items-center justify-center gap-3 mt-4 transition-all"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="mt-12 text-center text-[10px] uppercase tracking-widest font-black">
          <span className="text-slate-700">¿No tienes acceso? </span>
          <Link href="/auth/register" className="text-teal-500 hover:text-teal-400 transition-colors ml-1">
            Inscríbete en DentFlowAI
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
