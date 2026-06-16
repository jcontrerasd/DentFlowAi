import { SimulatorParamHelpButton } from '../../SimulatorHelp';

export default function SimulatorField({
  label,
  helpFocusKey,
  children,
  compact = false,
}: {
  label: string;
  helpFocusKey?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <div className="flex items-center gap-1.5 px-0.5">
        <label className="text-[9px] font-bold uppercase tracking-wider text-faint">{label}</label>
        {helpFocusKey && <SimulatorParamHelpButton focusKey={helpFocusKey} label={label} />}
      </div>
      {children}
    </div>
  );
}
