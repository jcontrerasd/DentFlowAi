'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { confirmEmailVerificationAction, requestEmailVerificationAction } from '@/lib/db/actions/auth';
import { useAuth } from '@/context/AuthContext';

function VerifyHandler() {
  const searchParams = useSearchParams();
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'pending'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    // Fase 3 (ajuste login): dashboard/layout.tsx redirige aquí con ?pending=true cuando la
    // sesión ya está creada pero el email todavía no está verificado (sin token que confirmar).
    if (!token) {
      if (searchParams.get('pending') === 'true') {
        setStatus('pending');
        return;
      }
      setStatus('error');
      setErrorMessage('Falta el token de verificación en el enlace.');
      return;
    }

    confirmEmailVerificationAction(token).then(async (result) => {
      if (result.success) {
        // El AuthContext cachea el perfil y solo lo re-pide si estaba null (ver fetchProfile en
        // AuthContext.tsx) — sin este refresh explícito, dashboard/layout.tsx sigue leyendo el
        // perfil viejo (emailVerified: null) cacheado desde el registro y redirige de vuelta
        // aquí en un loop, aunque la DB ya esté correctamente actualizada.
        await refreshProfile();
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(result.error || 'No se pudo verificar el correo.');
      }
    });
  }, [searchParams]);

  const handleResend = async () => {
    if (!resendEmail) return;
    await requestEmailVerificationAction(resendEmail);
    setResent(true);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface backdrop-blur-xl border border-divider p-10 rounded-[2rem] text-center shadow-2xl">

        <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-8">DentFlowAI · Seguridad</p>

        {status === 'verifying' && (
          <div className="animate-in fade-in duration-500">
            <div className="relative w-20 h-20 mx-auto mb-8">
              <div className="absolute inset-0 bg-primary-hl rounded-full animate-pulse" />
              <div className="relative w-full h-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
            </div>
            <h1 className="text-2xl font-black text-foreground mb-3 serif-font italic">Verificando...</h1>
          </div>
        )}

        {status === 'success' && (
          <div className="animate-in fade-in zoom-in duration-500 space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 bg-jade-hl rounded-full animate-ping opacity-30" />
              <div className="relative w-full h-full bg-jade-hl rounded-full flex items-center justify-center border border-jade/20">
                <CheckCircle2 className="w-10 h-10 text-jade" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-black text-foreground mb-2 serif-font italic">Acceso Habilitado.</h1>
              <p className="text-muted text-sm">Tu correo fue verificado exitosamente.</p>
            </div>
            {/* El link de verificación siempre abre una pestaña/ventana nueva (decisión del
                cliente de correo, no se puede evitar). Si el usuario venía del wizard de
                registro, esa pestaña original sigue esperando (polling) y avanza sola — no hay
                que redirigir esta pestaña a ningún lado por su cuenta, porque no sabemos si
                "el dashboard" es realmente a dónde debe ir (si el onboarding sigue incompleto,
                /dashboard la rebota de vuelta al wizard, lo cual contradecía el mensaje anterior
                de "Redirigiendo al Dashboard..."). Dejamos la decisión al usuario. */}
            <p className="text-faint text-xs leading-relaxed">
              Si estabas completando tu registro en otra pestaña, cierra esta — continuará sola en cuanto detecte la confirmación.
            </p>
            <button
              type="button"
              onClick={() => {
                // window.close() solo funciona si el navegador permite cerrar esta pestaña (p.
                // ej. algunos bloquean cerrar pestañas que no abrió un script). Si no hace nada,
                // el usuario la cierra manualmente — el texto de arriba ya cubre ese caso.
                window.close();
              }}
              className="w-full h-12 bg-surface border border-divider rounded-xl font-bold text-foreground text-sm hover:bg-white/5 transition-all"
            >
              Cerrar esta pestaña
            </button>
          </div>
        )}

        {status === 'pending' && (
          <div className="space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="relative w-full h-full bg-primary-hl rounded-full flex items-center justify-center border border-primary/20">
                <Loader2 className="w-10 h-10 text-primary" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground mb-2 serif-font italic">Revisa tu correo.</h1>
              <p className="text-muted text-sm">Te enviamos un enlace de verificación cuando creaste tu cuenta. Confírmalo para poder usar DentFlowAi.</p>
            </div>

            {resent ? (
              <p className="text-jade text-sm">Te enviamos un nuevo enlace de verificación.</p>
            ) : (
              <div className="space-y-3">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full bg-surface/30 border border-divider rounded-xl px-4 py-3 text-foreground placeholder:text-faint outline-none focus:border-primary/30 transition-all text-sm"
                />
                <button
                  onClick={handleResend}
                  className="w-full h-12 bg-surface border border-divider rounded-xl font-bold text-foreground text-sm hover:bg-white/5 transition-all"
                >
                  Reenviar enlace de verificación
                </button>
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="relative w-full h-full bg-error-hl rounded-full flex items-center justify-center border border-error/20">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground mb-2 serif-font italic">No pudimos verificar tu correo.</h1>
              <p className="text-muted text-sm">{errorMessage}</p>
            </div>

            {resent ? (
              <p className="text-jade text-sm">Si tu correo existe y no está verificado, te enviamos un nuevo enlace.</p>
            ) : (
              <div className="space-y-3">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full bg-surface/30 border border-divider rounded-xl px-4 py-3 text-foreground placeholder:text-faint outline-none focus:border-primary/30 transition-all text-sm"
                />
                <button
                  onClick={handleResend}
                  className="w-full h-12 bg-surface border border-divider rounded-xl font-bold text-foreground text-sm hover:bg-white/5 transition-all"
                >
                  Reenviar enlace de verificación
                </button>
              </div>
            )}

            <Link href="/auth/login" className="block text-primary hover:text-primary text-xs font-bold uppercase tracking-wider transition-colors">
              Volver al login
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    }>
      <VerifyHandler />
    </Suspense>
  );
}
