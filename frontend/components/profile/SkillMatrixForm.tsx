'use client';

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion } from 'framer-motion';
import { Save, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { getMySkillsAction, updateSkillsAction, type SkillRow } from '@/lib/db/actions/skills';
import { WORK_TYPES, WORK_TYPE_LABELS } from '@/lib/constants/dental';
import { useToast } from '@/context/ToastContext';

const LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'No aplico',  color: 'text-faint' },
  1: { label: 'Básico 1',   color: 'text-error' },
  2: { label: 'Básico 2',   color: 'text-orange-400' },
  3: { label: 'Medio 3',    color: 'text-warning' },
  4: { label: 'Medio 4',    color: 'text-warning' },
  5: { label: 'Avanzado 5', color: 'text-lime-400' },
  6: { label: 'Avanzado 6', color: 'text-primary' },
  7: { label: 'Experto 7',  color: 'text-jade' },
};

const WORK_TYPE_GROUPS: { label: string; types: string[] }[] = [
  {
    label: 'Coronas',
    types: ['corona_anterior', 'corona_posterior', 'corona_implante'],
  },
  {
    label: 'Inlays, Onlays y Carillas',
    types: ['inlay_onlay', 'carilla_unitaria', 'carillas_multiples'],
  },
  {
    label: 'Puentes y Full Arch',
    types: ['puente_3u', 'puente_4mas', 'full_arch'],
  },
  {
    label: 'Prótesis Removible',
    types: ['protesis_parcial_removible', 'protesis_total', 'sobredentadura', 'barra_implantes'],
  },
  {
    label: 'Guías Quirúrgicas',
    types: ['guia_quirurgica_simple', 'guia_quirurgica_compleja'],
  },
];

function LevelSelector({
  value,
  onChange,
  disabled = false,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-black text-faint uppercase tracking-widest">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={disabled || value === 0}
          className="w-6 h-6 rounded-lg bg-surface-2 border border-divider flex items-center justify-center text-muted hover:bg-surface-off disabled:opacity-30 transition-all flex-shrink-0"
          aria-label={`Reducir ${label}`}
        >
          <ChevronDown className="w-3 h-3" />
        </button>

        <div className="flex-1 h-6 bg-surface rounded-lg overflow-hidden border border-divider relative">
          <motion.div
            className="h-full bg-primary/25 rounded-lg"
            animate={{ width: `${(value / 7) * 100}%` }}
            transition={{ duration: 0.2 }}
          />
          <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-black uppercase tracking-wider ${LEVEL_LABELS[value]?.color}`}>
            {disabled ? '—' : LEVEL_LABELS[value]?.label}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onChange(Math.min(7, value + 1))}
          disabled={disabled || value === 7}
          className="w-6 h-6 rounded-lg bg-surface-2 border border-divider flex items-center justify-center text-muted hover:bg-surface-off disabled:opacity-30 transition-all flex-shrink-0"
          aria-label={`Aumentar ${label}`}
        >
          <ChevronUp className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export interface SkillMatrixFormHandle {
  save: () => Promise<{ success: boolean; error?: string }>;
}

interface SkillMatrixFormProps {
  compact?: boolean;
  onSaveSuccess?: () => void;
  initialCad?: boolean;
  /** Oculta el botón interno "Guardar habilidades" para guardado externo */
  hideButton?: boolean;
}

const SkillMatrixForm = forwardRef<SkillMatrixFormHandle, SkillMatrixFormProps>(function SkillMatrixForm({
  compact = false,
  onSaveSuccess,
  initialCad = false,
  hideButton = false,
}, ref) {
  const { showSuccess, showError } = useToast();
  const blankSkills = WORK_TYPES.reduce<Record<string, number>>((acc, wt) => {
    acc[wt] = 0;
    return acc;
  }, {});

  const [skills, setSkills] = useState<Record<string, number>>(blankSkills);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasCad, setHasCad] = useState(initialCad);

  useEffect(() => {
    const load = async () => {
      try {
        const rows: SkillRow[] = await getMySkillsAction();
        const map = WORK_TYPES.reduce<Record<string, number>>((acc, wt) => {
          acc[wt] = 0;
          return acc;
        }, {});
        rows.forEach(r => {
          map[r.workType] = r.designLevel;
        });
        setSkills(map);
        setHasCad(rows.some(r => r.designLevel > 0) || initialCad);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [initialCad]);

  const setSkill = (workType: string, value: number) => {
    setSkills(prev => ({ ...prev, [workType]: value }));
  };

  const getGroupLevel = (types: string[]): number =>
    Math.min(...types.map(wt => skills[wt] ?? 0));

  const setGroupLevel = (types: string[], value: number) => {
    setSkills(prev => {
      const next = { ...prev };
      types.forEach(wt => { next[wt] = value; });
      return next;
    });
  };

  const saveSkills = async (): Promise<{ success: boolean; error?: string }> => {
    if (!hasCad) {
      const msg = 'Debes habilitar Diseño (CAD) para declarar habilidades.';
      showError(msg);
      return { success: false, error: msg };
    }

    const skillsArray = Object.entries(skills).map(([workType, designLevel]) => ({
      workType,
      designLevel: hasCad ? designLevel : 0,
    }));

    const hasDesign = skillsArray.some(s => s.designLevel > 0);
    if (!hasDesign) {
      const msg = 'Declara al menos un tipo de trabajo con nivel de diseño mayor a 0.';
      showError(msg);
      return { success: false, error: msg };
    }

    const res = await updateSkillsAction(skillsArray);
    if (res.success) {
      onSaveSuccess?.();
    }
    return res;
  };

  useImperativeHandle(ref, () => ({
    save: async () => {
      setSaving(true);
      const result = await saveSkills();
      setSaving(false);
      return result;
    },
  }));

  const handleSave = async () => {
    setSaving(true);
    const res = await saveSkills();
    setSaving(false);
    if (res.success) {
      showSuccess('Habilidades guardadas correctamente');
    }
  };

  const avgLevel = (() => {
    const levels = Object.values(skills).filter(v => v > 0);
    if (levels.length === 0) return 0;
    return levels.reduce((a, b) => a + b, 0) / levels.length;
  })();

  const leagueBadge = avgLevel >= 6 ? { label: 'Élite', color: 'text-primary bg-primary-hl border-purple-500/30' }
    : avgLevel >= 4.5 ? { label: 'Oro', color: 'text-warning bg-warning-hl border-warning/20' }
    : avgLevel >= 3 ? { label: 'Plata', color: 'text-muted bg-surface-off border-divider/30' }
    : { label: 'Bronce', color: 'text-warning bg-warning-hl border-amber-700/30' };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-faint uppercase tracking-widest">Categoría estimada</p>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border mt-1 ${leagueBadge.color}`}>
              <Star className="w-3 h-3" /> {leagueBadge.label}
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => {
                if (!hasCad) {
                  setHasCad(true);
                } else {
                  showError('Debe tener Diseño habilitado para declarar habilidades');
                }
              }}
              className={`w-10 h-5 rounded-full transition-colors relative ${hasCad ? 'bg-primary' : 'bg-surface-off'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hasCad ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-muted">Diseña (CAD)</span>
          </label>
        </div>
      )}

      {WORK_TYPE_GROUPS.map(group => {
        const groupDesign = getGroupLevel(group.types);
        return (
          <div key={group.label} className="bg-surface/40 border border-divider rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-divider bg-surface-off/40 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <p className="text-[10px] font-black text-muted uppercase tracking-widest">{group.label}</p>
              <LevelSelector
                label="Diseño (grupo)"
                value={hasCad ? groupDesign : 0}
                onChange={v => setGroupLevel(group.types, v)}
                disabled={!hasCad}
              />
            </div>
            <div className="divide-y divide-white/5">
              {group.types.map(wt => (
                <div key={wt} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pl-6">
                  <span className="text-xs text-muted">
                    {WORK_TYPE_LABELS[wt] || wt}
                  </span>
                  <LevelSelector
                    label="Diseño"
                    value={hasCad ? (skills[wt] ?? 0) : 0}
                    onChange={v => setSkill(wt, v)}
                    disabled={!hasCad}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!hideButton && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 bg-primary hover:opacity-90 text-inverse font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
            : <Save className="w-4 h-4" />}
          {saving ? 'Guardando...' : 'Guardar habilidades'}
        </button>
      )}
    </div>
  );
});

export default SkillMatrixForm;
