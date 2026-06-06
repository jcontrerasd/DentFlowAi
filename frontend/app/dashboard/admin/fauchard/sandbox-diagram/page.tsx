export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import { getFauchardConfigAction } from '@/lib/db/actions/fauchard';
import FauchardNav from '@/components/admin/fauchard/FauchardNav';
import SandboxDiagramClient from './SandboxDiagramClient';
import { Settings2, AlertTriangle, Activity } from 'lucide-react';

export const metadata = {
  title: 'Sandbox Visual Fauchard | Admin DentFlow',
};

export default async function SandboxDiagramPage() {
  // Guard server-side: solo admin.
  const identity = await getServerIdentity();
  if (!identity || (identity.role !== 'admin' && !identity.isSystemAdmin)) {
    redirect('/dashboard');
  }

  const res = await getFauchardConfigAction();

  if (!res.success) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-[2rem] bg-error-hl border border-error/30 flex items-center justify-center text-error">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-black text-foreground uppercase tracking-tighter">Error</h1>
        <p className="text-faint text-sm">{res.error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary animate-pulse">
              <Activity className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Esquema Vivo Fauchard</h1>
          </div>
          <p className="text-faint text-sm font-medium">Visualiza en tiempo real el impacto de cada parámetro en la selección y la salud del marketplace.</p>
        </div>
      </header>

      <FauchardNav />

      <SandboxDiagramClient initialConfig={res.config} />
    </div>
  );
}
