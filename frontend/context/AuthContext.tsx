import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { getUserProfileDirect } from '@/lib/db/actions/user';
import { startSimulationAction, stopSimulationAction } from '@/lib/db/actions/impersonation';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: 'dentista' | 'tecnico' | 'admin' | null;
  onboardingStep: number | null;
  phone: string | null;
  specialty: string | null;
  registrationNumber: string | null;
  suspendedUntil?: string | null;
  organization?: {
    id: string;
    name: string;
    type: string;
    rut?: string | null;
    logoUrl?: string | null;
    technicalCapabilities?: string[] | null;
  } | null;
  image?: string | null;
  experienceYears?: number | null;
  bio?: string | null;
}

interface AuthContextType {
  user: any | null; 
  userProfile: UserProfile | null;
  loading: boolean;
  isSimulating: boolean;
  simulatedProfile: UserProfile | null;
  startSimulation: (userId: string) => Promise<void>;
  stopSimulation: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfileOptimistically: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  isSimulating: false,
  simulatedProfile: null,
  startSimulation: async () => {},
  stopSimulation: async () => {},
  refreshProfile: async () => {},
  updateProfileOptimistically: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  // Tracks whether at least one real fetch has completed (success or failure).
  // Prevents loading=true indefinitely when getUserProfileDirect returns null.
  const [profileFetchAttempted, setProfileFetchAttempted] = useState(false);

  // Estados para simulación
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedProfile, setSimulatedProfile] = useState<UserProfile | null>(null);

  const fetchProfile = useCallback(async (userId: string, isSimulated: boolean = false) => {
    if (!isSimulated) setProfileLoading(true);
    try {
      const profile = await getUserProfileDirect(userId);
      if (isSimulated) {
        if (profile) {
          setSimulatedProfile(profile as UserProfile);
          setIsSimulating(true);
        } else {
          // Stale simId — user was deleted. Clear it so admin sees their own profile.
          localStorage.removeItem('dentflow_simulated_id');
        }
      } else {
        setUserProfile(profile as UserProfile);
      }
    } catch (err) {
      console.error('[AuthContext] Failed to fetch profile:', err);
    } finally {
      if (!isSimulated) {
        setProfileLoading(false);
        setProfileFetchAttempted(true);
      }
    }
  }, []);

  // Función para iniciar simulación
  const startSimulation = async (userId: string) => {
    try {
      const res = await startSimulationAction(userId);
      if (res.success) {
        localStorage.setItem('dentflow_simulated_id', userId);
        window.location.href = '/dashboard';
      } else {
        alert(res.error || "No se pudo iniciar la simulación");
      }
    } catch (err) {
      console.error("Simulation error:", err);
    }
  };

  // Función para detener simulación
  const stopSimulation = async () => {
    try {
      await stopSimulationAction();
      localStorage.removeItem('dentflow_simulated_id');
      window.location.href = '/dashboard';
    } catch (err) {
      console.error("Stop simulation error:", err);
    }
  };

  const refreshProfile = async () => {
    if (session?.user?.id) await fetchProfile(session.user.id);
  };

  const updateProfileOptimistically = (updates: Partial<UserProfile>) => {
    if (isSimulating) {
      setSimulatedProfile((prev) => {
        if (prev) return { ...prev, ...updates } as UserProfile;
        return null;
      });
    } else {
      setUserProfile((prev) => {
        if (prev) return { ...prev, ...updates } as UserProfile;
        return null;
      });
    }
  };

  // Sync con sesión real y persistencia local de simulación
  useEffect(() => {
    const userId = session?.user?.id;
    if (status === 'authenticated' && userId) {
      if (!userProfile) {
        fetchProfile(userId);
      }
      
      // Solo activar simulación si el usuario actual es admin
      const sessionUser = session?.user as any;
      const isAdmin = sessionUser?.role === 'admin' ||
                      sessionUser?.email === 'jaime.contreras.d@gmail.com' ||
                      sessionUser?.email?.endsWith('@dentflow.ai');

      const simId = localStorage.getItem('dentflow_simulated_id');
      if (!isAdmin) {
        // Usuario no-admin no debe tener estado de simulación residual
        if (simId) localStorage.removeItem('dentflow_simulated_id');
        if (isSimulating) {
          setIsSimulating(false);
          setSimulatedProfile(null);
        }
      } else if (simId && !simulatedProfile) {
        fetchProfile(simId, true);
      }
    } else if (status === 'unauthenticated') {
      setUserProfile(null);
      setSimulatedProfile(null);
      setIsSimulating(false);
      setProfileLoading(false);
      setProfileFetchAttempted(false);
    }
  }, [session?.user?.id, status, fetchProfile, userProfile, simulatedProfile, isSimulating]);

  const value = {
    user: session?.user || null,
    userProfile: isSimulating ? simulatedProfile : userProfile, // Exportamos el perfil simulado como principal si aplica
    // loading=true while: session resolving, OR authenticated but fetch not yet attempted, OR fetch in progress.
    // profileFetchAttempted prevents both the premature-redirect race and an infinite spinner
    // when getUserProfileDirect returns null after a completed fetch.
    loading: status === 'loading' || (status === 'authenticated' && (!profileFetchAttempted || profileLoading)),
    isSimulating,
    simulatedProfile,
    startSimulation,
    stopSimulation,
    refreshProfile,
    updateProfileOptimistically
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
