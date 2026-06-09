import AvailabilityPanel from '@/components/availability/AvailabilityPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Disponibilidad | DentFlow',
};

/**
 * Panel de disponibilidad del técnico (v5.0, §10.2). El gating por
 * AVAILABILITY_UI_TECNICO_ENABLED + rol técnico lo hace AvailabilityPanel vía
 * getMyAvailabilityStatusAction (`enabled`).
 */
export default function AvailabilityPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Mi disponibilidad</h1>
        <p className="text-faint text-sm font-medium">Gestiona cuándo y para qué tipo de trabajo recibes invitaciones.</p>
      </header>
      <AvailabilityPanel />
    </div>
  );
}
