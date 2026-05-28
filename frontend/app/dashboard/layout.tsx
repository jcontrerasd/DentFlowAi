'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  ShoppingBag,
  FileText,
  LogOut,
  Menu,
  Activity,
  ShieldAlert,
  Inbox,
  Settings2,
  Bell,
  CreditCard,
} from 'lucide-react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useAuth } from '@/context/AuthContext';
import { getSignedUrlAction } from '@/lib/db/actions/cases';
import { getMyInvitationsAction } from '@/lib/db/actions/invitations';
import { getMyHubUnreadTotalAction } from '@/lib/db/actions/hubRead';
import ImpersonationSelector from '@/components/admin/ImpersonationSelector';
import ThemeToggleButton from '@/components/theme/ThemeToggleButton';
import Image from 'next/image';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { user, userProfile, loading, isSimulating } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [hubBellTotal, setHubBellTotal] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (userProfile?.image) {
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
    }
  }, [loading, user, userProfile, router]);


  const handleLogout = async () => {
    localStorage.removeItem('dentflow_simulated_id');
    await signOut({ callbackUrl: '/auth/login' });
  };

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    
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
    
    // Rutas para Admin
    ...(userProfile?.role === 'admin' ? [
      { name: 'Admin', icon: ShieldAlert, href: '/dashboard/admin' },
      { name: 'Fauchard', icon: Settings2, href: '/dashboard/admin/fauchard' },
    ] : []),
  ];

  if (loading || !userProfile) return (
    <div className="h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary/30 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );

  const displayName = userProfile?.fullName ?? user?.name ?? 'Usuario DentFlow';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full bg-surface backdrop-blur-xl border-r border-divider transition-all duration-300 z-50 ${isSidebarOpen ? 'w-64' : 'w-20'}`}
      >
        <div className="p-6 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-surface rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-sm overflow-hidden">
            <Image src="/dentflowai.jpg" alt="DentFlowAi" width={40} height={40} className="w-full h-full object-cover" />
          </div>
          {isSidebarOpen && <span className="text-xl serif-font font-bold text-foreground">DentFlowAi</span>}
        </div>

        {(userProfile?.role === 'admin' || isSimulating || user?.email === 'jaime.contreras.d@gmail.com') && isSidebarOpen && (
          <div className="px-4 mb-3">
            <ImpersonationSelector />
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

        <div className="absolute bottom-8 left-0 w-full px-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-3 text-faint hover:text-error hover:bg-error-hl rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {isSidebarOpen && <span className="font-medium">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 min-h-screen ${isSidebarOpen ? 'pl-64' : 'pl-20'}`}>
        <header className="h-20 border-b border-divider/50 flex items-center justify-between px-10 bg-surface shadow-sm border border-divider sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-muted hover:text-foreground transition-colors">
              <Menu className="w-6 h-6" />
            </button>
          </div>

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
          {children}
        </section>
      </main>
    </div>
  );
}
