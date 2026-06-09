export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import FauchardNav from '@/components/admin/fauchard/FauchardNav';
import GuidedDemoClient from './GuidedDemoClient';
import { BookOpen } from 'lucide-react';

export const metadata = {
  title: 'Demo Guiada Fauchard | Admin DentFlow',
};

export default async function GuidedDemoPage() {
  // Guard server-side: solo admin.
  const identity = await getServerIdentity();
  if (!identity || (identity.role !== 'admin' && !identity.isSystemAdmin)) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col gap-10 p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">
              Demo Guiada — Comportamiento Fauchard
            </h1>
          </div>
          <p className="text-faint text-sm font-medium">
            Simulación narrativa de la vida completa de un caso usando datos sintéticos. Muestra cómo operará el motor cuando la plataforma esté en producción.
          </p>
        </div>
      </header>

      <FauchardNav />

      <GuidedDemoClient />
    </div>
  );
}
