import type { LucideIcon } from 'lucide-react';

export default function SimulatorStatCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-6 rounded-3xl border flex items-center gap-4 ${
        highlight ? 'bg-primary/5 border-primary/30' : 'bg-surface/40 border-divider'
      }`}
    >
      <Icon className={`w-6 h-6 ${highlight ? 'text-primary' : 'text-muted'}`} />
      <div>
        <span className="text-[9px] font-black uppercase text-faint block">{label}</span>
        <span className="text-xl font-black text-foreground">{value}</span>
      </div>
    </div>
  );
}
