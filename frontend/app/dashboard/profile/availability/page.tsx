'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import AvailabilityPanel from '@/components/availability/AvailabilityPanel';

export default function AvailabilityPage() {
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header className="space-y-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors duration-150 mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
        <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Mi disponibilidad</h1>
        <p className="text-faint text-sm font-medium">Gestiona cuándo y para qué tipo de trabajo recibes invitaciones.</p>
      </header>
      <AvailabilityPanel />
    </div>
  );
}
