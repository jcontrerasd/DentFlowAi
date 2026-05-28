'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, Mail, Lock } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { checkUserStatusAction } from '@/lib/db/actions/user';
import AuthNavbar from '@/components/auth/AuthNavbar';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary/30 border-t-teal-500 rounded-full animate-spin" /></div>}>
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 pt-28 relative overflow-hidden">
      <AuthNavbar />
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-surface-2 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-hl blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-surface shadow-sm border border-divider p-8 sm:p-12 rounded-[2.5rem] relative z-10 border border-divider"
      >
        <div className="text-center mb-10">
          <Image src="/dentflowai.jpg" alt="DentFlowAi" width={64} height={64} className="w-16 h-16 mx-auto mb-4 rounded-xl object-cover" />
          {/* Fix: eliminado 'italic' duplicado */}
          <h1 className="text-5xl serif-font italic text-foreground mb-2">DentFlowAI.</h1>
          <p className="text-faint text-xs tracking-widest uppercase font-black">Panel de Acceso</p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-900/10 border border-error/30 rounded-2xl flex items-center gap-3 text-red-200 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-1.5 transition-transform">
            <label className="block text-[10px] uppercase tracking-widest font-black text-faint mb-2 ml-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface/30 border border-divider rounded-2xl pl-12 pr-4 py-4 text-foreground placeholder:text-faint focus:border-primary/30 outline-none transition-all"
                placeholder="ejemplo@dentflow.ai"
              />
            </div>
          </div>

          <div className="space-y-1.5 transition-transform">
            <div className="flex justify-between items-center mb-2 ml-1">
              <label className="block text-[10px] uppercase tracking-widest font-black text-faint">Contraseña</label>
              <Link href={`/auth/forgot-password?email=${encodeURIComponent(email)}`} className="text-[10px] text-primary hover:text-primary font-bold uppercase tracking-wider transition-colors">
                ¿Olvidaste la clave?
              </Link>
            </div>
            <div className="relative">
              {/* Fix: reemplazado el SVG manual 'Locke' (typo) por Lock de lucide-react */}
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface/30 border border-divider rounded-2xl pl-12 pr-4 py-4 text-foreground placeholder:text-faint focus:border-primary/30 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-16 bg-surface rounded-2xl font-bold uppercase tracking-wider text-foreground shadow-xl shadow-sm flex items-center justify-center gap-3 mt-4 transition-all"
          >
            {loading ? <div className="w-5 h-5 border-2 border-border border-t-white rounded-full animate-spin" /> : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="mt-12 text-center text-[10px] uppercase tracking-widest font-black">
          <span className="text-faint">¿No tienes acceso? </span>
          <Link href="/auth/register" className="text-primary hover:text-primary transition-colors ml-1">
            Inscríbete en DentFlowAI
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
