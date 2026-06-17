import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { SimulatorParamHelpButton } from '../../SimulatorHelp';
import type { ParamGroup } from '../simulatorConstants';

export default function SimulatorActiveConfigRows({
  groups,
  currentConfig,
  title = 'Parámetros activos',
  subtitle = 'Valores de la config activa que afectan esta simulación.',
  showEditLink = true,
}: {
  groups: ParamGroup[];
  currentConfig: Record<string, unknown>;
  title?: string;
  subtitle?: string;
  showEditLink?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-5 h-5 text-primary shrink-0" />
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h3>
            <p className="text-[9px] text-faint mt-0.5">{subtitle}</p>
          </div>
        </div>
        {showEditLink && (
          <Link
            href="/dashboard/admin/fauchard"
            className="text-[9px] font-bold uppercase text-primary hover:underline shrink-0"
          >
            Editar →
          </Link>
        )}
      </div>
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.group} className="space-y-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-faint px-1">{g.group}</span>
            <div className="grid grid-cols-1 gap-1">
              {g.items.map((it, idx) => {
                const raw = currentConfig?.[it.key];
                const val = raw === undefined || raw === null ? '—' : `${raw}${it.suffix ? ` ${it.suffix}` : ''}`;
                return (
                  <div
                    key={`${it.key}-${idx}`}
                    className="flex items-center justify-between text-[11px] px-2 py-1 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="flex items-center gap-1 text-muted">
                      {it.label}
                      <SimulatorParamHelpButton focusKey={it.helpKey ?? it.key} label={it.label} />
                    </span>
                    <span className="font-mono font-bold text-foreground">{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
