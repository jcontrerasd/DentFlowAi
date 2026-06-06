'use client';

import dynamic from 'next/dynamic';
import { Activity, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

// Recharts: cargar solo en cliente para evitar problemas de SSR.
const ObservabilityPanel = dynamic(() => import('@/components/admin/fauchard/ObservabilityPanel'), {
  ssr: false,
  loading: () => <p className="text-faint text-sm">Cargando métricas…</p>,
});

export default function AdminObservabilityPage() {
  const { userProfile, user } = useAuth();

  // Bypass de seguridad para el dueño / admin
  if ((userProfile?.role as any) !== 'admin' && user?.email !== 'jaime.contreras.d@gmail.com') {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center">
        <ShieldAlert className="w-16 h-16 text-error mb-4 animate-pulse" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Acceso Restringido</h1>
        <p className="text-faint">No tienes permisos para ver esta sección.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-[1700px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Observabilidad</h1>
          <p className="text-faint text-sm">Métricas del modelo de disponibilidad y la orquestación Fauchard.</p>
        </div>
      </div>

      <ObservabilityPanel />
    </div>
  );
}
