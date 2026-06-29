'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FileText,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Activity,
  Shield,
  Users,
  ListChecks,
  AlertTriangle,
  Settings2,
  Bell,
  CreditCard,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useAuth } from '@/context/AuthContext';
import { getEmailVerificationEnabledAction } from '@/lib/db/actions/user';
import { validateOwnSessionAction } from '@/lib/db/actions/impersonation';
import { getSignedUrlAction } from '@/lib/db/actions/cases';
import { getMyInvitationsAction } from '@/lib/db/actions/invitations';
import { getMyHubUnreadTotalAction } from '@/lib/db/actions/hubRead';
import { subscribeHubUnreadRefresh } from '@/lib/hubUnreadEvents';
import ImpersonationSelector from '@/components/admin/ImpersonationSelector';
import ThemeToggleButton from '@/components/theme/ThemeToggleButton';
import AvailabilityBadge from '@/components/availability/AvailabilityBadge';
import { AvailabilityProvider } from '@/components/availability/AvailabilityContext';
import RolloutBanner from '@/components/availability/RolloutBanner';
import DemoEmailPreviewListener from '@/components/demo/DemoEmailPreviewListener';
import SessionHeartbeat from '@/components/auth/SessionHeartbeat';
import Image from 'next/image';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const { user, userProfile, loading, isSimulating } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [hubBellTotal, setHubBellTotal] = useState(0);
  // Fase 3 (ajuste login): null = todavía no se sabe si el flag está on. Se usa también en el
  // guard de render más abajo para no pintar el dashboard mientras esto se resuelve (mismo tipo
  // de carrera que onboardingIncomplete: sin esto, el dashboard completo se ve por un instante
  // antes de que el useEffect de abajo alcance a redirigir a /auth/verify).
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState<boolean | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (userProfile?.image) {
      // Avatares de Google (ajuste login, Fase 2) ya son una URL externa servible directo
      // (https://lh3.googleusercontent.com/...) — no son una ruta interna de GCS, así que
      // firmarla con getSignedUrlAction la rechaza como "recurso ajeno".
      if (/^https?:\/\//i.test(userProfile.image as string)) {
        setAvatarUrl(userProfile.image as string);
        return;
      }
      const fetchAvatar = async () => {
        try {
          const url = await getSignedUrlAction(userProfile.image as string);
          setAvatarUrl(url);
        } catch (err) {
          // Fallback silencioso para avatar
        }
      };
      fetchAvatar();
    }
  }, [userProfile?.image]);

  // S5-06: Cargar badge de invitaciones pendientes para técnicos
  useEffect(() => {
    if (userProfile?.role !== 'tecnico') return;
    const loadPending = async () => {
      try {
        const invs = await getMyInvitationsAction();
        setPendingInvitations(invs.filter(i => i.status === 'pending').length);
      } catch {}
    };
    loadPending();
    const interval = setInterval(loadPending, 60_000); // refresh cada minuto
    return () => clearInterval(interval);
  }, [userProfile?.role]);

  useEffect(() => {
    if (userProfile?.role !== 'dentista' && userProfile?.role !== 'tecnico') return;
    const loadHub = async () => {
      try {
        const { total } = await getMyHubUnreadTotalAction();
        setHubBellTotal(total);
      } catch {
        setHubBellTotal(0);
      }
    };
    loadHub();
    const interval = setInterval(loadHub, 60_000);
    return () => clearInterval(interval);
  }, [userProfile?.role]);

  useEffect(() => {
    if (userProfile?.role !== 'dentista' && userProfile?.role !== 'tecnico') return;
    const onFocus = () => {
      void getMyHubUnreadTotalAction().then(({ total }) => setHubBellTotal(total)).catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userProfile?.role]);

  useEffect(() => {
    if (userProfile?.role !== 'dentista' && userProfile?.role !== 'tecnico') return;
    void getMyHubUnreadTotalAction()
      .then(({ total }) => setHubBellTotal(total))
      .catch(() => {});
  }, [pathname, userProfile?.role]);

  // Refresco instantáneo de la campana cuando un caso se marca como leído.
  useEffect(() => {
    if (userProfile?.role !== 'dentista' && userProfile?.role !== 'tecnico') return;
    return subscribeHubUnreadRefresh(() => {
      void getMyHubUnreadTotalAction().then(({ total }) => setHubBellTotal(total)).catch(() => {});
    });
  }, [userProfile?.role]);

  // Fase 4 (ajuste login, single session): si otro login reemplazó esta sesión (o el cron de
  // Fase 5 la expiró por inactividad), el JWT sigue siendo válido pero nuestra fila de control
  // ya no existe — cerramos sesión client-side y avisamos por qué. Sin excepción para admin
  // (decisión del plan: simplicidad). No-op (valida true) si los flags de Fase 4/5 están off.
  useEffect(() => {
    if (loading || !user) return;
    validateOwnSessionAction().then(({ valid }) => {
      if (!valid) {
        signOut({ redirect: false }).then(() => {
          router.push('/auth/login?reason=session_replaced');
        });
      }
    });
  }, [loading, user, router]);

  // Redirigir si no hay usuario autenticado o si el onboarding no está completo
  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/auth/login');
      return;
    }

    // Bypass maestro para el dueño o para cualquier ADMIN
    if (user?.email === 'jaime.contreras.d@gmail.com' || userProfile?.role === 'admin') return;

    if (!userProfile) {
      router.push('/auth/register');
      return;
    }

    if (userProfile.onboardingStep !== 100) {
      // Solo redirigir si no estamos ya en proceso de registro
      router.push('/auth/register');
      return;
    }

    // Fase 3 (ajuste login): bloquea el dashboard si el correo no está verificado. Cubre
    // Credentials sin verificar; los usuarios de Google ya llegan con emailVerified poblado
    // por el adapter, así que esta misma condición los excluye sin lógica adicional.
    if (!userProfile.emailVerified) {
      getEmailVerificationEnabledAction().then(({ enabled }) => {
        setEmailVerificationEnabled(enabled);
        if (enabled) router.push('/auth/verify?pending=true');
      });
    }
  }, [loading, user, userProfile, router]);


  const handleLogout = async () => {
    localStorage.removeItem('dentflow_simulated_id');
    await signOut({ callbackUrl: '/auth/login' });
  };

  const menuItems = [
    // Primera posición: Dashboard para todos los roles, excepto admin que ve
    // "Observabilidad" en su lugar (solo admin).
    ...(userProfile?.role === 'admin'
      ? [{ name: 'Observabilidad', icon: Activity, href: '/dashboard/admin/observability' }]
      : [{ name: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' }]),

    // Rutas para Dentista
    ...(userProfile?.role === 'dentista' ? [
      { name: 'Casos', icon: FileText, href: '/dashboard/cases' },
      { name: 'Financiero', icon: CreditCard, href: '/dashboard/finance' },
    ] : []),

    // Rutas para Técnico (S5-06: nueva UI de invitaciones)
    ...(userProfile?.role === 'tecnico' ? [
      { name: 'Casos', icon: FileText, href: '/dashboard/cases', badge: pendingInvitations || undefined },
      { name: 'Financiero', icon: CreditCard, href: '/dashboard/finance' },
    ] : []),
    
    // Rutas para Calidad
    ...(userProfile?.role === 'calidad' ? [
      { name: 'Casos', icon: FileText, href: '/dashboard/cases' },
    ] : []),

    // Rutas para Admin (bajo "Observabilidad"). La "Zona de Alta Peligrosidad"
    // se renderiza aparte, al pie del sidebar.
    ...(userProfile?.role === 'admin' ? [
      { name: 'Motor Fauchard', icon: Settings2, href: '/dashboard/admin/fauchard' },
      { name: 'ContactGuard', icon: Shield, href: '/dashboard/admin/contactguard' },
      { name: 'Control de Usuarios', icon: Users, href: '/dashboard/admin/users' },
      { name: 'Catálogo UI', icon: ListChecks, href: '/dashboard/admin/catalogos' },
      { name: 'Precios', icon: DollarSign, href: '/dashboard/admin/prices' },
    ] : []),
  ];

  // Mismo criterio que el useEffect de arriba (redirect a /auth/register): mientras el onboarding
  // esté incompleto, mostrar el spinner en vez del dashboard. Sin esto, hay una ventana entre que
  // `userProfile` carga (ya con onboardingStep < 100) y el useEffect alcanza a redirigir, donde el
  // dashboard completo se renderiza por un instante — visible sobre todo en el flujo de Google
  // OAuth, que aterriza directo en /dashboard con un perfil recién creado en onboardingStep:20.
  const isSystemAdminBypass = user?.email === 'jaime.contreras.d@gmail.com' || userProfile?.role === 'admin';
  const onboardingIncomplete = !isSystemAdminBypass && (!userProfile || userProfile.onboardingStep !== 100);
  // Mismo problema de carrera que onboardingIncomplete, pero para la verificación de email (Fase
  // 3): mientras no sepamos si EMAIL_VERIFICATION_ENABLED está on (emailVerificationEnabled aún
  // null) hay que bloquear el render también — si no, con flag on, un usuario sin verificar ve el
  // dashboard completo durante el round-trip a getEmailVerificationEnabledAction.
  const emailUnverifiedBlocking = !isSystemAdminBypass && !!userProfile && !userProfile.emailVerified
    && emailVerificationEnabled !== false;
  if (loading || !userProfile || onboardingIncomplete || emailUnverifiedBlocking) return (
    <div className="h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary/30 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );

  const displayName = userProfile?.fullName ?? user?.name ?? 'Usuario DentFlow';

  const inner = (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full bg-surface backdrop-blur-xl border-r border-divider transition-all duration-300 z-50 ${isSidebarOpen ? 'w-64' : 'w-20'}`}
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div className="p-6 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-surface rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-sm overflow-hidden">
            <Image src="/dentflowai.jpg" alt="DentFlowAi" width={40} height={40} className="w-full h-full object-cover" />
          </div>
          {isSidebarOpen && <span className="text-xl serif-font font-bold text-foreground">DentFlowAi</span>}
        </div>

        {(userProfile?.role === 'admin' || isSimulating || user?.email === 'jaime.contreras.d@gmail.com') && (
          <div className="px-4 mb-3">
            <ImpersonationSelector onOpenChange={setIsSelectorOpen} collapsed={!isSidebarOpen} />
          </div>
        )}

        <nav className="px-4 space-y-2">
          {menuItems.map((item: any) => {
            const isActive = pathname === item.href || (
              item.href !== '/dashboard' && 
              pathname.startsWith(item.href + '/') && 
              !menuItems.some(other => other.href.length > item.href.length && pathname.startsWith(other.href))
            );
            return (
              <Link key={item.name} href={item.href}>
                <div className={`relative flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-primary-hl text-primary' : 'text-faint hover:text-muted hover:bg-surface-2'}`}>
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && <span className="font-medium">{item.name}</span>}
                  {/* Badge de invitaciones pendientes */}
                  {item.badge > 0 && (
                    <span className={`${isSidebarOpen ? 'ml-auto' : 'absolute -top-1 -right-1'} min-w-[18px] h-[18px] bg-warning-hl text-inverse text-[9px] font-black rounded-full flex items-center justify-center px-1 animate-bounce`}>
                      {item.badge}
                    </span>
                  )}
                  {isActive && isSidebarOpen && !item.badge && <motion.div layoutId="activeNav" className="ml-auto w-1 h-1 bg-primary rounded-full" />}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-8 left-0 w-full px-4 space-y-2">
          {userProfile?.role === 'admin' && (
            <Link href="/dashboard/admin/danger">
              <div
                className={`relative flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${pathname === '/dashboard/admin/danger' ? 'bg-error-hl text-error' : 'text-faint hover:text-error hover:bg-error-hl'}`}
                title="Zona de Alta Peligrosidad"
              >
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                {isSidebarOpen && <span className="font-medium">Zona de Alta Peligrosidad</span>}
              </div>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-3 text-faint hover:text-error hover:bg-error-hl rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {isSidebarOpen && <span className="font-medium">Cerrar Sesión</span>}
          </button>
        </div>

      </aside>

      {/* Toggle de colapso — fuera del aside para que hover de modales no lo active */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`fixed top-1/2 -translate-y-1/2 z-[60] w-6 h-6 rounded-full bg-surface border border-divider flex items-center justify-center text-muted shadow-sm transition-all hover:text-foreground hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${isSidebarOpen ? 'left-[calc(16rem-0.75rem)]' : 'left-[calc(5rem-0.75rem)]'} ${isSidebarHovered && !isSelectorOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-label={isSidebarOpen ? 'Colapsar menú lateral' : 'Expandir menú lateral'}
        title={isSidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
      >
        {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Main Content */}
      <main className={`transition-all duration-300 min-h-screen ${isSidebarOpen ? 'pl-64' : 'pl-20'}`}>
        <header className="h-20 border-b border-divider/50 flex items-center justify-between px-10 bg-surface shadow-sm border border-divider sticky top-0 z-40">
          <div className="flex items-center gap-4" />

          <div className="flex items-center gap-4">
            {(userProfile?.role === 'dentista' || userProfile?.role === 'tecnico') && (
              <div
                className="relative flex items-center justify-center p-2 rounded-xl text-faint hover:text-primary hover:bg-surface-2 transition-colors"
                title="Actividad sin leer en el Centro de control"
                aria-label={`Actividad del hub sin leer: ${hubBellTotal}`}
              >
                <Bell className="w-5 h-5" />
                {hubBellTotal > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-error text-inverse text-[9px] font-black rounded-full flex items-center justify-center px-0.5 shadow-lg shadow-sm">
                    {hubBellTotal > 99 ? '99+' : hubBellTotal}
                  </span>
                )}
              </div>
            )}

            {/* Badge global de disponibilidad (técnico; se auto-oculta si el flag está off) */}
            {userProfile?.role === 'tecnico' && <AvailabilityBadge />}

            {/* Toggle rápido de tema (claro / oscuro / sistema) */}
            <ThemeToggleButton />

            <Link href="/dashboard/profile">
              <div className="flex items-center gap-6 hover:bg-surface-2/40 p-2 rounded-2xl transition-all group cursor-pointer">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{displayName}</p>
                  <p className="text-[10px] uppercase tracking-wider text-primary font-bold">{userProfile.role}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-surface-2 border border-divider flex items-center justify-center text-primary font-bold overflow-hidden group-hover:border-primary/30 transition-all">
                  {avatarUrl ? (
                    <Image 
                      src={avatarUrl} 
                      alt={displayName} 
                      width={40} 
                      height={40} 
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    displayName[0]
                  )}
                </div>
              </div>
            </Link>
          </div>
        </header>

        <section className="p-10 animate-fade-in relative">
          {userProfile?.role === 'tecnico' && <RolloutBanner />}
          {children}
        </section>
      </main>
      <DemoEmailPreviewListener />
      <SessionHeartbeat />
    </div>
  );

  if (userProfile?.role === 'tecnico') {
    return <AvailabilityProvider>{inner}</AvailabilityProvider>;
  }
  return inner;
}
