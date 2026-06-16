export default function SimulatorBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[10px] font-bold uppercase px-3 py-1 rounded-full bg-surface border border-divider text-muted">
      {label}: <span className="text-foreground">{value}</span>
    </span>
  );
}
