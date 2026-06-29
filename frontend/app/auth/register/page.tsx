'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Stethoscope,
  ShieldCheck,
  Building2,
  RefreshCcw,
  HelpCircle,
  AlertCircle,
  X,
  Trash2,
} from 'lucide-react';
import FocusTrap from '@/components/ui/FocusTrap';
import { REGIONS_BY_COUNTRY, SUPPORTED_COUNTRIES } from '@/lib/constants/addressData';
import { formatPhone } from '@/lib/formatPhone';
import { useSession, signIn, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import AuthNavbar from '@/components/auth/AuthNavbar';

// NATIVE SERVER ACTIONS
import { createUserAction, updateUserAction, getUserProfileDirect, discardOnboardingAccountAction, getGoogleOAuthEnabledAction, checkUserStatusAction, getEmailVerificationEnabledAction } from '@/lib/db/actions/user';
import { requestEmailVerificationAction, getVerificationExpiryAction } from '@/lib/db/actions/auth';
import SkillMatrixForm from '@/components/profile/SkillMatrixForm';
import {
  createOrganizationAction,
  updateOrganizationDetailsAction,
} from '@/lib/db/actions/organization';
import {
  hydrateOnboardingFormData,
  mapOnboardingStepToUiStep,
  resolveOnboardingRole,
} from '@/lib/auth/onboardingHydration';

type AppRole = 'dentista' | 'tecnico';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const HelperTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-1 align-middle">
    <HelpCircle className="w-3.5 h-3.5 text-faint hover:text-primary cursor-help transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-3 bg-surface/95 backdrop-blur-xl border border-divider rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2">
      <p className="text-[10px] text-muted font-medium leading-relaxed">{text}</p>
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900/95" />
    </div>
  </div>
);

const PasswordStrength = ({ password }: { password: string }) => {
  const checks = [
    { label: '6+ caracteres', ok: password.length >= 6 },
    { label: 'Mayúscula', ok: /[A-Z]/.test(password) },
    { label: 'Número', ok: /\d/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['bg-error', 'bg-warning-hl', 'bg-jade-hl'];
  const labels = ['Débil', 'Regular', 'Segura'];

  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1.5">
        {[0,1,2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i < score ? colors[score - 1] : 'bg-surface-2'}`} />
        ))}
      </div>
      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          {checks.map(c => (
            <span key={c.label} className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${c.ok ? 'text-primary' : 'text-faint'}`}>
              <span className={`w-1 h-1 rounded-full ${c.ok ? 'bg-primary' : 'bg-surface-off'}`} />
              {c.label}
            </span>
          ))}
        </div>
        {score > 0 && (
          <span className={`text-[9px] font-black uppercase ${score === 3 ? 'text-jade' : score === 2 ? 'text-warning' : 'text-error'}`}>
            {labels[score - 1]}
          </span>
        )}
      </div>
    </div>
  );
};

const getSteps = (role: AppRole) => {
  if (role === 'tecnico') {
    return [
      { title: 'Cuenta',      icon: Mail },
      { title: 'Rol',         icon: User },
      { title: 'Tu Perfil',   icon: User },
      { title: 'Laboratorio', icon: Building2 },
      { title: 'Habilidades', icon: ShieldCheck },
      { title: 'Legal',       icon: ShieldCheck },
    ];
  }
  return [
    { title: 'Cuenta',     icon: Mail },
    { title: 'Rol',        icon: User },
    { title: 'Tu Perfil',  icon: Stethoscope },
    { title: 'Tu Clínica', icon: Building2 },
    { title: 'Legal',      icon: ShieldCheck },
  ];
};

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [role, setRole] = useState<AppRole>('dentista');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [hasSyncLoaded, setHasSyncLoaded] = useState(false);
  const [isAwaitingVerification, setIsAwaitingVerification] = useState(false);
  // Ref (no state) para cerrar la carrera entre el auto-login de handleCreateAccount y el
  // efecto de sync de sesión: el cambio de `session` que dispara signIn() puede llegar antes
  // de que el setState de isAwaitingVerification se refleje en un nuevo render. Un ref se lee
  // de forma síncrona, así que el guard del efecto de sync nunca lo pierde por timing de React.
  const justRegisteredRef = useRef(false);
  const [isAlreadyRegistered, setIsAlreadyRegistered] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(false);

  useEffect(() => {
    getGoogleOAuthEnabledAction().then((r) => setGoogleEnabled(r.enabled));
    getEmailVerificationEnabledAction().then((r) => setEmailVerificationEnabled(r.enabled));
  }, []);

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError(null);
    await signIn('google', { callbackUrl: '/dashboard' });
  };

  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { refreshProfile } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState('');

  // "Arrastra" el email desde /auth/login cuando el usuario intentó entrar con un correo no
  // registrado y usó el link "Regístrate aquí" (?email=...). Lectura directa de
  // window.location en vez de useSearchParams para no forzar un boundary <Suspense> en esta
  // página (100% cliente, sin SSR que optimizar). Solo aplica si el campo sigue vacío, para no
  // pisar el valor ya hidratado desde una sesión real (ver efecto de sync con NextAuth abajo).
  useEffect(() => {
    if (email) return;
    const params = new URLSearchParams(window.location.search);
    const prefillEmail = params.get('email');
    if (prefillEmail) setEmail(prefillEmail);
  }, [email]);

  // ── Espera de verificación de correo (paso "Cuenta") ──────────────────────
  // 15 min: debe coincidir exactamente con el TTL real del token
  // (getVerificationTtlMinutes en lib/db/actions/auth.ts) — si no coinciden, "venció"
  // en esta pantalla podría no ser cierto (o viceversa).
  const VERIFY_WINDOW_SECONDS = 15 * 60;
  const [verifySecondsLeft, setVerifySecondsLeft] = useState(VERIFY_WINDOW_SECONDS);
  const [verifyExpired, setVerifyExpired] = useState(false);
  const [verifyResending, setVerifyResending] = useState(false);
  const [verifyResent, setVerifyResent] = useState(false);
  const [verifyPollGeneration, setVerifyPollGeneration] = useState(0);
  // Aviso no bloqueante (no cambia el flujo en absoluto) de que esta misma inscripción está
  // abierta en otra pestaña ahora mismo — vía BroadcastChannel, la única forma de distinguir
  // "otra pestaña viva" de "esto es un simple F5" (que pierde el estado de React igual, pero no
  // tiene a nadie del otro lado para responder el ping).
  const [siblingTabDetected, setSiblingTabDetected] = useState(false);
  // Cuando OTRA pestaña detecta primero la confirmación, esta se queda quieta en vez de
  // avanzar también al wizard (antes, las dos pestañas que esperaban entraban a "Rol" al mismo
  // tiempo — confuso y redundante). Se decide por "primero en avisar" vía el mismo
  // BroadcastChannel: la pestaña que detecta la verificación reclama explícitamente antes de
  // avanzar; cualquier otra que reciba ese reclamo se detiene aquí.
  const [verificationClaimedElsewhere, setVerificationClaimedElsewhere] = useState(false);

  // Mientras se espera la confirmación: countdown de 15 min (sincronizado con el TTL real
  // del token vía getVerificationExpiryAction) + polling cada 3s a checkUserStatusAction para
  // detectar que el usuario ya hizo clic en el link del correo (no hay token en esta pantalla,
  // así que no podemos esperar una redirección — sondeamos el estado real en la BD).
  // `verifyPollGeneration` se incrementa al reenviar para reiniciar el ciclo completo
  // (countdown + polling) sin duplicar intervalos.
  useEffect(() => {
    if (!isAwaitingVerification) return;
    setVerifyExpired(false);
    setSiblingTabDetected(false);
    setVerificationClaimedElsewhere(false);

    let countdownId: ReturnType<typeof setInterval> | undefined;
    let pollId: ReturnType<typeof setInterval> | undefined;
    let beaconId: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    // Ref (no state) para que el callback del polling, más abajo, vea el reclamo de inmediato —
    // un setState no se refleja sincrónicamente dentro del mismo closure.
    const claimedByOtherRef = { current: false };

    // Presencia entre pestañas (informativa, no bloqueante): cada pestaña que espera
    // verificación emite un latido cada 2s con su email; si llega un latido ajeno con el MISMO
    // email, hay otra pestaña viva ahora mismo (un BroadcastChannel nunca recibe los mensajes
    // que él mismo envía, así que no hace falta filtrar por id de instancia). Si no se ven
    // latidos por >5s, se asume que la otra pestaña se cerró y se retira el aviso.
    //
    // Mismo canal también se usa para el "reclamo" de verificación (ver pollId más abajo).
    let siblingChannel: BroadcastChannel | undefined;
    let lastSiblingSeenAt = 0;
    if (typeof BroadcastChannel !== 'undefined') {
      siblingChannel = new BroadcastChannel('dfa-register-verify-wait');
      siblingChannel.onmessage = (ev) => {
        if (!ev?.data || ev.data.email !== email) return;
        if (ev.data.type === 'verified-claim') {
          claimedByOtherRef.current = true;
          if (countdownId) clearInterval(countdownId);
          if (pollId) clearInterval(pollId);
          setIsAwaitingVerification(false);
          setVerificationClaimedElsewhere(true);
          return;
        }
        lastSiblingSeenAt = Date.now();
        setSiblingTabDetected(true);
      };
      beaconId = setInterval(() => {
        siblingChannel?.postMessage({ email });
        if (lastSiblingSeenAt && Date.now() - lastSiblingSeenAt > 5000) {
          setSiblingTabDetected(false);
        }
      }, 2000);
    }

    const setup = async () => {
      // Tiempo restante REAL del token (no siempre 15 min completos): si esta pestaña se
      // montó después de que otra ya inició la espera (mismo registro, pestaña nueva), el
      // countdown debe arrancar donde realmente está el token, no resetear a 15:00.
      const { expiresAt } = await getVerificationExpiryAction(email);
      if (cancelled) return;
      const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : Date.now() + VERIFY_WINDOW_SECONDS * 1000;

      const computeSecondsLeft = () => Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));

      const initialSeconds = computeSecondsLeft();
      setVerifySecondsLeft(initialSeconds);

      if (initialSeconds <= 0) {
        setVerifyExpired(true);
        return;
      }

      // Recalcula contra `expiresAtMs` (deadline absoluto) en cada tick, en vez de solo
      // restar 1 — los navegadores pausan/ralentizan los timers de pestañas en segundo plano,
      // así que un decremento puro se atrasa respecto al reloj real. Recomputar siempre desde
      // el deadline absoluto se autocorrige apenas la pestaña vuelve a primer plano.
      countdownId = setInterval(() => {
        const secondsLeft = computeSecondsLeft();
        if (secondsLeft <= 0) {
          if (countdownId) clearInterval(countdownId);
          setVerifySecondsLeft(0);
          setVerifyExpired(true);
          return;
        }
        setVerifySecondsLeft(secondsLeft);
      }, 1000);

      pollId = setInterval(async () => {
        const status = await checkUserStatusAction(email);
        if (status.exists && status.emailVerified) {
          if (claimedByOtherRef.current) {
            // El mensaje 'verified-claim' de la otra pestaña ya hizo todo el cleanup
            // correspondiente (ver onmessage arriba) — esta pestaña no avanza también.
            return;
          }
          // Reclama ANTES de avanzar: si la otra pestaña detecta lo mismo casi al mismo
          // tiempo, este mensaje la frena a ella en vez de que las dos entren al wizard juntas.
          siblingChannel?.postMessage({ type: 'verified-claim', email });
          if (countdownId) clearInterval(countdownId);
          if (pollId) clearInterval(pollId);
          setIsAwaitingVerification(false);
          // Esta pestaña puede ya estar autenticada (caso: se abrió una pestaña nueva de
          // /auth/register mientras otra esperaba verificación — ver guard de emailVerified en
          // el efecto de sync de sesión). Solo se hace signIn con email/password cuando esta
          // pestaña es la que originó el registro y todavía no tiene sesión.
          if (authStatus !== 'authenticated') {
            await signIn('credentials', { email, password, redirect: false });
          }
          setStep(1);
        }
      }, 3000);
    };

    setup();

    return () => {
      cancelled = true;
      if (countdownId) clearInterval(countdownId);
      if (pollId) clearInterval(pollId);
      if (beaconId) clearInterval(beaconId);
      siblingChannel?.close();
    };
  }, [isAwaitingVerification, verifyPollGeneration, email, password, authStatus]);

  const handleResendVerification = async () => {
    setVerifyResending(true);
    setVerifyResent(false);
    try {
      await requestEmailVerificationAction(email);
      setVerifyResent(true);
      setVerifyPollGeneration((g) => g + 1);
    } finally {
      setVerifyResending(false);
    }
  };

  // El usuario decide explícitamente seguir en ESTA pestaña aunque otra ya haya avanzado
  // primero (ver verificationClaimedElsewhere) — mismo paso que el polling normal habría hecho.
  const handleContinueHereAfterClaim = async () => {
    if (authStatus !== 'authenticated') {
      await signIn('credentials', { email, password, redirect: false });
    }
    setVerificationClaimedElsewhere(false);
    setStep(1);
  };

  const [formData, setFormData] = useState({
    userId: '',
    orgId: '',
    orgName: '',
    phone: '',
    country: 'CL',
    region: '',
    comuna: '',
    address: '',
    addressNumber: '',
    addressOffice: '',
    specialty: 'Odontología General',
    registrationNumber: '',
    experienceYears: '',
    taxId: '',
    giro: '',
    legalAddress: '',
  });

  const [consent, setConsent] = useState(false);

  // Cancelar / descartar inscripción a medio terminar
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // ── Sync with Native Session ──────────────────────────────────────────────
  // Mientras se espera la confirmación de correo (paso "Cuenta"), este efecto debe quedarse
  // quieto: el auto-login de handleCreateAccount dispara un cambio de `session` que, sin este
  // guard, hace fetchProfile → setStep(mapOnboardingStepToUiStep(0, role)) → salta directo a
  // "Rol" e ignora isAwaitingVerification. Una vez confirmado el correo, el propio efecto de
  // polling ya hace signIn + setStep(1); este efecto puede correr después sin pisar nada.
  useEffect(() => {
    if (authStatus === 'loading' || hasSyncLoaded || isAwaitingVerification || justRegisteredRef.current) return;

    if (session?.user) {
      const sUser = session.user as any;
      setFormData(prev => ({ ...prev, userId: sUser.id || '' }));
      if (!fullName) setFullName(sUser.name || '');
      if (!email) setEmail(sUser.email || '');

      const fetchProfile = async () => {
        const profile = await getUserProfileDirect(sUser.id);
        if (profile) {
          const stepValue = profile.onboardingStep || 0;
          if (stepValue === 100) { router.replace('/dashboard'); return; }

          // Auditoría: una pestaña NUEVA de /auth/register (sesión ya autenticada desde otra
          // pestaña, p. ej. mientras la primera sigue esperando verificación) — o un simple F5
          // de la MISMA pestaña, que pierde todo el estado de React y se ve igual — llegaba
          // directo aquí y saltaba a "Rol" sin chequear nada de email. Se consulta el flag
          // fresco (no el state del componente, que puede no haber cargado todavía en esta
          // pestaña recién montada) para no repetir la misma carrera que ya se corrigió para
          // el auto-login. El countdown de abajo ya recalcula contra la hora real de expiración
          // (no decrementa a ciegas), así que entrar directo es seguro incluso si hay más de
          // una pestaña abierta — ambas cuentan correctamente contra el mismo deadline real.
          if (!profile.emailVerified) {
            const { enabled: verificationRequiredNow } = await getEmailVerificationEnabledAction();
            if (verificationRequiredNow) {
              if (profile.email) setEmail(profile.email);
              setIsAwaitingVerification(true);
              return;
            }
          }

          const resolvedRole = resolveOnboardingRole(profile.role);
          setRole(resolvedRole);

          if (profile.fullName) setFullName(profile.fullName);
          if (profile.email) setEmail(profile.email);

          setFormData(prev => hydrateOnboardingFormData(profile, prev, sUser.id || ''));

          if (profile.organization?.id) {
            window.localStorage.setItem('onboardingOrgId', profile.organization.id);
          }

          setStep(mapOnboardingStepToUiStep(stepValue, resolvedRole));
          setHasSyncLoaded(true);
        } else {
          setStep(1);
          setHasSyncLoaded(true);
        }
      };
      fetchProfile();
    }
  }, [session, authStatus, hasSyncLoaded, isAwaitingVerification, router, fullName, email]);

  useEffect(() => {
    if (step > maxStep) setMaxStep(step);
    setError(null); // Clear errors on step change
  }, [step, maxStep]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const formatPhoneInput = (val: string) => formatPhone(val);

  const formatRut = (val: string): string => {
    const clean = val.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length <= 1) return clean;
    const verifier = clean.slice(-1);
    const body = clean.slice(0, -1);
    const bodyFormatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${bodyFormatted}-${verifier}`;
  };

  // ── HANDLERS (Integrated with Server Actions) ─────────────────────────────

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    setError(null);
    try {
      const newUser = await createUserAction({ 
        email, 
        password, 
        // Rol provisional hasta paso 1 (handleSetupRole lo sobrescribe).
        role: 'dentista',
        fullName 
      });
      
      if (!newUser?.success || !newUser.data) throw new Error(newUser?.error || 'Error al crear usuario.');

      setFormData(prev => ({
        ...prev,
        userId: newUser.data.id,
        orgId: newUser.data.organizationId || ''
      }));

      if (emailVerificationEnabled) {
        // Bloquea el efecto de sync de sesión ANTES de iniciar sesión — el signIn de abajo
        // dispara un cambio de `session` casi de inmediato, y sin esto el efecto de sync
        // alcanza a correr y saltar a "Rol" antes de que isAwaitingVerification (un setState,
        // no síncrono) se refleje.
        justRegisteredRef.current = true;
      }

      // AUTO-LOGIN: Iniciamos sesión automáticamente (necesario para que Cancelar pueda
      // resolver identidad real y descartar la cuenta si el usuario abandona la espera).
      await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      // PERSISTENCIA DE EMERGENCIA
      window.localStorage.setItem('onboardingUserId', newUser.data.id);
      if (newUser.data.organizationId) {
        window.localStorage.setItem('onboardingOrgId', newUser.data.organizationId);
      }

      if (emailVerificationEnabled) {
        // Fase 3 (ajuste login): el wizard se queda en el paso "Cuenta" esperando la
        // confirmación del correo antes de avanzar a "Rol" (ver efecto de polling arriba).
        await requestEmailVerificationAction(email);
        setIsAwaitingVerification(true);
      } else {
        setStep(1);
      }
    } catch (err: any) {
      setError(err.message || 'Error en el registro.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupRole = async () => {
    setLoading(true);
    setError(null);
    try {
      // Priorizar formData.userId (establecido al crear la cuenta) sobre session.user.id
      // que puede ser stale si el admin crea el usuario desde su propio navegador
      const userId = formData.userId || window.localStorage.getItem('onboardingUserId') || (session?.user as any)?.id;

      if (!userId) {
        throw new Error('Sesión no encontrada. Por favor, intenta registrarte de nuevo.');
      }

      let currentOrgId = formData.orgId || window.localStorage.getItem('onboardingOrgId');
      
      if (!currentOrgId && userId) {
        const profile = await getUserProfileDirect(userId);
        if (profile?.organization?.id) {
          currentOrgId = profile.organization.id;
        }
      }

      if (!currentOrgId) {
        const orgResult = await createOrganizationAction({
          name: `Temporal - ${email}`,
          type: role === 'dentista' ? 'clinica' : 'laboratorio',
          isActive: true
        });
        if (orgResult.success && orgResult.data) {
          currentOrgId = orgResult.data.id;
        } else {
          throw new Error(orgResult.error || 'Error al inicializar organización.');
        }
      }

      const userUpdate = await updateUserAction(userId, {
        organizationId: currentOrgId,
        role: role,
        onboardingStep: 20,
      });

      if (!userUpdate.success) throw new Error(userUpdate.error || 'Error al actualizar el perfil.');

      setFormData(prev => ({ ...prev, orgId: currentOrgId || '' }));
      window.localStorage.setItem('onboardingOrgId', currentOrgId!);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Error en configuración de rol.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfessional = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) { setError('Ingresa tu nombre completo.'); return; }
    setLoading(true);
    try {
      const userId = formData.userId || window.localStorage.getItem('onboardingUserId') || (session?.user as any)?.id;
      if (!userId) throw new Error('Usuario no identificado.');

      const result = await updateUserAction(userId, {
        fullName,
        phone: formData.phone,
        country: formData.country,
        region: formData.region || null,
        comuna: formData.comuna || null,
        address: formData.address || null,
        addressNumber: formData.addressNumber || null,
        addressOffice: formData.addressOffice || null,
        ...(role === 'dentista' ? {
          specialty: formData.specialty,
          registrationNumber: formData.registrationNumber,
        } : {
          experienceYears: formData.experienceYears ? parseInt(formData.experienceYears) : undefined,
        }),
        onboardingStep: 50,
      });
      if (!result.success) throw new Error(result.error || 'No se pudo guardar la información profesional.');
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Error al guardar datos profesionales.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTaxData = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userId = formData.userId || window.localStorage.getItem('onboardingUserId') || (session?.user as any)?.id;
      if (!userId) throw new Error('Usuario no identificado.');

      // Recuperación de emergencia o creación en caliente
      let targetOrgId = formData.orgId || window.localStorage.getItem('onboardingOrgId');

      if (!targetOrgId) {
        const newOrgResult = await createOrganizationAction({
          name: formData.orgName || `Clínica de ${fullName || email}`,
          type: role === 'dentista' ? 'clinica' : 'laboratorio',
          isActive: true
        });
        if (newOrgResult.success && newOrgResult.data) {
          targetOrgId = newOrgResult.data.id;
          await updateUserAction(userId, { organizationId: targetOrgId });
          window.localStorage.setItem('onboardingOrgId', targetOrgId || '');
        } else throw new Error('Error al crear organización.');
      }

      const orgResult = await updateOrganizationDetailsAction(targetOrgId!, {
        name: formData.orgName,
        rut: formData.taxId,
        giro: formData.giro,
        legalAddress: formData.legalAddress,
      });
      if (!orgResult.success) throw new Error(orgResult.error || 'Error al actualizar organización.');
      const nextOnboardingStep = role === 'tecnico' ? 65 : 75;
      const userResult = await updateUserAction(userId, { onboardingStep: nextOnboardingStep });
      if (!userResult.success) throw new Error(userResult.error || 'Error al vincular paso de facturación.');
      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Error al guardar datos de facturación.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!consent) return;
    setLoading(true);
    try {
      const userId = formData.userId || window.localStorage.getItem('onboardingUserId') || (session?.user as any)?.id;
      if (!userId) throw new Error('Usuario no identificado.');

      const result = await updateUserAction(userId, { onboardingStep: 100 });
      if (!result.success) throw new Error(result.error || 'No se pudo finalizar la inscripción.');

      window.localStorage.removeItem('onboardingData');
      window.localStorage.removeItem('onboardingUserId');
      window.localStorage.removeItem('onboardingOrgId');

      // Sync AuthContext so DashboardLayout sees onboardingStep=100 immediately
      await refreshProfile();

      setStep(10);
    } catch (err: any) {
      setError(err.message || 'Error al finalizar la inscripción.');
    } finally {
      setLoading(false);
    }
  };

  // ── CANCELAR / DESCARTAR INSCRIPCIÓN ──────────────────────────────────────
  const hasOnboardingAccount = () =>
    !!(formData.userId || window.localStorage.getItem('onboardingUserId') || (session?.user as any)?.id);

  const requestCancel = () => {
    // Si ya hay una cuenta creada en curso, confirmar el borrado destructivo.
    // Si aún no existe cuenta (paso 0), ir directo al home sin fricción.
    if (hasOnboardingAccount()) {
      setShowCancelConfirm(true);
    } else {
      router.push('/');
    }
  };

  const handleCancelRegistration = async () => {
    setCancelling(true);
    try {
      // Descartar la cuenta ANTES de cerrar sesión (la action resuelve identidad
      // desde la sesión real).
      await discardOnboardingAccountAction();
    } catch {
      // best-effort: aunque falle el borrado, igual salimos limpiando la sesión.
    } finally {
      window.localStorage.removeItem('onboardingData');
      window.localStorage.removeItem('onboardingUserId');
      window.localStorage.removeItem('onboardingOrgId');
      // signOut destruye la sesión y redirige al home, que ya renderiza limpio.
      await signOut({ callbackUrl: '/' });
    }
  };

  const isStepUnlocked = (i: number) => i <= step || i <= maxStep;

  // ── ESPERANDO RESOLVER SESIÓN EXISTENTE ────────────────────────────────────
  // Si ya hay sesión (p. ej. pestaña nueva del mismo navegador, o refresh a mitad del wizard),
  // el efecto de sync de arriba decide async qué mostrar (Rol, el countdown de verificación,
  // etc.) — sin este guard, el paso 0 (form de "Crea tu identidad") se renderiza primero y
  // recién después cambia, generando un flash confuso. No aplica cuando `justRegisteredRef`
  // está activo: ese es el propio auto-login de handleCreateAccount, que ya tiene su propio
  // estado de `loading` en el botón.
  const sessionStillResolving = !justRegisteredRef.current && (
    authStatus === 'loading' ||
    (!!session?.user && !hasSyncLoaded && !isAwaitingVerification && !isAlreadyRegistered)
  );
  if (sessionStillResolving) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ── YA REGISTRADO: sesión activa con onboarding completo ──────────────────
  if (isAlreadyRegistered) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 gap-8">
        <div className="text-center">
          <h1 className="text-5xl serif-font italic mb-2">DentFlowAI.</h1>
          <p className="text-faint text-xs tracking-widest uppercase font-black">Sesión activa detectada</p>
        </div>
        <div className="w-full max-w-sm bg-surface shadow-sm border border-divider p-8 rounded-[2.5rem] border border-divider space-y-6 text-center">
          <div className="w-16 h-16 bg-primary-hl rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground mb-1">Tu cuenta ya está activa</h2>
            <p className="text-faint text-xs leading-relaxed">Ya tienes una sesión iniciada con una cuenta registrada. ¿Qué deseas hacer?</p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => router.replace('/dashboard')}
              className="w-full h-12 bg-surface rounded-2xl font-black text-xs uppercase tracking-widest text-foreground"
            >
              Ir al Dashboard
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/register' })}
              className="w-full h-12 bg-surface border border-divider rounded-2xl font-black text-xs uppercase tracking-widest text-muted hover:text-foreground hover:border-divider transition-all"
            >
              Cerrar sesión y registrar nueva cuenta
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER ORIGINAL UI v8.9 ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/25 font-sans relative overflow-hidden flex flex-col items-center justify-center px-4 pt-28 pb-20">
      <AuthNavbar />

      {/* Modal de confirmación: descartar inscripción a medio terminar */}
      {showCancelConfirm && (
        <FocusTrap active onEscape={() => { if (!cancelling) setShowCancelConfirm(false); }}>
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-surface border border-divider rounded-[2rem] shadow-2xl p-8 space-y-6">
              <div className="w-14 h-14 bg-error-hl rounded-2xl flex items-center justify-center mx-auto">
                <Trash2 className="w-7 h-7 text-error" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-black text-foreground">¿Descartar tu inscripción?</h2>
                <p className="text-faint text-xs leading-relaxed">
                  Esto eliminará la cuenta y los datos que ingresaste hasta ahora. Tu correo
                  quedará libre para registrarte de nuevo. Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleCancelRegistration}
                  disabled={cancelling}
                  className="w-full h-12 bg-error text-inverse rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {cancelling ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <><Trash2 className="w-4 h-4" /> Sí, descartar</>}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                  className="w-full h-12 bg-surface border border-divider rounded-2xl font-black text-xs uppercase tracking-widest text-muted hover:text-foreground hover:border-divider transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  Volver al registro
                </button>
              </div>
            </div>
          </div>
        </FocusTrap>
      )}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-surface-2 blur-[180px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary-hl blur-[180px] rounded-full" />
      </div>

      <div className="w-full max-w-xl relative z-10">
        <div className="text-center mb-12">
          <h1 className="text-5xl serif-font italic text-foreground mb-2 underline decoration-teal-500/30 underline-offset-8">DentFlowAI.</h1>
          <p className="text-faint text-sm tracking-widest uppercase font-black">Registro de Inscripción</p>
        </div>

        {step < 10 && (
          <div className="flex justify-center -mt-6 mb-10">
            <button
              type="button"
              onClick={requestCancel}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-divider bg-surface text-xs font-bold uppercase tracking-wider text-muted hover:text-foreground hover:border-primary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
            >
              <X className="w-4 h-4" />
              Cancelar y volver al inicio
            </button>
          </div>
        )}

        {step < 10 && !isAwaitingVerification && !verificationClaimedElsewhere && (
          <div className="flex justify-between items-center mb-12 px-2">
            {getSteps(role).map((s, i) => {
              const unlocked = isStepUnlocked(i);
              return (
                <div key={i} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { if (unlocked && i >= 1) setStep(i); }}
                    disabled={!unlocked}
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 border ${
                      step === i
                        ? 'bg-primary border-teal-400 shadow-lg shadow-sm scale-110 text-inverse'
                        : unlocked
                          ? 'bg-surface border-teal-400/50 text-primary cursor-pointer'
                          : 'bg-surface border-divider text-faint cursor-not-allowed'
                    }`}
                  >
                    <s.icon className="w-4 h-4" />
                  </button>
                  <span className={`text-[9px] uppercase font-black tracking-widest ${step === i ? 'text-primary' : unlocked ? 'text-faint' : 'text-faint'}`}>
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-surface shadow-sm border border-divider p-8 sm:p-12 rounded-[2.5rem] border border-divider relative"
          >
            {error && (
              <div className="mb-6 p-4 bg-red-900/10 border border-error/30 rounded-2xl text-red-200 text-xs font-medium flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-error flex-shrink-0" />
                {error}
              </div>
            )}

            {/* PASO 0: CREAR CUENTA — esperando confirmación de correo */}
            {step === 0 && isAwaitingVerification && (
              <div className="space-y-6 text-center">
                <div>
                  <h2 className="text-3xl serif-font italic mb-1">Confirma tu correo.</h2>
                  <p className="text-faint text-xs">
                    Te enviamos un enlace a <span className="text-foreground font-bold">{email}</span>. Ábrelo para continuar con tu inscripción.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 text-primary text-sm font-bold py-4">
                  <div className="w-4 h-4 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
                  Esperando confirmación...
                </div>
                {siblingTabDetected && (
                  <p className="text-faint text-[11px] leading-relaxed bg-surface/60 border border-divider rounded-xl px-3 py-2">
                    Esta inscripción también está abierta en otra pestaña de este navegador — cualquiera de las dos avanzará sola en cuanto confirmes el correo.
                  </p>
                )}
                {!verifyExpired ? (
                  <p className="text-faint text-xs">
                    Este enlace expira en <span className="text-foreground font-bold">{Math.floor(verifySecondsLeft / 60)}:{String(verifySecondsLeft % 60).padStart(2, '0')}</span>
                  </p>
                ) : (
                  <p className="text-error text-xs font-bold">El enlace venció. Solicita uno nuevo para seguir esperando.</p>
                )}
                {verifyResent && !verifyExpired && (
                  <p className="text-jade text-xs">Te enviamos un nuevo enlace de verificación.</p>
                )}
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={verifyResending}
                  className="w-full h-14 bg-surface border border-divider rounded-2xl font-bold uppercase tracking-wider text-foreground text-xs hover:bg-white/5 transition-all disabled:opacity-50"
                >
                  {verifyResending ? <RefreshCcw className="w-4 h-4 animate-spin mx-auto" /> : 'Reenviar enlace de verificación'}
                </button>
              </div>
            )}

            {/* PASO 0: CORREO CONFIRMADO, PERO OTRA PESTAÑA YA AVANZÓ PRIMERO */}
            {step === 0 && verificationClaimedElsewhere && !isAwaitingVerification && (
              <div className="space-y-6 text-center">
                <div>
                  <h2 className="text-3xl serif-font italic mb-1">Correo confirmado.</h2>
                  <p className="text-faint text-xs leading-relaxed">
                    Tu registro ya continuó en otra pestaña de este navegador. Puedes cerrarla, o seguir aquí mismo si prefieres continuar en este lugar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleContinueHereAfterClaim}
                  className="w-full h-14 bg-surface rounded-2xl font-bold uppercase tracking-wider text-foreground shadow-xl transition-all"
                >
                  Continuar aquí
                </button>
              </div>
            )}

            {/* PASO 0: CREAR CUENTA */}
            {step === 0 && !isAwaitingVerification && !verificationClaimedElsewhere && (
              <>
                <form onSubmit={handleCreateAccount} className="space-y-6">
                  <div>
                    <h2 className="text-3xl serif-font italic mb-1">Crea tu identidad.</h2>
                    <p className="text-faint text-xs">Acceso seguro con correo y contraseña.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                      Email <HelperTooltip text="Se usará para iniciar sesión y notificaciones." />
                    </label>
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint" placeholder="ejemplo@dentflow.ai" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                      Contraseña <HelperTooltip text="Mínimo 6 caracteres. Usa mayúsculas y números para mayor seguridad." />
                    </label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint" placeholder="••••••••" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-faint">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                    </div>
                    <PasswordStrength password={password} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                      Confirmar contraseña
                    </label>
                    <div className="relative">
                      <input type={showConfirmPassword ? 'text' : 'password'} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint" placeholder="••••••••" />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-faint">{showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                    </div>
                    {confirmPassword.length > 0 && confirmPassword !== password && (
                      <p className="text-error text-[11px] ml-1">Las contraseñas no coinciden.</p>
                    )}
                  </div>
                  <button type="submit" disabled={loading} className="w-full h-16 bg-surface rounded-2xl font-bold uppercase tracking-wider text-foreground shadow-xl flex items-center justify-center gap-3 transition-all">
                    {loading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <>Registrarme <ArrowRight className="w-5 h-5" /></>}
                  </button>
                </form>

                {googleEnabled && (
                  <>
                    <div className="flex items-center gap-3 mt-8">
                      <div className="flex-1 h-px bg-divider" />
                      <span className="text-[10px] uppercase tracking-widest font-black text-faint">o continúa con</span>
                      <div className="flex-1 h-px bg-divider" />
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleSignUp}
                      disabled={googleLoading}
                      className="w-full h-14 mt-6 bg-surface border border-divider rounded-2xl font-bold text-foreground flex items-center justify-center gap-3 hover:bg-white/5 transition-all disabled:opacity-50"
                    >
                      {googleLoading ? (
                        <RefreshCcw className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.07-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.61z" fill="#4285F4"/>
                            <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.55-1.84.87-3.06.87-2.35 0-4.34-1.58-5.05-3.71H.92v2.33C2.4 15.98 5.45 18 9 18z" fill="#34A853"/>
                            <path d="M3.95 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.27-1.72V4.95H.92A8.96 8.96 0 0 0 0 9c0 1.45.35 2.82.92 4.05l3.03-2.33z" fill="#FBBC05"/>
                            <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.57-2.57C13.46.89 11.43 0 9 0 5.45 0 2.4 2.02.92 4.95l3.03 2.33C4.66 5.16 6.65 3.58 9 3.58z" fill="#EA4335"/>
                          </svg>
                          Registrarme con Google
                        </>
                      )}
                    </button>
                  </>
                )}

                <div className="mt-12 text-center text-[10px] uppercase tracking-widest font-black">
                  <span className="text-faint">¿Ya tienes cuenta? </span>
                  <Link href="/auth/login" className="text-primary hover:text-primary transition-colors ml-1">
                    Inicia Sesión
                  </Link>
                </div>
              </>
            )}

            {/* PASO 1: ROL */}
            {step === 1 && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl serif-font italic mb-1">Configura tu Rol.</h2>
                  <p className="text-faint text-xs">Define cómo usarás DentFlowAI.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {(['dentista', 'tecnico'] as AppRole[]).map(r => (
                    <button key={r} onClick={() => setRole(r)} className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${role === r ? 'border-primary/30 bg-primary/5 shadow-lg shadow-sm' : 'border-divider bg-surface/40 hover:border-divider'}`}>
                      {r === 'dentista' ? <Stethoscope className={`w-8 h-8 ${role === r ? 'text-primary' : 'text-faint'}`} /> : <Building2 className={`w-8 h-8 ${role === r ? 'text-primary' : 'text-faint'}`} />}
                      <div className="text-center">
                        <p className={`text-xs font-bold uppercase tracking-wider ${role === r ? 'text-foreground' : 'text-faint'}`}>{r === 'dentista' ? 'Dentista' : 'Técnico'}</p>
                        <p className="text-[9px] text-faint mt-0.5">{r === 'dentista' ? 'Clínico / Solicitante' : 'Laboratorio Dental'}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={handleSetupRole} disabled={loading} className="w-full h-16 bg-surface rounded-2xl font-bold uppercase tracking-wider text-foreground shadow-xl flex items-center justify-center gap-3 transition-all">
                  {loading ? <RefreshCcw className="w-5 h-5 animate-spin mx-auto" /> : 'Siguiente'}
                </button>
              </div>
            )}

            {/* PASO 2: TU PERFIL (dentista y técnico — campos diferenciados) */}
            {step === 2 && (
              <form onSubmit={handleUpdateProfessional} className="space-y-6">
                <div>
                  <h2 className="text-3xl serif-font italic mb-1">Tu Perfil.</h2>
                  <p className="text-faint text-xs">
                    {role === 'dentista' ? 'Información clínica y de contacto.' : 'Datos del responsable del laboratorio.'}
                  </p>
                </div>

                {/* Nombre — ambos roles */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                    Nombre Completo <HelperTooltip text="Tu nombre como se mostrará en el sistema." />
                  </label>
                  <input
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint"
                    placeholder={role === 'dentista' ? 'Dr. Juan Pérez' : 'Carlos Rodríguez'}
                  />
                </div>

                {/* Teléfono — ambos roles */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                    Teléfono <HelperTooltip text="+56 9 XXXX XXXX" />
                  </label>
                  <input
                    required
                    value={formData.phone}
                    onChange={e => updateField('phone', formatPhoneInput(e.target.value))}
                    className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint"
                    placeholder="+56 9..."
                  />
                </div>

                {/* Campos exclusivos DENTISTA */}
                {role === 'dentista' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                        Especialidad <HelperTooltip text="Tu área principal de ejercicio." />
                      </label>
                      <select value={formData.specialty} onChange={e => updateField('specialty', e.target.value)} className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all">
                        <option>Odontología General</option>
                        <option>Rehabilitación Oral</option>
                        <option>Implantología</option>
                        <option>Ortodoncia</option>
                        <option>Endodoncia</option>
                        <option>Periodoncia</option>
                        <option>Cirugía Maxilofacial</option>
                        <option>Odontopediatría</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                        N° Registro <HelperTooltip text="Número de registro ante la Autoridad Sanitaria." />
                      </label>
                      <input
                        required
                        value={formData.registrationNumber}
                        onChange={e => updateField('registrationNumber', e.target.value)}
                        className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none transition-all placeholder:text-faint"
                        placeholder="123456"
                      />
                    </div>
                  </div>
                )}

                {/* Campos exclusivos TÉCNICO */}
                {role === 'tecnico' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                      Años de experiencia <HelperTooltip text="Años trabajando en laboratorio dental." />
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={formData.experienceYears}
                      onChange={e => updateField('experienceYears', e.target.value)}
                      className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint"
                      placeholder="5"
                    />
                  </div>
                )}

                {/* Dirección — ambos roles */}
                <div className="space-y-4 pt-2 border-t border-divider">
                  <p className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 mt-2">Ubicación</p>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                      País <HelperTooltip text="País donde ejerces tu profesión." />
                    </label>
                    <select
                      value={formData.country}
                      onChange={e => { updateField('country', e.target.value); updateField('region', ''); updateField('comuna', ''); }}
                      className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all"
                    >
                      {SUPPORTED_COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1">Región</label>
                      {REGIONS_BY_COUNTRY[formData.country] ? (
                        <select
                          value={formData.region}
                          onChange={e => { updateField('region', e.target.value); updateField('comuna', ''); }}
                          className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all"
                        >
                          <option value="">Selecciona región</option>
                          {REGIONS_BY_COUNTRY[formData.country].map(r => (
                            <option key={r.code} value={r.code}>{r.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={formData.region}
                          onChange={e => updateField('region', e.target.value)}
                          className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint"
                          placeholder="Región / Estado / Provincia"
                        />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1">Comuna</label>
                      {REGIONS_BY_COUNTRY[formData.country] && formData.region ? (
                        <select
                          value={formData.comuna}
                          onChange={e => updateField('comuna', e.target.value)}
                          className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all"
                        >
                          <option value="">Selecciona comuna</option>
                          {(REGIONS_BY_COUNTRY[formData.country].find(r => r.code === formData.region)?.communes ?? []).map(c => (
                            <option key={c.code} value={c.code}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={formData.comuna}
                          onChange={e => updateField('comuna', e.target.value)}
                          className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint"
                          placeholder="Comuna / Ciudad"
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1">Dirección</label>
                    <input
                      value={formData.address}
                      onChange={e => updateField('address', e.target.value)}
                      className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint"
                      placeholder="Av. Providencia"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1">Número</label>
                      <input
                        value={formData.addressNumber}
                        onChange={e => updateField('addressNumber', e.target.value)}
                        className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint"
                        placeholder="1234"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1">Oficina / Dpto.</label>
                      <input
                        value={formData.addressOffice}
                        onChange={e => updateField('addressOffice', e.target.value)}
                        className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint"
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 h-16 bg-surface rounded-2xl font-bold uppercase tracking-wider text-faint border border-divider hover:text-muted transition-all">Atrás</button>
                  <button type="submit" disabled={loading} className="flex-[2] h-16 bg-surface rounded-2xl font-bold uppercase tracking-wider text-foreground shadow-xl transition-all">{loading ? <RefreshCcw className="w-5 h-5 animate-spin mx-auto" /> : 'Continuar'}</button>
                </div>
              </form>
            )}

            {/* PASO 3: EMPRESA / LABORATORIO */}
            {step === 3 && (
              <form onSubmit={handleUpdateTaxData} className="space-y-6">
                <div>
                  <h2 className="text-3xl serif-font italic mb-1">
                    {role === 'tecnico' ? 'Tu Laboratorio.' : 'Tu Clínica.'}
                  </h2>
                  <p className="text-faint text-xs">
                    {role === 'tecnico'
                      ? 'Datos de tu laboratorio dental y capacidades técnicas.'
                      : 'Nombre y datos tributarios de tu clínica.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                    Organización <HelperTooltip text="Nombre comercial o legal de tu empresa." />
                  </label>
                  <input required value={formData.orgName.startsWith('Temporal -') ? '' : formData.orgName} onChange={e => updateField('orgName', e.target.value)} className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint" placeholder="DentFlowAi Corp..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                      RUT <HelperTooltip text="ID tributario de la organización." />
                    </label>
                    <input required value={formData.taxId} onChange={e => updateField('taxId', formatRut(e.target.value))} className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint" placeholder="12.345.678-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                      Giro <HelperTooltip text="Actividad Económica (SII)." />
                    </label>
                    <input required value={formData.giro} onChange={e => updateField('giro', e.target.value)} className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint" placeholder="Salud" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-faint ml-1 flex items-center">
                    Dirección Legal <HelperTooltip text="Dirección ante el SII." />
                  </label>
                  <input required value={formData.legalAddress} onChange={e => updateField('legalAddress', e.target.value)} className="w-full bg-surface border border-divider rounded-2xl px-5 py-4 text-foreground outline-none focus:border-primary/30 transition-all placeholder:text-faint" placeholder="Calle Ejemplo 123, Santiago" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(2)} className="flex-1 h-16 bg-surface rounded-2xl font-bold uppercase tracking-wider text-faint border border-divider hover:text-muted transition-all">Atrás</button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[2] h-16 bg-surface rounded-2xl font-bold uppercase tracking-wider text-foreground shadow-xl transition-all disabled:opacity-50"
                  >
                    {loading ? <RefreshCcw className="w-5 h-5 animate-spin mx-auto" /> : 'Validar y continuar'}
                  </button>
                </div>
              </form>
            )}

            {/* PASO 4: HABILIDADES TÉCNICAS (SOLO TÉCNICOS — standalone) */}
            {step === 4 && role === 'tecnico' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl serif-font italic mb-1">Tus Habilidades.</h2>
                  <p className="text-faint text-xs">Indica tu nivel de experiencia para cada tipo de trabajo, usando una escala del 0 al 7 (donde 0 = "No Aplico" y 7 = "Experto"). Puedes actualizar esta información en tu perfil cuando quieras. Ten en cuenta que estos niveles también pueden ajustarse automáticamente según la reputación que vayas ganando dentro del sistema.</p>
                </div>
                <SkillMatrixForm
                  compact={false}
                  onSaveSuccess={() => {
                    const userId = formData.userId || window.localStorage.getItem('onboardingUserId') || (session?.user as any)?.id;
                    if (userId) {
                      updateUserAction(userId, { onboardingStep: 80 }).then(() => setStep(5));
                    } else {
                      setStep(5);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="w-full h-14 bg-surface rounded-2xl font-bold uppercase tracking-wider text-faint border border-divider hover:text-muted transition-all text-[10px]"
                >
                  Atrás
                </button>
              </div>
            )}

            {/* PASO LEGAL: step 4 para dentista, step 5 para técnico */}
            {((role === 'dentista' && step === 4) || (role === 'tecnico' && step === 5)) && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl serif-font italic mb-1">Marco Legal.</h2>
                  <p className="text-faint text-xs">Revisa y acepta las normativas aplicables.</p>
                </div>
                <div className="p-6 bg-surface border border-divider rounded-2xl flex gap-4 cursor-pointer" onClick={() => setConsent(!consent)}>
                  <div className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all ${consent ? 'bg-primary border-primary/30' : 'border-divider'}`}>
                    {consent && <CheckCircle2 className="w-3.5 h-3.5 text-inverse" />}
                  </div>
                  <div className="space-y-4">
                    <p className="text-xs text-muted font-medium leading-relaxed">Acepto el uso de DentFlowAI bajo el cumplimiento del marco legal chileno vigente:</p>
                    <ul className="space-y-3">
                      {[
                        { href: 'https://www.bcn.cl/leychile/navegar?idNorma=1039348', label: 'Ley 20.584: Derechos y deberes pacientes' },
                        { href: 'https://www.bcn.cl/leychile/navegar?idNorma=141501', label: 'Ley 19.628: Protección vida privada' },
                        { href: 'https://www.bcn.cl/leychile/navegar?idNorma=198424', label: 'Ley 19.799: Firma electrónica' },
                      ].map(l => (
                        <li key={l.href} className="flex items-center gap-2 group">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/50 group-hover:opacity-90 transition-colors" />
                          <a href={l.href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[11px] text-muted hover:text-primary font-bold transition-colors underline decoration-slate-700 underline-offset-4">{l.label}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(role === 'tecnico' ? 4 : 3)} className="flex-1 h-16 bg-surface rounded-2xl font-bold uppercase tracking-wider text-faint border border-divider hover:text-muted transition-all text-[10px]">Atrás</button>
                  <button onClick={handleFinalize} disabled={!consent || loading} className="flex-[2] h-16 bg-surface rounded-2xl font-bold uppercase tracking-wider text-foreground shadow-xl transition-all">{loading ? <RefreshCcw className="w-5 h-5 animate-spin mx-auto" /> : 'Finalizar Inscripción'}</button>
                </div>
              </div>
            )}

            {/* PASO 10: ÉXITO */}
            {step === 10 && (
              <div className="text-center space-y-8 py-6">
                <div className="relative w-24 h-24 mx-auto">
                  <div className="absolute inset-0 bg-primary-hl rounded-full animate-ping opacity-30" />
                  <div className="relative w-full h-full bg-primary-hl rounded-full flex items-center justify-center border border-primary/30">
                    <CheckCircle2 className="w-12 h-12 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl serif-font italic">¡Inscripción Exitosa!</h2>
                  <p className="text-muted text-sm">Tu cuenta profesional está lista. Bienvenido a DentFlowAI.</p>
                </div>
                <button onClick={() => router.push('/dashboard')} className="h-16 px-12 bg-surface rounded-2xl font-bold uppercase tracking-wider text-foreground shadow-xl shadow-sm flex items-center gap-3 mx-auto hover:scale-[1.02] transition-transform">Entrar al Dashboard <ArrowRight className="w-5 h-5" /></button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

      </div>
    </div>
  );
}
