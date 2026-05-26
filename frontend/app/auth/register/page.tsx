'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User,
  Mail,
  MailCheck,
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
  Send,
} from 'lucide-react';
import { countriesByContinent } from './constants/countries';
import { useSession, signIn, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import AuthNavbar from '@/components/auth/AuthNavbar';

// NATIVE SERVER ACTIONS
import { createUserAction, updateUserAction, getUserProfileDirect } from '@/lib/db/actions/user';
import SkillMatrixForm from '@/components/profile/SkillMatrixForm';
import {
  createOrganizationAction,
  updateOrganizationDetailsAction,
} from '@/lib/db/actions/organization';

type AppRole = 'dentista' | 'tecnico';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const HelperTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-1 align-middle">
    <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-teal-400 cursor-help transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-3 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2">
      <p className="text-[10px] text-slate-300 font-medium leading-relaxed">{text}</p>
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
  const colors = ['bg-red-500', 'bg-amber-500', 'bg-emerald-500'];
  const labels = ['Débil', 'Regular', 'Segura'];

  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1.5">
        {[0,1,2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i < score ? colors[score - 1] : 'bg-slate-800'}`} />
        ))}
      </div>
      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          {checks.map(c => (
            <span key={c.label} className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${c.ok ? 'text-teal-400' : 'text-slate-700'}`}>
              <span className={`w-1 h-1 rounded-full ${c.ok ? 'bg-teal-400' : 'bg-slate-700'}`} />
              {c.label}
            </span>
          ))}
        </div>
        {score > 0 && (
          <span className={`text-[9px] font-black uppercase ${score === 3 ? 'text-emerald-400' : score === 2 ? 'text-amber-400' : 'text-red-400'}`}>
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
  const [isAlreadyRegistered, setIsAlreadyRegistered] = useState(false);

  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { refreshProfile } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [formData, setFormData] = useState({
    userId: '',
    orgId: '',
    orgName: '',
    phone: '',
    country: 'CL',
    specialty: 'Odontología General',
    registrationNumber: '',
    experienceYears: '',
    taxId: '',
    giro: '',
    legalAddress: '',
  });

  const [consent, setConsent] = useState(false);
  const [isDesigner, setIsDesigner] = useState(false);
  const [isManufacturer, setIsManufacturer] = useState(false);

  // ── Sync with Native Session ──────────────────────────────────────────────
  useEffect(() => {
    if (authStatus === 'loading' || hasSyncLoaded) return;
    
    if (session?.user) {
      const sUser = session.user as any;
      setFormData(prev => ({ ...prev, userId: sUser.id || '' }));
      if (!fullName) setFullName(sUser.name || '');
      if (!email) setEmail(sUser.email || '');

      const fetchProfile = async () => {
        const profile = await getUserProfileDirect(sUser.id);
        if (profile) {
          const stepValue = profile.onboardingStep || 0;
          if (profile.role === 'tecnico' || profile.role === 'diseñador') {
            setRole('tecnico');
          } else {
            setRole('dentista');
          }
          if (stepValue === 100) { router.replace('/dashboard'); return; }
          
          if (profile.organization?.id) {
            setFormData(prev => ({ ...prev, orgId: profile.organization!.id }));
            window.localStorage.setItem('onboardingOrgId', profile.organization.id);
          }

          if (role === 'tecnico') {
            if (stepValue >= 80)      setStep(5); // Legal
            else if (stepValue >= 65) setStep(4); // Habilidades
            else if (stepValue >= 50) setStep(3); // Laboratorio
            else if (stepValue >= 20) setStep(2); // Tu Perfil
            else                      setStep(1); // Rol
          } else {
            if (stepValue >= 75)      setStep(4); // Legal
            else if (stepValue >= 50) setStep(3); // Tu Clínica
            else if (stepValue >= 20) setStep(2); // Tu Perfil
            else                      setStep(1); // Rol
          }
          setHasSyncLoaded(true);
        } else {
          setStep(1);
          setHasSyncLoaded(true);
        }
      };
      fetchProfile();
    }
  }, [session, authStatus, hasSyncLoaded, router, fullName, email]);

  useEffect(() => {
    if (step > maxStep) setMaxStep(step);
    setError(null); // Clear errors on step change
  }, [step, maxStep]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const formatPhone = (val: string) => {
    const d = val.replace(/\D/g, '');
    if (!d) return '';
    if (d.length <= 2) return `+${d}`;
    if (d.length <= 3) return `+${d.slice(0, 2)} ${d.slice(2)}`;
    if (d.length <= 7) return `+${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3)}`;
    return `+${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)}`;
  };

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
    setLoading(true);
    setError(null);
    try {
      const newUser = await createUserAction({ 
        email, 
        password, 
        role,
        fullName 
      });
      
      if (!newUser?.success || !newUser.data) throw new Error(newUser?.error || 'Error al crear usuario.');
      
      setFormData(prev => ({ 
        ...prev, 
        userId: newUser.data.id,
        orgId: newUser.data.organizationId || ''
      }));
      
      // AUTO-LOGIN: Iniciamos sesión automáticamente para que el Dashboard funcione al final
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
      
      // Transición directa al Paso 1 para máxima velocidad
      setStep(1);
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
      // Para técnico: también guardar capacidades CAD/CAM en este paso
      if (role === 'tecnico') {
        const caps = [];
        if (isDesigner) caps.push('CAD');
        if (isManufacturer) caps.push('CAM');
        if (targetOrgId) {
          await updateOrganizationDetailsAction(targetOrgId, { technicalCapabilities: caps });
        }
      }
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

  const isStepUnlocked = (i: number) => i <= step || i <= maxStep;

  // ── YA REGISTRADO: sesión activa con onboarding completo ──────────────────
  if (isAlreadyRegistered) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4 gap-8">
        <div className="text-center">
          <h1 className="text-5xl serif-font italic mb-2">DentFlowAI.</h1>
          <p className="text-slate-500 text-xs tracking-widest uppercase font-black">Sesión activa detectada</p>
        </div>
        <div className="w-full max-w-sm glass-effect p-8 rounded-[2.5rem] border border-white/5 space-y-6 text-center">
          <div className="w-16 h-16 bg-teal-500/10 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-teal-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white mb-1">Tu cuenta ya está activa</h2>
            <p className="text-slate-500 text-xs leading-relaxed">Ya tienes una sesión iniciada con una cuenta registrada. ¿Qué deseas hacer?</p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => router.replace('/dashboard')}
              className="w-full h-12 gradient-teal rounded-2xl font-black text-xs uppercase tracking-widest text-white"
            >
              Ir al Dashboard
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/register' })}
              className="w-full h-12 bg-slate-900 border border-slate-800 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:text-white hover:border-slate-600 transition-all"
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
    <div className="min-h-screen bg-slate-950 text-white selection:bg-teal-500/30 font-sans relative overflow-hidden flex flex-col items-center justify-center px-4 pt-28 pb-20">
      <AuthNavbar />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-teal-900/10 blur-[180px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/5 blur-[180px] rounded-full" />
      </div>

      <div className="w-full max-w-xl relative z-10">
        <div className="text-center mb-12">
          <h1 className="text-5xl serif-font italic text-white mb-2 underline decoration-teal-500/30 underline-offset-8">DentFlowAI.</h1>
          <p className="text-slate-500 text-sm tracking-widest uppercase font-black">Registro de Inscripción</p>
        </div>

        {step < 10 && !isAwaitingVerification && (
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
                        ? 'bg-teal-500 border-teal-400 shadow-lg shadow-teal-500/20 scale-110 text-slate-950'
                        : unlocked
                          ? 'bg-slate-900 border-teal-400/50 text-teal-400 cursor-pointer'
                          : 'bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <s.icon className="w-4 h-4" />
                  </button>
                  <span className={`text-[9px] uppercase font-black tracking-widest ${step === i ? 'text-teal-500' : unlocked ? 'text-slate-500' : 'text-slate-700'}`}>
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
            className="glass-effect p-8 sm:p-12 rounded-[2.5rem] border border-white/5 relative"
          >
            {error && (
              <div className="mb-6 p-4 bg-red-900/10 border border-red-500/20 rounded-2xl text-red-200 text-xs font-medium flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* PASO 0: CREAR CUENTA */}
            {step === 0 && (
              <>
                <form onSubmit={handleCreateAccount} className="space-y-6">
                  <div>
                    <h2 className="text-3xl serif-font italic mb-1">Crea tu identidad.</h2>
                    <p className="text-slate-500 text-xs">Acceso seguro con correo y contraseña.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                      Email <HelperTooltip text="Se usará para iniciar sesión y notificaciones." />
                    </label>
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-700" placeholder="ejemplo@dentflow.ai" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                      Contraseña <HelperTooltip text="Mínimo 6 caracteres. Usa mayúsculas y números para mayor seguridad." />
                    </label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-700" placeholder="••••••••" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                    </div>
                    <PasswordStrength password={password} />
                  </div>
                  <button type="submit" disabled={loading} className="w-full h-16 gradient-teal rounded-2xl font-black uppercase tracking-widest text-white shadow-xl flex items-center justify-center gap-3 transition-all">
                    {loading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <>Registrarme <ArrowRight className="w-5 h-5" /></>}
                  </button>
                </form>
                <div className="mt-12 text-center text-[10px] uppercase tracking-widest font-black">
                  <span className="text-slate-700">¿Ya tienes cuenta? </span>
                  <Link href="/auth/login" className="text-teal-500 hover:text-teal-400 transition-colors ml-1">
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
                  <p className="text-slate-500 text-xs">Define cómo usarás DentFlowAI.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {(['dentista', 'tecnico'] as AppRole[]).map(r => (
                    <button key={r} onClick={() => setRole(r)} className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${role === r ? 'border-teal-500 bg-teal-500/5 shadow-lg shadow-teal-500/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'}`}>
                      {r === 'dentista' ? <Stethoscope className={`w-8 h-8 ${role === r ? 'text-teal-400' : 'text-slate-600'}`} /> : <Building2 className={`w-8 h-8 ${role === r ? 'text-teal-400' : 'text-slate-600'}`} />}
                      <div className="text-center">
                        <p className={`text-xs font-black uppercase tracking-widest ${role === r ? 'text-white' : 'text-slate-500'}`}>{r === 'dentista' ? 'Dentista' : 'Técnico'}</p>
                        <p className="text-[9px] text-slate-600 mt-0.5">{r === 'dentista' ? 'Clínico / Solicitante' : 'Laboratorio Dental'}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={handleSetupRole} disabled={loading} className="w-full h-16 gradient-teal rounded-2xl font-black uppercase tracking-widest text-white shadow-xl flex items-center justify-center gap-3 transition-all">
                  {loading ? <RefreshCcw className="w-5 h-5 animate-spin mx-auto" /> : 'Siguiente'}
                </button>
              </div>
            )}

            {/* PASO 2: TU PERFIL (dentista y técnico — campos diferenciados) */}
            {step === 2 && (
              <form onSubmit={handleUpdateProfessional} className="space-y-6">
                <div>
                  <h2 className="text-3xl serif-font italic mb-1">Tu Perfil.</h2>
                  <p className="text-slate-500 text-xs">
                    {role === 'dentista' ? 'Información clínica y de contacto.' : 'Datos del responsable del laboratorio.'}
                  </p>
                </div>

                {/* Nombre — ambos roles */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                    Nombre Completo <HelperTooltip text="Tu nombre como se mostrará en el sistema." />
                  </label>
                  <input
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-700"
                    placeholder={role === 'dentista' ? 'Dr. Juan Pérez' : 'Carlos Rodríguez'}
                  />
                </div>

                {/* Teléfono — ambos roles */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                    Teléfono <HelperTooltip text="+56 9 XXXX XXXX" />
                  </label>
                  <input
                    required
                    value={formData.phone}
                    onChange={e => updateField('phone', formatPhone(e.target.value))}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-700"
                    placeholder="+56 9..."
                  />
                </div>

                {/* Campos exclusivos DENTISTA */}
                {role === 'dentista' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                          Especialidad <HelperTooltip text="Tu área principal de ejercicio." />
                        </label>
                        <select value={formData.specialty} onChange={e => updateField('specialty', e.target.value)} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all">
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
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                          N° Registro <HelperTooltip text="Número de registro ante la Autoridad Sanitaria." />
                        </label>
                        <input
                          required
                          value={formData.registrationNumber}
                          onChange={e => updateField('registrationNumber', e.target.value)}
                          className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none transition-all placeholder:text-slate-700"
                          placeholder="123456"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                        País <HelperTooltip text="País donde ejerces tu profesión." />
                      </label>
                      <select value={formData.country} onChange={e => updateField('country', e.target.value)} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all">
                        {countriesByContinent.map(g => (
                          <optgroup key={g.continent} label={g.continent}>
                            {g.countries.map(c => (
                              <option key={c.code} value={c.code}>{c.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Campos exclusivos TÉCNICO */}
                {role === 'tecnico' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                      Años de experiencia <HelperTooltip text="Años trabajando en laboratorio dental." />
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={formData.experienceYears}
                      onChange={e => updateField('experienceYears', e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-700"
                      placeholder="5"
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 h-16 bg-slate-900 rounded-2xl font-black uppercase tracking-widest text-slate-500 border border-white/5 hover:text-slate-300 transition-all">Atrás</button>
                  <button type="submit" disabled={loading} className="flex-[2] h-16 gradient-teal rounded-2xl font-black uppercase tracking-widest text-white shadow-xl transition-all">{loading ? <RefreshCcw className="w-5 h-5 animate-spin mx-auto" /> : 'Continuar'}</button>
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
                  <p className="text-slate-500 text-xs">
                    {role === 'tecnico'
                      ? 'Datos de tu laboratorio dental y capacidades técnicas.'
                      : 'Nombre y datos tributarios de tu clínica.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                    Organización <HelperTooltip text="Nombre comercial o legal de tu empresa." />
                  </label>
                  <input required value={formData.orgName.startsWith('Temporal -') ? '' : formData.orgName} onChange={e => updateField('orgName', e.target.value)} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-700" placeholder="DentFlowAi Corp..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                      RUT <HelperTooltip text="ID tributario de la organización." />
                    </label>
                    <input required value={formData.taxId} onChange={e => updateField('taxId', formatRut(e.target.value))} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-700" placeholder="12.345.678-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                      Giro <HelperTooltip text="Actividad Económica (SII)." />
                    </label>
                    <input required value={formData.giro} onChange={e => updateField('giro', e.target.value)} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-700" placeholder="Salud" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-600 ml-1 flex items-center">
                    Dirección Legal <HelperTooltip text="Dirección ante el SII." />
                  </label>
                  <input required value={formData.legalAddress} onChange={e => updateField('legalAddress', e.target.value)} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-700" placeholder="Calle Ejemplo 123, Santiago" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(2)} className="flex-1 h-16 bg-slate-900 rounded-2xl font-black uppercase tracking-widest text-slate-500 border border-white/5 hover:text-slate-300 transition-all">Atrás</button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[2] h-16 gradient-teal rounded-2xl font-black uppercase tracking-widest text-white shadow-xl transition-all disabled:opacity-50"
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
                  <p className="text-slate-500 text-xs">Indica tu nivel de experiencia para cada tipo de trabajo, usando una escala del 0 al 7 (donde 0 = "No Aplico" y 7 = "Experto"). Puedes actualizar esta información en tu perfil cuando quieras. Ten en cuenta que estos niveles también pueden ajustarse automáticamente según la reputación que vayas ganando dentro del sistema.</p>
                </div>
                <SkillMatrixForm
                  compact={false}
                  initialCad={isDesigner}
                  initialCam={isManufacturer}
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
                  className="w-full h-14 bg-slate-900 rounded-2xl font-black uppercase tracking-widest text-slate-500 border border-white/5 hover:text-slate-300 transition-all text-[10px]"
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
                  <p className="text-slate-500 text-xs">Revisa y acepta las normativas aplicables.</p>
                </div>
                <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl flex gap-4 cursor-pointer" onClick={() => setConsent(!consent)}>
                  <div className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all ${consent ? 'bg-teal-500 border-teal-500' : 'border-slate-600'}`}>
                    {consent && <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />}
                  </div>
                  <div className="space-y-4">
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">Acepto el uso de DentFlowAI bajo el cumplimiento del marco legal chileno vigente:</p>
                    <ul className="space-y-3">
                      {[
                        { href: 'https://www.bcn.cl/leychile/navegar?idNorma=1039348', label: 'Ley 20.584: Derechos y deberes pacientes' },
                        { href: 'https://www.bcn.cl/leychile/navegar?idNorma=141501', label: 'Ley 19.628: Protección vida privada' },
                        { href: 'https://www.bcn.cl/leychile/navegar?idNorma=198424', label: 'Ley 19.799: Firma electrónica' },
                      ].map(l => (
                        <li key={l.href} className="flex items-center gap-2 group">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-500/50 group-hover:bg-teal-400 transition-colors" />
                          <a href={l.href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[11px] text-slate-300 hover:text-teal-400 font-bold transition-colors underline decoration-slate-700 underline-offset-4">{l.label}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(role === 'tecnico' ? 4 : 3)} className="flex-1 h-16 bg-slate-900 rounded-2xl font-black uppercase tracking-widest text-slate-500 border border-white/5 hover:text-slate-300 transition-all text-[10px]">Atrás</button>
                  <button onClick={handleFinalize} disabled={!consent || loading} className="flex-[2] h-16 gradient-teal rounded-2xl font-black uppercase tracking-widest text-white shadow-xl transition-all">{loading ? <RefreshCcw className="w-5 h-5 animate-spin mx-auto" /> : 'Finalizar Inscripción'}</button>
                </div>
              </div>
            )}

            {/* PASO 10: ÉXITO */}
            {step === 10 && (
              <div className="text-center space-y-8 py-6">
                <div className="relative w-24 h-24 mx-auto">
                  <div className="absolute inset-0 bg-teal-500/20 rounded-full animate-ping opacity-30" />
                  <div className="relative w-full h-full bg-teal-500/10 rounded-full flex items-center justify-center border border-teal-500/30">
                    <CheckCircle2 className="w-12 h-12 text-teal-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl serif-font italic">¡Inscripción Exitosa!</h2>
                  <p className="text-slate-400 text-sm">Tu cuenta profesional está lista. Bienvenido a DentFlowAI.</p>
                </div>
                <button onClick={() => router.push('/dashboard')} className="h-16 px-12 gradient-teal rounded-2xl font-black uppercase tracking-widest text-white shadow-xl shadow-teal-500/20 flex items-center gap-3 mx-auto hover:scale-[1.02] transition-transform">Entrar al Dashboard <ArrowRight className="w-5 h-5" /></button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

      </div>
    </div>
  );
}
