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
  initialCam?: boolean;
  /** Oculta el botón interno "Guardar habilidades" para guardado externo */
  hideButton?: boolean;
}

const SkillMatrixForm = forwardRef<SkillMatrixFormHandle, SkillMatrixFormProps>(function SkillMatrixForm({
  compact = false,
  onSaveSuccess,
  initialCad = false,
  initialCam = false,
  hideButton = false,
}, ref) {
  const { showSuccess, showError } = useToast();
  const blankSkills = WORK_TYPES.reduce<Record<string, { design: number; fab: number }>>((acc, wt) => {
    acc[wt] = { design: 0, fab: 0 };
    return acc;
  }, {});

  const [skills, setSkills] = useState<Record<string, { design: number; fab: number }>>(blankSkills);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasCad, setHasCad] = useState(initialCad);
  const [hasCam, setHasCam] = useState(initialCam);

  useEffect(() => {
    const load = async () => {
      try {
        const rows: SkillRow[] = await getMySkillsAction();
        const map = WORK_TYPES.reduce<Record<string, { design: number; fab: number }>>((acc, wt) => {
          acc[wt] = { design: 0, fab: 0 };
          return acc;
        }, {});
        rows.forEach(r => {
          map[r.workType] = {
            design: r.designLevel,
            fab: r.fabricationLevel,
          };
        });
        setSkills(map);
        // Detectar si tiene CAD (alguna design > 0) o si initialCad es true
        setHasCad(rows.some(r => r.designLevel > 0) || initialCad);
        // Detectar si tiene CAM (alguna fab > 0) o si initialCam es true
        setHasCam(rows.some(r => r.fabricationLevel > 0) || initialCam);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [initialCad, initialCam]);

  const setSkill = (workType: string, field: 'design' | 'fab', value: number) => {
    setSkills(prev => ({
      ...prev,
      [workType]: { ...(prev[workType] || { design: 0, fab: 0 }), [field]: value },
    }));
  };

  const getGroupLevel = (types: string[], field: 'design' | 'fab'): number =>
    Math.min(...types.map(wt => skills[wt]?.[field] ?? 0));

  const setGroupLevel = (types: string[], field: 'design' | 'fab', value: number) => {
    setSkills(prev => {
      const next = { ...prev };
      types.forEach(wt => {
        next[wt] = { ...(next[wt] || { design: 0, fab: 0 }), [field]: value };
      });
      return next;
    });
  };

  const saveSkills = async (): Promise<{ success: boolean; error?: string }> => {
    if (!hasCad && !hasCam) {
      const msg = 'Debes habilitar al menos Diseño o Fabricación.';
      showError(msg);
      return { success: false, error: msg };
    }

    const skillsArray = Object.entries(skills).map(([workType, v]) => ({
      workType,
      designLevel: hasCad ? v.design : 0,
      fabricationLevel: hasCam ? v.fab : 0,
    }));

    if (hasCad && !hasCam) {
      const hasDesign = skillsArray.some(s => s.designLevel > 0);
      if (!hasDesign) {
        const msg = 'Declara al menos un tipo de trabajo con nivel de diseño mayor a 0.';
        showError(msg);
        return { success: false, error: msg };
      }
    } else if (!hasCad && hasCam) {
      const hasFab = skillsArray.some(s => s.fabricationLevel > 0);
      if (!hasFab) {
        const msg = 'Declara al menos un tipo de trabajo con nivel de fabricación mayor a 0.';
        showError(msg);
        return { success: false, error: msg };
      }
    } else {
      const hasAny = skillsArray.some(s => s.designLevel > 0 || s.fabricationLevel > 0);
      if (!hasAny) {
        const msg = 'Declara al menos un tipo de trabajo con nivel mayor a 0.';
        showError(msg);
        return { success: false, error: msg };
      }
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

  // Calcula la categoría aproximada basada en el promedio de niveles declarados
  const avgLevel = (() => {
    const levels = Object.values(skills).map(s => s.design).filter(v => v > 0);
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
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => {
                  if (!hasCad) {
                    setHasCad(true);
                  } else if (hasCam) {
                    setHasCad(false);
                  } else {
                    showError('Debe haber al menos un servicio habilitado');
                  }
                }}
                className={`w-10 h-5 rounded-full transition-colors relative ${hasCad ? 'bg-primary' : 'bg-surface-off'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hasCad ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-muted">Diseña (CAD)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => {
                  if (!hasCam) {
                    setHasCam(true);
                  } else if (hasCad) {
                    setHasCam(false);
                  } else {
                    showError('Debe haber al menos un servicio habilitado');
                  }
                }}
                className={`w-10 h-5 rounded-full transition-colors relative ${hasCam ? 'bg-primary' : 'bg-surface-off'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hasCam ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-muted">Fabrica (CAM)</span>
            </label>
          </div>
        </div>
      )}



      {WORK_TYPE_GROUPS.map(group => {
        const groupDesign = getGroupLevel(group.types, 'design');
        const groupFab = getGroupLevel(group.types, 'fab');
        return (
          <div key={group.label} className="bg-surface/40 border border-divider rounded-2xl overflow-hidden">
            {/* Header del grupo con selectores de nivel masivo */}
            <div className="px-4 py-3 border-b border-divider bg-surface-off/40 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <p className="text-[10px] font-black text-muted uppercase tracking-widest">{group.label}</p>
              <LevelSelector
                label="Diseño (grupo)"
                value={hasCad ? groupDesign : 0}
                onChange={v => setGroupLevel(group.types, 'design', v)}
                disabled={!hasCad}
              />
              <LevelSelector
                label="Fabricación (grupo)"
                value={hasCam ? groupFab : 0}
                onChange={v => setGroupLevel(group.types, 'fab', v)}
                disabled={!hasCam}
              />
            </div>
            {/* Filas individuales */}
            <div className="divide-y divide-white/5">
              {group.types.map(wt => {
                const current = skills[wt] || { design: 0, fab: 0 };
                return (
                  <div key={wt} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pl-6">
                    <span className="text-xs text-muted">
                      {WORK_TYPE_LABELS[wt] || wt}
                    </span>
                    <LevelSelector
                      label="Diseño"
                      value={hasCad ? current.design : 0}
                      onChange={v => setSkill(wt, 'design', v)}
                      disabled={!hasCad}
                    />
                    <LevelSelector
                      label="Fabricación"
                      value={hasCam ? current.fab : 0}
                      onChange={v => setSkill(wt, 'fab', v)}
                      disabled={!hasCam}
                    />
                  </div>
                );
              })}
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
