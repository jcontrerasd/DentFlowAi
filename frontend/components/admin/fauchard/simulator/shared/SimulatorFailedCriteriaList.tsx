import type { FailedCriterion } from '@/lib/fauchard/simulationHelpers';

export default function SimulatorFailedCriteriaList({
  criteria,
  compact = false,
}: {
  criteria: FailedCriterion[];
  compact?: boolean;
}) {
  if (criteria.length === 0) return null;

  return (
    <ul className={compact ? 'space-y-2' : 'space-y-3'}>
      {criteria.map((c) => (
        <li
          key={c.reason}
          className={`rounded-xl border border-error/25 bg-surface/60 ${
            compact ? 'p-2.5' : 'p-3.5'
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <span className={`font-bold text-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {c.criterionName}
            </span>
            <span className="text-[10px] font-mono text-error font-bold">{c.count} téc.</span>
          </div>
          <p className={`text-muted leading-snug ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
            {c.whatFailed}
          </p>
          <p className={`text-primary mt-1.5 leading-snug ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
            <span className="font-bold">Cómo resolver: </span>
            {c.howToFix}
          </p>
        </li>
      ))}
    </ul>
  );
}
